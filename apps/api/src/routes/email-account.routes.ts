import type { FastifyInstance } from 'fastify';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';

const testSchema = z.object({
  imapHost: z.string().trim().min(1),
  imapPort: z.number().int().positive().optional(),
  imapUser: z.string().trim().min(1),
  // Omitted or the masked placeholder = "use the already-saved password" —
  // lets someone test right after opening Settings without retyping it.
  imapPass: z.string().max(500).optional(),
  imapEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
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
      };
    });
  });

  // PUT /v1/email/account — upsert. imapPass is only ever written when the
  // caller actually sent a new, non-masked value.
  fastify.put('/', async (request: any, reply) => {
    const user = request.user;
    const b = saveSchema.parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('user_email_accounts').select('id')
        .where('user_id', '=', user.sub).executeTakeFirst();

      const passUpdate = b.imapPass !== undefined && b.imapPass !== MASKED_VALUE
        ? { imap_pass: b.imapPass ? encryptSecret(b.imapPass) : null }
        : {};

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
}
