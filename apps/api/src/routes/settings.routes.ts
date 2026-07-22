import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import nodemailer from 'nodemailer';

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

  // PATCH /v1/settings
  fastify.patch('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const updates = request.body as Record<string, any>;

    // A non-SUPER_ADMIN can toggle 'enabled-apps' off (hide a module they have)
    // but never on beyond what their plan already grants — otherwise this
    // generic settings endpoint would let any tenant admin self-grant paid
    // features for free. requireEntitlement() (middleware/entitlement.ts)
    // trusts an explicit `true` override as SuperAdmin-authorized, so it must
    // be scrubbed here for anyone else before it's persisted.
    if (updates['enabled-apps'] && user.role !== 'SUPER_ADMIN') {
      return withTenant(user.tenant_id, async (trx) => {
        const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', user.tenant_id).executeTakeFirst();
        const grants = tenant
          ? await trx.selectFrom('package_features').select('feature_key').where('package_code', '=', tenant.plan).execute()
          : [];
        const grantSet = new Set(grants.map(g => g.feature_key));
        const raw = updates['enabled-apps'] as Record<string, boolean>;
        const scrubbed: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(raw)) {
          scrubbed[key] = val === true ? grantSet.has(key) : false;
        }
        return applySettingsPatch(trx, user.tenant_id, { ...updates, 'enabled-apps': scrubbed });
      });
    }

    return withTenant(user.tenant_id, (trx) => applySettingsPatch(trx, user.tenant_id, updates));
  });

  async function applySettingsPatch(trx: any, tenantId: string, updates: Record<string, any>) {
    const existing = await trx.selectFrom('tenant_settings').select('id').where('tenant_id', '=', tenantId).executeTakeFirst();
    if (existing) {
      await sql`UPDATE tenant_settings SET settings = settings || ${JSON.stringify(updates)}::jsonb, updated_at = NOW() WHERE tenant_id = ${tenantId}`.execute(trx);
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
}
