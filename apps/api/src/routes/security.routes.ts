import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { withTenant } from '../db/client.js';
import { generateTotpSecret, buildTotpUri, verifyTotp, generateBackupCodes } from '../lib/totp.js';
import { webauthnOrigin, webauthnRpID, WEBAUTHN_RP_NAME } from '../lib/webauthn-config.js';
import { recordAuthEvent, verifyAuditChain } from '../lib/audit-chain.js';
import { computeTrustScore } from '../lib/trust-score.js';
import { env } from '../config/env.js';

let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 1500, enableOfflineQueue: false });
  redisClient.on('error', () => { try { redisClient?.disconnect(); } catch { /* already gone */ } redisClient = null; });
} catch { redisClient = null; }

const passkeyRegChallengeKey = (userId: string) => `ondi:webauthn:reg:${userId}`;

function transportsToText(transports: readonly string[] | undefined): string | null {
  return transports && transports.length ? transports.join(',') : null;
}

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
    const row = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['enabled', 'enabled_at'])
      .where('user_id', '=', user.sub).executeTakeFirst());
    return { enabled: !!row?.enabled, enabled_at: row?.enabled_at ?? null };
  });

  // Generates (or regenerates) a pending secret and returns the otpauth:// URI
  // to render as a QR code — NOT yet enabled until /2fa/verify confirms the
  // user's authenticator app actually produces matching codes.
  fastify.post('/2fa/setup', async (request, reply) => {
    const user = request.user;
    const secret = generateTotpSecret();

    await withTenant(user.tenant_id, trx => trx.insertInto('user_totp')
      .values({ tenant_id: user.tenant_id, user_id: user.sub, secret, enabled: false })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ secret, enabled: false, backup_codes: '[]', enabled_at: null }))
      .execute());

    reply.status(200);
    return { secret, uri: buildTotpUri(secret, user.email) };
  });

  fastify.post<{ Body: { token: string } }>('/2fa/verify', async (request, reply) => {
    const user = request.user;
    const row = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.sub).executeTakeFirst());
    if (!row) {
      reply.status(400);
      return { error: 'Run /2fa/setup first' };
    }
    if (!verifyTotp(row.secret, request.body.token)) {
      reply.status(400);
      return { error: 'Incorrect code — check the time on your device and try again' };
    }

    const backupCodes = generateBackupCodes();
    await withTenant(user.tenant_id, trx => trx.updateTable('user_totp')
      .set({ enabled: true, enabled_at: new Date(), backup_codes: JSON.stringify(backupCodes) })
      .where('user_id', '=', user.sub)
      .execute());

    reply.status(200);
    // Backup codes are only ever returned this once — same convention as an
    // API key's secret value (see api-keys.routes.ts POST /), never re-shown.
    return { enabled: true, backup_codes: backupCodes };
  });

  fastify.post<{ Body: { token: string } }>('/2fa/disable', async (request, reply) => {
    const user = request.user;
    const row = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select('secret')
      .where('user_id', '=', user.sub).where('enabled', '=', true).executeTakeFirst());
    if (!row) {
      reply.status(400);
      return { error: '2FA is not enabled' };
    }
    if (!verifyTotp(row.secret, request.body.token)) {
      reply.status(400);
      return { error: 'Incorrect code' };
    }
    await withTenant(user.tenant_id, trx => trx.deleteFrom('user_totp').where('user_id', '=', user.sub).execute());
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

  // Own-device rename — hr_devices.device_label already exists and is what
  // every "Chrome on Windows"-style label above comes from; there was no way
  // for a user to give a device a name they'd actually recognize.
  fastify.patch<{ Params: { id: string }; Body: { label: string } }>('/sessions/:id', async (request, reply) => {
    const user = request.user;
    const label = (request.body.label || '').trim().slice(0, 120);
    if (!label) { reply.status(400); return { error: 'Label is required.' }; }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_devices')
        .set({ device_label: label })
        .where('id', '=', request.params.id)
        .where('user_id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .returning('id')
        .executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Session not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'device_renamed', { metadata: { device_id: request.params.id } });
      return { success: true };
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
      await recordAuthEvent(user.tenant_id, user.sub, 'session_revoked', { metadata: { device_id: request.params.id, self_service: true } });
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

  // ── Passkeys (WebAuthn) — Ondi M2 ────────────────────────────────
  // Registration only, from an already-authenticated session (Workspace ▸
  // Security). The unauthenticated login half — proving possession of a
  // passkey to sign in with no prior session — lives in ondi-auth.routes.ts,
  // the same split M1 used between this file's authenticated self-service
  // and ondi-auth's unauthenticated front door.

  fastify.get('/passkeys', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('ondi_credentials')
      .select(['id', 'label', 'last_used_at', 'created_at'])
      .where('user_id', '=', user.sub)
      .orderBy('created_at', 'desc')
      .execute());
  });

  fastify.post('/passkeys/register/options', async (request, reply) => {
    const user = request.user;
    if (!redisClient) { reply.status(503); return { error: 'Passkey setup is temporarily unavailable. Try again shortly.' }; }

    const existing = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_credentials')
      .select(['passkey_credential_id', 'passkey_transports'])
      .where('user_id', '=', user.sub).execute());

    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: webauthnRpID(),
      userName: user.email,
      userID: new TextEncoder().encode(user.sub),
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({
        id: c.passkey_credential_id,
        transports: (c.passkey_transports?.split(',') ?? []) as any,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    await redisClient.set(passkeyRegChallengeKey(user.sub), options.challenge, 'EX', 120);
    return options;
  });

  fastify.post<{ Body: { response: any; label?: string } }>('/passkeys/register/verify', async (request, reply) => {
    const user = request.user;
    if (!redisClient) { reply.status(503); return { error: 'Passkey setup is temporarily unavailable. Try again shortly.' }; }

    const challenge = await redisClient.get(passkeyRegChallengeKey(user.sub));
    if (!challenge) { reply.status(400); return { error: 'This passkey setup expired. Start again.' }; }
    await redisClient.del(passkeyRegChallengeKey(user.sub));

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: request.body.response,
        expectedChallenge: challenge,
        expectedOrigin: webauthnOrigin(),
        expectedRPID: webauthnRpID(),
      });
    } catch (err: any) {
      reply.status(400);
      return { error: err.message || 'Could not verify that passkey.' };
    }
    if (!verification.verified || !verification.registrationInfo) {
      reply.status(400);
      return { error: 'Could not verify that passkey.' };
    }

    const { credential } = verification.registrationInfo;
    const label = (request.body.label || '').trim().slice(0, 120) || 'Passkey';
    const created = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_credentials').values({
      tenant_id: user.tenant_id,
      user_id: user.sub,
      label,
      passkey_credential_id: credential.id,
      passkey_public_key: Buffer.from(credential.publicKey).toString('base64url'),
      passkey_counter: credential.counter,
      passkey_transports: transportsToText(credential.transports),
    }).returning(['id', 'label', 'created_at']).executeTakeFirstOrThrow());

    await recordAuthEvent(user.tenant_id, user.sub, 'passkey_added', { metadata: { passkey_id: created.id, label } });
    reply.status(201);
    return created;
  });

  fastify.patch<{ Params: { id: string }; Body: { label: string } }>('/passkeys/:id', async (request, reply) => {
    const user = request.user;
    const label = (request.body.label || '').trim().slice(0, 120);
    if (!label) { reply.status(400); return { error: 'Label is required.' }; }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('ondi_credentials').set({ label })
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returning('id').executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Passkey not found' }; }
      return { success: true };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/passkeys/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('ondi_credentials')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returning('id').executeTakeFirst();
      if (!deleted) { reply.status(404); return { error: 'Passkey not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'passkey_removed', { metadata: { passkey_id: request.params.id } });
      return { success: true };
    });
  });

  // ── Trust score + audit chain — Ondi M3 ──────────────────────────

  fastify.get('/trust-score', async (request) => {
    const user = request.user;
    return computeTrustScore(user.tenant_id, user.sub);
  });

  // Proves this tenant's Ondi audit log hasn't been tampered with — walks
  // the SHA-256 hash chain from the oldest entry and recomputes every hash.
  fastify.get('/audit/verify-chain', async (request) => {
    const user = request.user;
    return verifyAuditChain(user.tenant_id);
  });
}
