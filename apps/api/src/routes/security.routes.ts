import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../db/client.js';
import { generateTotpSecret, buildTotpUri, verifyTotp, generateBackupCodes } from '../lib/totp.js';

// Self-service security settings for the currently-authenticated user —
// backs Workspace ▸ Subscription ▸ Security (apps/web/src/pages/Subscription.tsx),
// which previously rendered a hardcoded "Security Score", a fake TOTP secret
// literal, and 3 fabricated session rows. Real 2FA (see lib/totp.ts) and real
// sessions (hr_devices, already populated at every login by auth.routes.ts).
export default async function securityRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // ── 2FA ──────────────────────────────────────────────────────────

  fastify.get('/2fa/status', async (request) => {
    const user = request.user;
    const row = await db.selectFrom('user_totp').select(['enabled', 'enabled_at'])
      .where('user_id', '=', user.sub).executeTakeFirst();
    return { enabled: !!row?.enabled, enabled_at: row?.enabled_at ?? null };
  });

  // Generates (or regenerates) a pending secret and returns the otpauth:// URI
  // to render as a QR code — NOT yet enabled until /2fa/verify confirms the
  // user's authenticator app actually produces matching codes.
  fastify.post('/2fa/setup', async (request, reply) => {
    const user = request.user;
    const secret = generateTotpSecret();

    await db.insertInto('user_totp')
      .values({ tenant_id: user.tenant_id, user_id: user.sub, secret, enabled: false })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ secret, enabled: false, backup_codes: '[]', enabled_at: null }))
      .execute();

    reply.status(200);
    return { secret, uri: buildTotpUri(secret, user.email) };
  });

  fastify.post<{ Body: { token: string } }>('/2fa/verify', async (request, reply) => {
    const user = request.user;
    const row = await db.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.sub).executeTakeFirst();
    if (!row) {
      reply.status(400);
      return { error: 'Run /2fa/setup first' };
    }
    if (!verifyTotp(row.secret, request.body.token)) {
      reply.status(400);
      return { error: 'Incorrect code — check the time on your device and try again' };
    }

    const backupCodes = generateBackupCodes();
    await db.updateTable('user_totp')
      .set({ enabled: true, enabled_at: new Date(), backup_codes: JSON.stringify(backupCodes) })
      .where('user_id', '=', user.sub)
      .execute();

    reply.status(200);
    // Backup codes are only ever returned this once — same convention as an
    // API key's secret value (see api-keys.routes.ts POST /), never re-shown.
    return { enabled: true, backup_codes: backupCodes };
  });

  fastify.post<{ Body: { token: string } }>('/2fa/disable', async (request, reply) => {
    const user = request.user;
    const row = await db.selectFrom('user_totp').select('secret')
      .where('user_id', '=', user.sub).where('enabled', '=', true).executeTakeFirst();
    if (!row) {
      reply.status(400);
      return { error: '2FA is not enabled' };
    }
    if (!verifyTotp(row.secret, request.body.token)) {
      reply.status(400);
      return { error: 'Incorrect code' };
    }
    await db.deleteFrom('user_totp').where('user_id', '=', user.sub).execute();
    reply.status(200);
    return { enabled: false };
  });

  // ── Sessions (real hr_devices rows, not fabricated) ─────────────

  fastify.get('/sessions', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_devices')
        .select(['id', 'device_label', 'device_type', 'user_agent', 'trusted', 'last_used_at', 'created_at', 'revoked_at'])
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('last_used_at', 'desc')
        .execute();
      return rows.map(r => ({ ...r, is_current: r.id === user.device_id, active: !r.revoked_at }));
    });
  });

  fastify.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_devices')
        .set({ revoked_at: new Date() })
        .where('id', '=', request.params.id)
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .returning('id')
        .executeTakeFirst();
      if (!updated) {
        reply.status(404);
        return { error: 'Session not found' };
      }
      reply.status(200);
      return { success: true, was_current: request.params.id === user.device_id };
    });
  });

  // Signs out every OTHER active session, leaving the caller's own logged in
  // (the safer default for a self-service "sign out everywhere" button —
  // see security.routes.ts header comment on why this isn't a whole-account lockout).
  fastify.post('/sessions/revoke-others', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.updateTable('hr_devices')
        .set({ revoked_at: new Date() })
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .where('revoked_at', 'is', null);
      if (user.device_id) query = query.where('id', '!=', user.device_id);
      const result = await query.executeTakeFirst();
      return { revoked: Number(result.numUpdatedRows ?? 0) };
    });
  });
}
