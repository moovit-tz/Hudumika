import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret, MASKED_VALUE } from '../services/onsite-secrets.service.js';
import { buildSmtpTransporter } from '../integrations/email.js';

const saveSchema = z.object({
  fromName: z.string().trim().max(255).optional(),
  fromEmail: z.string().trim().email().max(255),
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().positive().optional(),
  smtpUser: z.string().trim().min(1).max(255),
  // Omitted or the masked placeholder = "keep the saved password" (same
  // round-trip convention as every other credential in this codebase).
  smtpPass: z.string().max(500).optional(),
  smtpEncryption: z.enum(['ssl', 'tls', 'none']).optional(),
  replyBehavior: z.enum(['same_as_received', 'always_default']).optional(),
});

/**
 * "Send mail as" — additional named email aliases beyond the one identity
 * already configurable in Email settings ▸ Accounts (migration 491, still
 * the implicit fallback identity when nothing here is marked default). See
 * migration 494's own header for why aliases here are SMTP-only for now.
 */
export async function emailIdentitiesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('email'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request: any) => {
    const user = request.user;
    const rows = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_send_identities').selectAll().where('user_id', '=', user.sub).orderBy('created_at', 'asc').execute());
    return rows.map(r => ({
      id: r.id,
      fromName: r.from_name ?? '',
      fromEmail: r.from_email,
      sendProtocol: r.send_protocol,
      smtpHost: r.smtp_host ?? '',
      smtpPort: r.smtp_port,
      smtpUser: r.smtp_user ?? '',
      smtpPass: r.smtp_pass ? MASKED_VALUE : '',
      smtpEncryption: r.smtp_encryption,
      isDefault: r.is_default,
      replyBehavior: r.reply_behavior,
    }));
  });

  fastify.post('/', async (request: any) => {
    const user = request.user;
    const b = saveSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existingCount = await trx.selectFrom('email_send_identities')
        .select(({ fn }) => fn.countAll().as('n')).where('user_id', '=', user.sub).executeTakeFirst();
      const isFirst = Number(existingCount?.n ?? 0) === 0;
      const row = await trx.insertInto('email_send_identities').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        from_name: b.fromName || null,
        from_email: b.fromEmail,
        send_protocol: 'smtp',
        smtp_host: b.smtpHost,
        smtp_port: b.smtpPort ?? 587,
        smtp_user: b.smtpUser,
        smtp_pass: b.smtpPass && b.smtpPass !== MASKED_VALUE ? encryptSecret(b.smtpPass) : null,
        smtp_encryption: b.smtpEncryption ?? 'ssl',
        reply_behavior: b.replyBehavior ?? 'same_as_received',
        // A user's very first alias becomes the default automatically —
        // otherwise adding one would silently do nothing until they also
        // remembered to mark it default.
        is_default: isFirst,
      }).returningAll().executeTakeFirstOrThrow();
      return { id: row.id };
    });
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const user = request.user;
    const b = saveSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_send_identities').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Identity not found.' });
      await trx.updateTable('email_send_identities').set({
        ...(b.fromName !== undefined ? { from_name: b.fromName || null } : {}),
        ...(b.fromEmail !== undefined ? { from_email: b.fromEmail } : {}),
        ...(b.smtpHost !== undefined ? { smtp_host: b.smtpHost } : {}),
        ...(b.smtpPort !== undefined ? { smtp_port: b.smtpPort } : {}),
        ...(b.smtpUser !== undefined ? { smtp_user: b.smtpUser } : {}),
        ...(b.smtpPass !== undefined && b.smtpPass !== MASKED_VALUE ? { smtp_pass: b.smtpPass ? encryptSecret(b.smtpPass) : null } : {}),
        ...(b.smtpEncryption !== undefined ? { smtp_encryption: b.smtpEncryption } : {}),
        ...(b.replyBehavior !== undefined ? { reply_behavior: b.replyBehavior } : {}),
        updated_at: new Date(),
      }).where('id', '=', request.params.id).execute();
      return { success: true };
    });
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const result = await trx.deleteFrom('email_send_identities')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) return reply.status(404).send({ error: 'Identity not found.' });
      return { success: true };
    });
  });

  // POST /:id/set-default — clears the flag on every sibling row first, same
  // "only one default" pattern as email_signatures/set-default.
  fastify.post('/:id/set-default', async (request: any, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('email_send_identities').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Identity not found.' });
      await trx.updateTable('email_send_identities').set({ is_default: false }).where('user_id', '=', user.sub).execute();
      await trx.updateTable('email_send_identities').set({ is_default: true, updated_at: new Date() }).where('id', '=', request.params.id).execute();
      return { success: true };
    });
  });

  // POST /:id/test — a real transporter.verify(), same shape as
  // email-account.routes.ts's own /test-smtp, never persists anything.
  fastify.post('/:id/test', async (request: any, reply) => {
    const user = request.user;
    const row = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('email_send_identities').selectAll().where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst());
    if (!row) return reply.status(404).send({ error: 'Identity not found.' });
    if (!row.smtp_host || !row.smtp_user || !row.smtp_pass) return reply.status(400).send({ success: false, error: 'No SMTP credentials saved for this identity.' });
    const transporter = buildSmtpTransporter({
      host: row.smtp_host, port: row.smtp_port, user: row.smtp_user, pass: decryptSecret(row.smtp_pass), enc: row.smtp_encryption,
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
