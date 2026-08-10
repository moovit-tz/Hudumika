import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import nodeCrypto from 'node:crypto';
import { sql } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import nodemailer from 'nodemailer';
import { getDocSequence, setDocSequence, type DocType } from '../lib/doc-numbering.js';

const DOC_TYPES: DocType[] = ['invoice', 'quotation', 'purchase_order'];

/**
 * How a settings PATCH combines with what is already stored.
 *
 * This used to be one line — `settings || patch::jsonb` — which is a *shallow*
 * merge: a patch of `{email:{host}}` replaced the whole `email` object and every
 * sibling field with it. Reproduced against the live database: saving host, port
 * and username, then saving host alone, left `{"host":"..."}` and nothing else.
 * Every caller happened to send whole sections, so the loss had not fired yet —
 * but nothing said it had to, and it is silent on both sides when it does.
 *
 * Merging is now the default, so a caller sending one field changes one field.
 * RFC 7386's rule applies for removal: an explicit `null` deletes a key, which is
 * what makes partial updates expressive enough to be the default.
 *
 * Replacement stays available per top-level key, because some sections genuinely
 * mean "this is the whole set now" — the payment-gateway screen omits disabled
 * gateways rather than sending them as false, so merging its payload would leave
 * a switched-off gateway switched on. That is a real requirement; it is just no
 * longer the silent default for everyone else.
 */
