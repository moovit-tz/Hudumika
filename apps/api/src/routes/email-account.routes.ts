import type { FastifyInstance } from 'fastify';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { buildSmtpTransporter } from '../integrations/email.js';

const testSchema = z.object({
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().positive().optional(),
  imapUser: z.string().trim().min(1),
  // Omitted or the masked placeholder = "use the already-saved password" —
  // lets someone test right after opening Settings without retyping it.
  imapPass: z.string().max(500).optional(),
  imapEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
});

const testSmtpSchema = z.object({
  smtpHost: z.string().trim().min(1),
  smtpPort: z.number().int().positive().optional(),
  smtpUser: z.string().trim().min(1),
  smtpPass: z.string().max(500).optional(),
  smtpEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
});

const saveSchema = z.object({
  imapEnabled: z.boolean().optional(),
  imapHost: z.string().trim().max(255).optional(),
  imapPort: z.number().int().positive().optional(),
  imapUser: z.string().trim().max(255).optional(),
  // Omitted or left as the masked placeholder = "keep the saved password",
  // same round-trip UX every other credential field in this codebase uses
  // (settings.routes.ts's SECRET_FIELDS_BY_KEY) — the browser is never
  // handed the real value to echo back on the next save.
  imapPass: z.string().max(500).optional(),
  imapEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
  imapMarkAsRead: z.boolean().optional(),
  signature: z.string().max(2000).optional(),
  spamBlocklist: z.array(z.string().trim().max(255)).max(200).optional(),
  // Per-user send identity (migration 491) — 'platform' (default) keeps
  // sending through the tenant/system-wide identity exactly as before.
  // The handler below only ever *writes* 'outlook'/'gmail' when a refresh
  // token for that provider is already on file (switching back to a
  // previously-connected provider) — turning OAuth on for the first time is
  // only ever done by mail-oauth.routes.ts's authorize-personal/callback
  // round trip, the one place a real refresh token actually gets obtained.
  sendProtocol: z.enum(['platform', 'smtp', 'outlook', 'gmail']).optional(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.number().int().positive().optional(),
  smtpUser: z.string().trim().max(255).optional(),
  smtpPass: z.string().max(500).optional(),
  smtpEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
  fromName: z.string().trim().max(255).optional(),
  fromEmail: z.string().trim().max(255).optional(),
  vacationEnabled: z.boolean().optional(),
  vacationStart: z.string().datetime().nullable().optional(),
  vacationEnd: z.string().datetime().nullable().optional(),
  vacationSubject: z.string().trim().max(500).optional(),
  vacationMessage: z.string().max(5000).optional(),
  vacationContactsOnly: z.boolean().optional(),
  vacationDomainOnly: z.boolean().optional(),
  forwardToEmail: z.string().trim().max(255).nullable().optional(),
  forwardKeepCopy: z.boolean().optional(),
  inboxSort: z.enum(['default', 'unread_first', 'starred_first']).optional(),
  autoAdvance: z.enum(['list', 'newer', 'older']).optional(),
});

/**
 * Per-user Email account settings — IMAP mailbox connection (for
 * imap-email-ingest.job.ts's inbound sync), signature, and a rule-based
 * spam sender/domain/keyword blocklist. Personal, not tenant-wide config,
 * so this is its own small route rather than another tenant_settings key.
 */
export async function emailAccountRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // GET /v1/email/account — never returns the real password, only whether
  // one is saved (same masked-round-trip convention as every other
  // credential in this codebase).
  fastify.get('/', async (request: any) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('user_email_accounts').selectAll()
        .where('user_id', '=', user.sub).executeTakeFirst();
      if (!row) {
        return {
          imapEnabled: false, imapHost: '', imapPort: 993, imapUser: '', imapPass: '',
          imapEncryption: 'ssl', imapMarkAsRead: true, signature: '', spamBlocklist: [],
          lastSyncedAt: null, lastSyncError: null,
          sendProtocol: 'platform', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '',
          smtpEncryption: 'ssl', fromName: '', fromEmail: '',
          outlookStatus: null, gmailStatus: null,
          vacationEnabled: false, vacationStart: null, vacationEnd: null,
          vacationSubject: '', vacationMessage: '', vacationContactsOnly: false, vacationDomainOnly: false,
          forwardToEmail: null, forwardKeepCopy: true, inboxSort: 'default', autoAdvance: 'list',
        };
      }
      return {
        imapEnabled: row.imap_enabled,
        imapHost: row.imap_host ?? '',
        imapPort: row.imap_port,
        imapUser: row.imap_user ?? '',
        imapPass: row.imap_pass ? MASKED_VALUE : '',
        imapEncryption: row.imap_encryption,
        imapMarkAsRead: row.imap_mark_as_read,
        signature: row.signature,
        spamBlocklist: row.spam_blocklist,
        lastSyncedAt: row.last_synced_at,
        lastSyncError: row.last_sync_error,
        sendProtocol: row.send_protocol,
        smtpHost: row.smtp_host ?? '',
        smtpPort: row.smtp_port,
        smtpUser: row.smtp_user ?? '',
        smtpPass: row.smtp_pass ? MASKED_VALUE : '',
        smtpEncryption: row.smtp_encryption,
        fromName: row.from_name ?? '',
        fromEmail: row.from_email ?? '',
        outlookStatus: row.outlook_status,
        gmailStatus: row.gmail_status,
        vacationEnabled: row.vacation_enabled,
        vacationStart: row.vacation_start,
        vacationEnd: row.vacation_end,
        vacationSubject: row.vacation_subject,
        vacationMessage: row.vacation_message,
        vacationContactsOnly: row.vacation_contacts_only,
        vacationDomainOnly: row.vacation_domain_only,
        forwardToEmail: row.forward_to_email,
        forwardKeepCopy: row.forward_keep_copy,
        inboxSort: row.inbox_sort,
        autoAdvance: row.auto_advance,
      };
    });
  });

  // PUT /v1/email/account — upsert. imapPass is only ever written when the
  // caller actually sent a new, non-masked value.
  fastify.put('/', async (request: any, reply) => {
    const user = request.user;
    const b = saveSchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('user_email_accounts').select(['id', 'outlook_refresh_token', 'gmail_refresh_token'])
        .where('user_id', '=', user.sub).executeTakeFirst();

      const passUpdate = b.imapPass !== undefined && b.imapPass !== MASKED_VALUE
        ? { imap_pass: b.imapPass ? encryptSecret(b.imapPass) : null }
        : {};
      const smtpPassUpdate = b.smtpPass !== undefined && b.smtpPass !== MASKED_VALUE
        ? { smtp_pass: b.smtpPass ? encryptSecret(b.smtpPass) : null }
        : {};
      // 'outlook'/'gmail' can only be *turned on* by mail-oauth.routes.ts's
      // callback (the one place a real refresh token gets obtained), but
      // switching back to a provider that's already connected — a token
      // already on file from a previous connect — is a safe, reversible
      // toggle this route can make.
      const canSwitchTo = (p: 'outlook' | 'gmail') => existing && (p === 'outlook' ? existing.outlook_refresh_token : existing.gmail_refresh_token);
      const sendProtocolUpdate =
        b.sendProtocol === 'platform' || b.sendProtocol === 'smtp' ? { send_protocol: b.sendProtocol }
        : (b.sendProtocol === 'outlook' || b.sendProtocol === 'gmail') && canSwitchTo(b.sendProtocol) ? { send_protocol: b.sendProtocol }
        : {};

      // A changed vacation window is a new vacation period — the "already
      // replied to this sender" list from the last one shouldn't suppress
      // fresh auto-replies for this one.
      const vacationWindowChanged = b.vacationStart !== undefined || b.vacationEnd !== undefined;

      if (existing) {
        await trx.updateTable('user_email_accounts').set({
          ...(b.imapEnabled !== undefined ? { imap_enabled: b.imapEnabled } : {}),
          ...(b.imapHost !== undefined ? { imap_host: b.imapHost || null } : {}),
          ...(b.imapPort !== undefined ? { imap_port: b.imapPort } : {}),
          ...(b.imapUser !== undefined ? { imap_user: b.imapUser || null } : {}),
          ...passUpdate,
          ...(b.imapEncryption !== undefined ? { imap_encryption: b.imapEncryption } : {}),
          ...(b.imapMarkAsRead !== undefined ? { imap_mark_as_read: b.imapMarkAsRead } : {}),
          ...(b.signature !== undefined ? { signature: b.signature } : {}),
          ...(b.spamBlocklist !== undefined ? { spam_blocklist: JSON.stringify(b.spamBlocklist) } : {}),
          ...sendProtocolUpdate,
          ...(b.smtpHost !== undefined ? { smtp_host: b.smtpHost || null } : {}),
          ...(b.smtpPort !== undefined ? { smtp_port: b.smtpPort } : {}),
          ...(b.smtpUser !== undefined ? { smtp_user: b.smtpUser || null } : {}),
          ...smtpPassUpdate,
          ...(b.smtpEncryption !== undefined ? { smtp_encryption: b.smtpEncryption } : {}),
          ...(b.fromName !== undefined ? { from_name: b.fromName || null } : {}),
          ...(b.fromEmail !== undefined ? { from_email: b.fromEmail || null } : {}),
          ...(b.vacationEnabled !== undefined ? { vacation_enabled: b.vacationEnabled } : {}),
          ...(b.vacationStart !== undefined ? { vacation_start: b.vacationStart ? new Date(b.vacationStart) : null } : {}),
          ...(b.vacationEnd !== undefined ? { vacation_end: b.vacationEnd ? new Date(b.vacationEnd) : null } : {}),
          ...(b.vacationSubject !== undefined ? { vacation_subject: b.vacationSubject } : {}),
          ...(b.vacationMessage !== undefined ? { vacation_message: b.vacationMessage } : {}),
          ...(b.vacationContactsOnly !== undefined ? { vacation_contacts_only: b.vacationContactsOnly } : {}),
          ...(b.vacationDomainOnly !== undefined ? { vacation_domain_only: b.vacationDomainOnly } : {}),
          ...(vacationWindowChanged ? { vacation_replied_to: JSON.stringify([]) } : {}),
          ...(b.forwardToEmail !== undefined ? { forward_to_email: b.forwardToEmail || null } : {}),
          ...(b.forwardKeepCopy !== undefined ? { forward_keep_copy: b.forwardKeepCopy } : {}),
          ...(b.inboxSort !== undefined ? { inbox_sort: b.inboxSort } : {}),
          ...(b.autoAdvance !== undefined ? { auto_advance: b.autoAdvance } : {}),
          updated_at: new Date(),
        }).where('user_id', '=', user.sub).execute();
      } else {
        await trx.insertInto('user_email_accounts').values({
          tenant_id: user.tenant_id,
          user_id: user.sub,
          imap_enabled: b.imapEnabled ?? false,
          imap_host: b.imapHost || null,
          imap_port: b.imapPort ?? 993,
          imap_user: b.imapUser || null,
          imap_pass: b.imapPass && b.imapPass !== MASKED_VALUE ? encryptSecret(b.imapPass) : null,
          imap_encryption: b.imapEncryption ?? 'ssl',
          imap_mark_as_read: b.imapMarkAsRead ?? true,
          signature: b.signature ?? '',
          spam_blocklist: JSON.stringify(b.spamBlocklist ?? []),
          send_protocol: b.sendProtocol === 'smtp' ? 'smtp' : 'platform',
          smtp_host: b.smtpHost || null,
          smtp_port: b.smtpPort ?? 587,
          smtp_user: b.smtpUser || null,
          smtp_pass: b.smtpPass && b.smtpPass !== MASKED_VALUE ? encryptSecret(b.smtpPass) : null,
          smtp_encryption: b.smtpEncryption ?? 'ssl',
          from_name: b.fromName || null,
          from_email: b.fromEmail || null,
          vacation_enabled: b.vacationEnabled ?? false,
          vacation_start: b.vacationStart ? new Date(b.vacationStart) : null,
          vacation_end: b.vacationEnd ? new Date(b.vacationEnd) : null,
          vacation_subject: b.vacationSubject ?? '',
          vacation_message: b.vacationMessage ?? '',
          vacation_contacts_only: b.vacationContactsOnly ?? false,
          vacation_domain_only: b.vacationDomainOnly ?? false,
          forward_to_email: b.forwardToEmail || null,
          forward_keep_copy: b.forwardKeepCopy ?? true,
          inbox_sort: b.inboxSort ?? 'default',
          auto_advance: b.autoAdvance ?? 'list',
        }).execute();
      }
      return { success: true };
    });
  });

  // POST /v1/email/account/test — a real IMAP connection attempt against
  // either the submitted (not-yet-saved) credentials or, when the password
  // is omitted/masked, the already-saved ones — so "Test connection" works
  // both while filling the form out for the first time and while just
  // double-checking a saved config still works. Never persists anything;
  // a short timeout so a bad host/firewall can't hang the request.
  fastify.post('/test', async (request: any, reply) => {
    const user = request.user;
    const b = testSchema.parse(request.body);

    let pass = b.imapPass;
    if (!pass || pass === MASKED_VALUE) {
      const row = await withTenant(user.tenant_id, (trx) =>
        trx.selectFrom('user_email_accounts').select('imap_pass').where('user_id', '=', user.sub).executeTakeFirst());
      if (!row?.imap_pass) return reply.status(400).send({ success: false, error: 'No saved password on file — enter one to test.' });
      pass = decryptSecret(row.imap_pass);
    }

    const client = new ImapFlow({
      host: b.imapHost,
      port: b.imapPort ?? 993,
      secure: (b.imapEncryption ?? 'ssl') !== 'none',
      auth: { user: b.imapUser, pass },
      logger: false,
    });

    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 10s.')), 10_000)),
      ]);
      await client.logout();
      return { success: true };
    } catch (err: any) {
      client.close();
      return { success: false, error: err.message || 'Connection failed.' };
    }
  });

  // POST /v1/email/account/test-smtp — same shape as /test above, for the
  // SMTP send-identity option: a real transporter.verify(), never persists
  // anything, same masked-password round-trip.
  fastify.post('/test-smtp', async (request: any, reply) => {
    const user = request.user;
    const b = testSmtpSchema.parse(request.body);

    let pass = b.smtpPass;
    if (!pass || pass === MASKED_VALUE) {
      const row = await withTenant(user.tenant_id, (trx) =>
        trx.selectFrom('user_email_accounts').select('smtp_pass').where('user_id', '=', user.sub).executeTakeFirst());
      if (!row?.smtp_pass) return reply.status(400).send({ success: false, error: 'No saved password on file — enter one to test.' });
      pass = decryptSecret(row.smtp_pass);
    }

    const transporter = buildSmtpTransporter({
      host: b.smtpHost, port: b.smtpPort, user: b.smtpUser, pass, enc: b.smtpEncryption,
    });

    try {
      await Promise.race([
        transporter.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 10s.')), 10_000)),
      ]);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection failed.' };
    }
  });
}