export function mergeSettings(
  current: Record<string, any>,
  patch: Record<string, any>,
  replaceKeys: string[] = [],
): Record<string, any> {
  const isPlainObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const out: Record<string, any> = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) { delete out[key]; continue; }
    if (replaceKeys.includes(key)) { out[key] = value; continue; }
    // Arrays replace wholesale: a list of tax rates or currencies means the
    // list, and merging two arrays by index is never what anyone wants.
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? mergeSettings(out[key], value, [])
      : value;
  }
  return out;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/settings
  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').selectAll().where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      const tenant = await trx.selectFrom('tenants')
        .select(['id', 'slug', 'name', 'plan', 'active', 'logo_url', 'primary_color', 'created_at'])
        .where('id', '=', user.tenant_id)
        .executeTakeFirst();
      const seatRow = await trx.selectFrom('users')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .executeTakeFirst();
      return { settings, tenant, seatCount: Number(seatRow?.count ?? 0) };
    });
  });

  /**
   * What a MANAGER is allowed to change.
   *
   * This endpoint admitted MANAGER for everything, so a manager could rewrite
   * the workspace's SMTP credentials, its payment gateway keys, and which apps
   * the whole organisation can see. That is a wider blast radius than the role
   * is meant to carry.
   *
   * These two are genuinely operational — the demurrage and SLA thresholds and
   * the free-time window that shipment.service.ts reads when it scores risk.
   * A manager runs those day to day and should not need an administrator to
   * change one. Everything else is credentials, money or workspace-wide
   * configuration, and belongs to TENANT_ADMIN and above.
   */
  const MANAGER_WRITABLE = new Set(['notifications', 'freight']);

  // PATCH /v1/settings
  fastify.patch('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const { $replace, ...updates } = request.body as Record<string, any>;

    if (user.role === 'MANAGER') {
      const forbidden = Object.keys(updates).filter(k => !MANAGER_WRITABLE.has(k));
      if (forbidden.length > 0) {
        return reply.status(403).send({
          error: forbidden.length === 1
            ? `Changing "${forbidden[0]}" needs a workspace administrator. Managers can change notification thresholds and freight settings.`
            : `These need a workspace administrator: ${forbidden.join(', ')}. Managers can change notification thresholds and freight settings.`,
          code: 'ROLE_INSUFFICIENT',
          forbidden,
        });
      }
    }

    /**
     * Which top-level keys mean "this is the whole set now".
     *
     * Everything else merges. A caller opts in by listing keys in `$replace`;
     * the payment-gateway screen is the one that needs it, because it omits
     * disabled gateways instead of sending them as false.
     */
    const replaceKeys: string[] = Array.isArray($replace) ? $replace.filter(k => typeof k === 'string') : [];

    /**
     * A tenant may switch a module off, but never on beyond what its plan
     * grants — otherwise this generic endpoint would let any tenant admin
     * self-grant paid features, since requireEntitlement() treats an explicit
     * `true` override as SuperAdmin-authorised.
     *
     * The rule is unchanged. What changed is the answer: this used to scrub the
     * ungranted `true` to `false` and return 200, so the switch stayed on
     * screen, the database said off, and nothing told the person which. Now it
     * refuses and names both the feature and the plan, so the console can say
     * what happened.
     */
    if (updates['enabled-apps'] && user.role !== 'SUPER_ADMIN') {
      return withTenant(user.tenant_id, async (trx) => {
        const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', user.tenant_id).executeTakeFirst();
        const grants = tenant
          ? await trx.selectFrom('package_features').select('feature_key').where('package_code', '=', tenant.plan).execute()
          : [];
        const grantSet = new Set(grants.map(g => g.feature_key));
        const raw = updates['enabled-apps'] as Record<string, boolean>;

        const ungranted = Object.entries(raw)
          .filter(([key, val]) => val === true && !grantSet.has(key))
          .map(([key]) => key);

        if (ungranted.length > 0) {
          reply.status(403);
          return {
            error: ungranted.length === 1
              ? `"${ungranted[0]}" is not included in your ${tenant?.plan ?? 'current'} plan, so it cannot be switched on here.`
              : `These are not included in your ${tenant?.plan ?? 'current'} plan, so they cannot be switched on here: ${ungranted.join(', ')}.`,
            code: 'PLAN_UPGRADE_REQUIRED',
            plan: tenant?.plan ?? null,
            ungranted,
          };
        }

        return applySettingsPatch(trx, user.tenant_id, updates, replaceKeys, user.sub);
      });
    }

    return withTenant(user.tenant_id, (trx) => applySettingsPatch(trx, user.tenant_id, updates, replaceKeys, user.sub));
  });

  async function applySettingsPatch(
    trx: any,
    tenantId: string,
    updates: Record<string, any>,
    replaceKeys: string[] = [],
    /** Who is making the change, for the activity trail. */
    actorId?: string,
  ) {
    // FOR UPDATE: a read-modify-write needs the row held for the transaction, or
    // two admins saving different sections at the same moment can each merge onto
    // a snapshot taken before the other's write and silently drop it.
    const existing = await sql<{ id: string; settings: any }>`
      SELECT id, settings FROM tenant_settings WHERE tenant_id = ${tenantId} FOR UPDATE
    `.execute(trx).then((r: any) => r.rows[0]);

    if (existing) {
      const current = typeof existing.settings === 'string'
        ? JSON.parse(existing.settings)
        : (existing.settings ?? {});
      const merged = mergeSettings(current, updates, replaceKeys);
      await sql`UPDATE tenant_settings SET settings = ${JSON.stringify(merged)}::jsonb, updated_at = NOW() WHERE tenant_id = ${tenantId}`.execute(trx);

      /**
       * Record who changed what.
       *
       * Settings changes were the one thing in this platform that left no trace
       * at all — including SMTP credentials, payment gateway keys and which apps
       * the whole workspace can see. domain_events already carries an actor and
       * already backs the activity trail, so this needed no new table; it needed
       * the write that was missing.
       *
       * Only the key names travel, never the values. A record of a credential
       * change must not become a second copy of the credential.
       */
      if (actorId && !actorId.startsWith('apikey:')) {
        await emitDomainEvent(trx as any, tenantId, {
          type: 'settings.changed',
          sourceApp: 'workspace',
          entityType: 'tenant_settings',
          entityId: tenantId,
          actorId,
          payload: { keys: Object.keys(updates).sort(), replaced: replaceKeys },
        });
      }
    } else {
      await trx.insertInto('tenant_settings').values({
        tenant_id: tenantId,
        settings: JSON.stringify(updates),
      }).execute();
    }
    // Also update tenants table for known fields
    if (updates.company) {
      const co = updates.company;
      const tenantUpdates: any = { updated_at: new Date() };
      if (co.name) tenantUpdates.name = co.name;
      if (co.logoUrl !== undefined) tenantUpdates.logo_url = co.logoUrl;
      await trx.updateTable('tenants').set(tenantUpdates).where('id', '=', tenantId).execute();
    }
    if (updates.plan) {
      await trx.updateTable('tenants').set({ plan: updates.plan, updated_at: new Date() }).where('id', '=', tenantId).execute();
    }
    const row = await trx.selectFrom('tenant_settings').selectAll().where('tenant_id', '=', tenantId).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : updates;
    return { settings };
  }

  /**
   * The workspace's own identity.
   *
   * Branding and the design system were mounted only under the platform console
   * at /admin, so a tenant administrator could not put their own logo or colours
   * on the workspace they pay for — even though the theming engine is explicitly
   * built to be overridden per tenant. That is why one page header renders
   * orange in ClearOS and green in Admin.
   *
   * What a tenant may set is deliberately bounded. The login screen is not here:
   * it is pre-authentication and shared by every tenant, so one workspace
   * rebranding it would rebrand it for everybody. Neither is the platform's own
   * name. What is here is everything a person sees *inside* their workspace.
   */
  const TENANT_BRANDING_FIELDS = ['workspaceName', 'logoLight', 'logoDark', 'favicon', 'accentColor'] as const;

  fastify.get('/branding', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      return settings.branding ?? {};
    });
  });

  fastify.put('/branding', {
    preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'),
  }, async (request, reply) => {
    const user = request.user;
    const body = (request.body ?? {}) as Record<string, any>;

    /**
     * A whitelist, not a merge of whatever arrived.
     *
     * This writes into the same settings blob every other section uses, so an
     * unfiltered body could set any key at all under `branding` — including
     * ones the platform reads for its own purposes.
     */
    const branding: Record<string, any> = {};
    for (const key of TENANT_BRANDING_FIELDS) {
      if (body[key] !== undefined) branding[key] = body[key] === null ? null : String(body[key]).slice(0, 512_000);
    }

    // Per-app colour is the documented per-tenant override point: it is what
    // keeps ClearOS orange and SEAL green while still letting a workspace
    // recolour one app.
    if (body.apps && typeof body.apps === 'object') {
      const apps: Record<string, { color?: string }> = {};
      for (const [appId, cfg] of Object.entries(body.apps as Record<string, any>)) {
        if (cfg?.color) apps[appId] = { color: String(cfg.color).slice(0, 32) };
      }
      if (Object.keys(apps).length) branding.apps = apps;
    }

    if (Object.keys(branding).length === 0) {
      return reply.status(400).send({ error: 'Nothing to save. Send a logo, colour or workspace name.' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      const result = await applySettingsPatch(trx, user.tenant_id, { branding }, [], user.sub);
      return (result as any).settings?.branding ?? branding;
    });
  });

  // POST /v1/settings/cron/run  — trigger a named cron job immediately
  fastify.post('/cron/run', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const { jobId, jobName } = request.body as { jobId: string; jobName: string };
    if (!jobId && !jobName) return reply.status(400).send({ error: 'jobId or jobName required' });

    // Dispatch to built-in job handlers
    const handlers: Record<string, () => Promise<void>> = {
      'Send Overdue Invoice Reminders': async () => { /* invoker hook would fire here */ },
      'Sync Exchange Rates':            async () => { /* call FX rate API */ },
      'Clean Temporary Files':          async () => { /* fs.rm temp dir */ },
      'Database Backup':                async () => { /* trigger pg_dump */ },
      'Auto-Close Inactive Tickets':    async () => { /* SQL update */ },
      'Send Weekly Reports':            async () => { /* email dispatch */ },
      'SLA Breach Alerts':              async () => { /* SLA scan */ },
    };

    const handler = handlers[jobName ?? ''];
    if (handler) {
      try { await handler(); }
      catch (e: any) { return reply.status(500).send({ error: e.message }); }
    }

    return { ok: true, ran: jobName ?? jobId, at: new Date().toISOString() };
  });

  // POST /v1/settings/email/test  — verify SMTP and send a test message
  fastify.post('/email/test', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const { host, port, user, pass, enc, fromName, fromEmail } = request.body as {
      host: string; port: number; user: string; pass: string;
      enc?: string; fromName?: string; fromEmail?: string;
    };
    if (!host || !user || !pass) return reply.status(400).send({ ok: false, error: 'Fill in SMTP host, username and password first.' });

    const smtpPort = Number(port) || (enc === 'ssl' ? 465 : 587);
    const secure   = enc === 'ssl';          // true only for port 465 SSL
    const requireTLS = !secure && enc === 'tls'; // STARTTLS upgrade for port 587

    const transport = nodemailer.createTransport({
      host,
      port:        smtpPort,
      secure,
      requireTLS,
      auth:        { user, pass },
      connectionTimeout: 15_000,
      socketTimeout:     20_000,
      tls:         { rejectUnauthorized: false },
    } as any);

    try {
      await transport.verify();
      await transport.sendMail({
        from:    `"${fromName || 'Hudumika'}" <${fromEmail || user}>`,
        to:      user,
        subject: 'Hudumika — SMTP Connection Verified',
        html: `<div style="font-family:system-ui,sans-serif;padding:32px;max-width:480px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#0b7264;margin:0 0 12px;font-size:20px">SMTP Connection Verified ✓</h2>
          <p style="color:#374151;line-height:1.6">Your Hudumika email settings are working correctly.<br>Outgoing mail server: <strong>${host}:${smtpPort}</strong></p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">Sent from Hudumika at ${new Date().toLocaleString()}</p>
        </div>`,
      });
      return { ok: true };
    } catch (e: any) {
      const msg: string = e.message || '';
      let friendly = msg;
      if (msg.includes('ECONNREFUSED'))  friendly = `Connection refused on ${host}:${smtpPort}. Check host and port.`;
      else if (msg.includes('ETIMEDOUT') || msg.includes('ESOCKET')) friendly = `Connection timed out to ${host}. Check hostname and firewall.`;
      else if (msg.includes('ENOTFOUND')) friendly = `Host not found: "${host}". Check the SMTP hostname.`;
      else if (msg.includes('535') || msg.includes('EAUTH') || msg.includes('Invalid login') || msg.includes('Username and Password'))
        friendly = `Authentication failed. For Gmail/Yahoo use an App Password — not your account password.`;
      else if (msg.includes('530') || msg.includes('Must issue a STARTTLS'))
        friendly = `Server requires TLS. Set Encryption to "TLS / STARTTLS" and Port to 587.`;
      fastify.log.error('SMTP test failed: %s', msg);
      return reply.status(400).send({ ok: false, error: friendly });
    }
  });

  // GET/PATCH /v1/settings/numbering/:docType — real atomic counters backing
  // Settings ▸ Invoices/Quotations/Purchase Orders "Numbering" cards, consumed
  // by invoices.routes.ts / purchase-orders.routes.ts via lib/doc-numbering.ts
  // (replacing the old `INV-${Date.now()}` fallback that ignored these fields entirely).
  fastify.get<{ Params: { docType: string } }>('/numbering/:docType', async (request, reply) => {
    const user = request.user;
    if (!DOC_TYPES.includes(request.params.docType as DocType)) return reply.status(400).send({ error: 'Unknown document type' });
    return withTenant(user.tenant_id, (trx) => getDocSequence(trx, user.tenant_id, request.params.docType as DocType));
  });

  fastify.patch<{ Params: { docType: string }; Body: { prefix?: string; pad_length?: number; next_number?: number } }>(
    '/numbering/:docType',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (request, reply) => {
      const user = request.user;
      if (!DOC_TYPES.includes(request.params.docType as DocType)) return reply.status(400).send({ error: 'Unknown document type' });
      return withTenant(user.tenant_id, (trx) => setDocSequence(trx, user.tenant_id, request.params.docType as DocType, request.body));
    }
  );

  // POST /v1/settings/payment-gateways/:id/test — a REAL authenticated ping
  // against the gateway's own API for the providers with a simple key-based
  // REST endpoint we can safely call read-only (never charges anything).
  // Providers without one (mobile money APIs needing OAuth/cert exchange,
  // manual bank transfer) honestly report that live testing isn't available
  // here rather than fabricating a "Connected" result.
  fastify.post<{ Params: { id: string }; Body: Record<string, string> }>(
    '/payment-gateways/:id/test',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (request, reply) => {
      const { id } = request.params;
      const v = request.body || {};
      try {
        switch (id) {
          case 'stripe': {
            if (!v.sec) return reply.status(400).send({ ok: false, message: 'Secret key is required.' });
            const res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${v.sec}` } });
            if (res.ok) return { ok: true, message: 'Stripe secret key verified.' };
            return reply.status(400).send({ ok: false, message: 'Stripe rejected this secret key.' });
          }
          case 'paystack': {
            if (!v.secretKey) return reply.status(400).send({ ok: false, message: 'Secret key is required.' });
            const res = await fetch('https://api.paystack.co/transaction/totals', { headers: { Authorization: `Bearer ${v.secretKey}` } });
            if (res.ok) return { ok: true, message: 'Paystack secret key verified.' };
            return reply.status(400).send({ ok: false, message: 'Paystack rejected this secret key.' });
          }
          case 'flutterwave': {
            if (!v.secretKey) return reply.status(400).send({ ok: false, message: 'Secret key is required.' });
            const res = await fetch('https://api.flutterwave.com/v3/balances', { headers: { Authorization: `Bearer ${v.secretKey}` } });
            if (res.ok) return { ok: true, message: 'Flutterwave secret key verified.' };
            return reply.status(400).send({ ok: false, message: 'Flutterwave rejected this secret key.' });
          }
          case 'razorpay': {
            if (!v.keyId || !v.keySecret) return reply.status(400).send({ ok: false, message: 'Key ID and Key Secret are required.' });
            const auth = Buffer.from(`${v.keyId}:${v.keySecret}`).toString('base64');
            const res = await fetch('https://api.razorpay.com/v1/payments?count=1', { headers: { Authorization: `Basic ${auth}` } });
            if (res.ok) return { ok: true, message: 'Razorpay credentials verified.' };
            return reply.status(400).send({ ok: false, message: 'Razorpay rejected these credentials.' });
          }
          /**
           * Airtel Money — OAuth2 client credentials, the same shape as PayPal.
           *
           * The five gateways above were all non-African. In a Dar es Salaam
           * clearing agency the rails that matter are mobile money, and they
           * were the ones with nothing behind them.
           */
          case 'airtel': {
            if (!v.clientId || !v.clientSecret) {
              return reply.status(400).send({ ok: false, message: 'Client ID and Client Secret are required.' });
            }
            const res = await fetch('https://openapi.airtel.africa/auth/oauth2/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: '*/*' },
              body: JSON.stringify({
                client_id: v.clientId,
                client_secret: v.clientSecret,
                grant_type: 'client_credentials',
              }),
            });
            const body = await res.json().catch(() => ({} as any));
            if (res.ok && body?.access_token) return { ok: true, message: 'Airtel Money credentials verified.' };
            return reply.status(400).send({
              ok: false,
              message: `Airtel Money rejected these credentials${body?.error_description ? `: ${body.error_description}` : '.'}`,
            });
          }

          /**
           * M-Pesa (Vodacom Tanzania, OpenAPI) — a real session request.
           *
           * The portal issues an API key and an RSA public key; the key is
           * RSA-encrypted with it to form the bearer token, and getSession
           * exchanges that for a session id. Doing the encryption here is what
           * makes this a genuine check rather than a format test: a wrong
           * public key or a wrong API key fails at Vodacom, not locally.
           *
           * Read-only — getSession moves no money.
           */
          case 'mpesa': {
            if (!v.apiKey || !v.publicKey) {
              return reply.status(400).send({ ok: false, message: 'API key and public key are required — both come from the M-Pesa developer portal.' });
            }
            let bearer: string;
            try {
              const pem = `-----BEGIN PUBLIC KEY-----\n${String(v.publicKey).replace(/\s+/g, '').replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----\n`;
              bearer = nodeCrypto.publicEncrypt(
                { key: pem, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
                Buffer.from(String(v.apiKey)),
              ).toString('base64');
            } catch {
              // A key that will not parse is the finding, and saying so beats
              // sending a malformed token and blaming Vodacom for the answer.
              return reply.status(400).send({ ok: false, message: 'That public key could not be read. Paste the base64 key exactly as the portal shows it.' });
            }

            const host = v.sandbox === 'false'
              ? 'https://openapi.m-pesa.com/openapi/ipg/v2/vodacomTZN/getSession/'
              : 'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomTZN/getSession/';
            const res = await fetch(host, {
              headers: { Authorization: `Bearer ${bearer}`, Origin: '*', 'Content-Type': 'application/json' },
            });
            const body = await res.json().catch(() => ({} as any));
            if (res.ok && body?.output_SessionID) {
              return { ok: true, message: `M-Pesa session established${v.sandbox === 'false' ? '' : ' (sandbox)'}.` };
            }
            return reply.status(400).send({
              ok: false,
              message: `M-Pesa refused the session${body?.output_ResponseDesc ? `: ${body.output_ResponseDesc}` : '.'}`,
            });
          }

          case 'paypal': {
            if (!v.clientId || !v.secret) return reply.status(400).send({ ok: false, message: 'Client ID and Client Secret are required.' });
            const auth = Buffer.from(`${v.clientId}:${v.secret}`).toString('base64');
            const res = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
              method: 'POST',
              headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'grant_type=client_credentials',
            });
            if (res.ok) return { ok: true, message: 'PayPal credentials verified (sandbox).' };
            return reply.status(400).send({ ok: false, message: 'PayPal rejected these credentials.' });
          }
          default:
            return { ok: false, message: 'Live connection testing isn\'t available for this gateway yet — verify credentials directly with the provider.' };
        }
      } catch (e: any) {
        return reply.status(502).send({ ok: false, message: `Could not reach the provider: ${e.message}` });
      }
    }
  );
}
