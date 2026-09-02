import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { withTenant } from '../db/client.js';
import { generateTotpSecret, buildTotpUri, verifyTotp, generateBackupCodes } from '../lib/totp.js';
import { webauthnOrigin, webauthnRpID, WEBAUTHN_RP_NAME } from '../lib/webauthn-config.js';
import { recordAuthEvent, verifyAuditChain } from '../lib/audit-chain.js';
import { computeTrustScore } from '../lib/trust-score.js';
import { evaluateAccess } from '../lib/authz-check.js';
import { computeReliabilitySignals } from '../lib/reliability-signals.js';
import { env } from '../config/env.js';
import { encryptSecret, decryptSecret } from '../services/onsite-secrets.service.js';

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
    const result = await computeTrustScore(user.tenant_id, user.sub);
    // computeTrustScore() itself stays a pure read (the step-up check below
    // also calls it, and shouldn't silently write a history row on every
    // check) — the snapshot is taken here instead, throttled to at most one
    // per hour so repeated page loads don't spam ondi_trust_score_snapshots.
    await withTenant(user.tenant_id, async (trx) => {
      const recent = await trx.selectFrom('ondi_trust_score_snapshots')
        .select('id')
        .where('user_id', '=', user.sub)
        .where('created_at', '>', new Date(Date.now() - 60 * 60 * 1000))
        .executeTakeFirst();
      if (!recent) {
        await trx.insertInto('ondi_trust_score_snapshots')
          .values({ tenant_id: user.tenant_id, user_id: user.sub, score: result.score, tier: result.tier })
          .execute();
      }
    });
    return result;
  });

  // Ondi feature-gap pass: the fork's benchmark doc calls out "score history
  // over time, not just a snapshot" as a real differentiator — this is that,
  // backed by the throttled writes above rather than a second scoring model.
  fastify.get('/trust-score/history', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('ondi_trust_score_snapshots')
      .select(['score', 'tier', 'created_at'])
      .where('user_id', '=', user.sub)
      .orderBy('created_at', 'asc')
      .limit(90)
      .execute());
  });

  // A real, callable policy-decision point — ALLOW / DENY / STEP_UP — other
  // Hudumika services can call before a sensitive action, instead of the
  // idea existing only as descriptive copy on OneIdSSO.tsx. See
  // lib/authz-check.ts's header for the full reasoning. GET /wallet/:id/reveal
  // below is the first real caller.
  fastify.post<{ Body: { action: string; minScore?: number; minVerificationLevel?: 'phone_verified' | 'id_verified' | 'enhanced'; requireFreshAuth?: boolean; freshAuthTotp?: string } }>('/authz/check', async (request) => {
    const user = request.user;
    const body = z.object({
      action: z.string().trim().min(1).max(80),
      minScore: z.number().min(300).max(850).optional(),
      minVerificationLevel: z.enum(['phone_verified', 'id_verified', 'enhanced']).optional(),
      requireFreshAuth: z.boolean().optional(),
      freshAuthTotp: z.string().optional(),
    }).parse(request.body);

    const result = await evaluateAccess({
      tenantId: user.tenant_id, userId: user.sub,
      minScore: body.minScore, minVerificationLevel: body.minVerificationLevel,
      requireFreshAuth: body.requireFreshAuth, freshAuthTotp: body.freshAuthTotp,
    });
    return { action: body.action, ...result };
  });

  // A workplace-reliability signal composed from real cross-app data
  // (payroll tenure, petty-cash discipline, attendance/leave) — see
  // reliability-signals.ts's header for why this is intentionally separate
  // from the trust score above rather than a "credit score."
  fastify.get('/reliability-signals', async (request) => {
    const user = request.user;
    return computeReliabilitySignals(user.tenant_id, user.sub);
  });

  // Proves this tenant's Ondi audit log hasn't been tampered with — walks
  // the SHA-256 hash chain from the oldest entry and recomputes every hash.
  fastify.get('/audit/verify-chain', async (request) => {
    const user = request.user;
    return verifyAuditChain(user.tenant_id);
  });

  // ── Personal activity feed — Ondi M1 (house-style expansion) ────
  // hr_login_history already has a tenant-wide admin view (oneid.routes.ts
  // GET /login-history) and ondi_auth_events already has a tamper-verify
  // endpoint above, but neither had a self-scoped "what has my own account
  // actually done" feed for the personal Activity page to read. Merges both
  // sources rather than picking one — login_success/login_failed already
  // exist in both, but ondi_auth_events alone misses plain password logins
  // recorded only in hr_login_history before Ondi's M1 login paths existed.
  fastify.get('/activity', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [logins, events] = await Promise.all([
        trx.selectFrom('hr_login_history')
          .select(['id', 'ip', 'user_agent', 'status', 'created_at'])
          .where('user_id', '=', user.sub)
          .where('tenant_id', '=', user.tenant_id)
          .orderBy('created_at', 'desc')
          .limit(100)
          .execute(),
        trx.selectFrom('ondi_auth_events')
          .select(['id', 'event_type', 'ip', 'user_agent', 'metadata', 'created_at'])
          .where('user_id', '=', user.sub)
          .where('tenant_id', '=', user.tenant_id)
          .orderBy('created_at', 'desc')
          .limit(100)
          .execute(),
      ]);

      const combined = [
        ...logins.map(l => ({ id: `login:${l.id}`, kind: 'login' as const, label: l.status === 'SUCCESS' ? 'Signed in' : 'Failed sign-in attempt', ip: l.ip, user_agent: l.user_agent, created_at: l.created_at })),
        ...events.map(e => ({ id: `event:${e.id}`, kind: 'event' as const, label: e.event_type, ip: e.ip, user_agent: e.user_agent, metadata: e.metadata, created_at: e.created_at })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return combined.slice(0, 100);
    });
  });

  // ── Wallet — Ondi M3, Personal ▸ Wallet ──────────────────────────
  // A small credential vault for the user's OWN third-party logins/notes/
  // API keys — not read by any of this platform's own auth code (that's
  // ondi_credentials, above). secret_cipher is never selected by the list
  // route; only the single-item GET decrypts, and every reveal/add/update/
  // delete is written to the tamper-evident audit chain since this is
  // meaningfully more sensitive than a label/URL/username.

  // Ondi feature-gap pass (M3): returns items this user shared TO other
  // people alongside items others shared WITH them — two arrays rather than
  // one flat list, since "Shared with me" and "My items" read as genuinely
  // different sections in the UI (OneIdWallet.tsx), not one merged table.
  fastify.get('/wallet', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const owned = await trx.selectFrom('ondi_wallet_items')
        .select(['id', 'label', 'username', 'url', 'created_at', 'updated_at'])
        .where('user_id', '=', user.sub)
        .orderBy('label', 'asc')
        .execute();

      const sharedWithMe = await trx.selectFrom('ondi_wallet_shares')
        .innerJoin('ondi_wallet_items', 'ondi_wallet_items.id', 'ondi_wallet_shares.item_id')
        .innerJoin('users', 'users.id', 'ondi_wallet_shares.owner_id')
        .select([
          'ondi_wallet_items.id as id', 'ondi_wallet_items.label as label',
          'ondi_wallet_items.username as username', 'ondi_wallet_items.url as url',
          'ondi_wallet_items.updated_at as updated_at',
          'ondi_wallet_shares.permission as permission',
          'users.name as owner_name',
        ])
        .where('ondi_wallet_shares.grantee_user_id', '=', user.sub)
        .where('ondi_wallet_shares.revoked_at', 'is', null)
        .orderBy('ondi_wallet_items.label', 'asc')
        .execute();

      return { owned, sharedWithMe };
    });
  });

  // Owner-only — the active grants on one of the caller's own items, for the
  // "Shared with: …" list + revoke controls under an owned item.
  fastify.get<{ Params: { id: string } }>('/wallet/:id/shares', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const owns = await trx.selectFrom('ondi_wallet_items').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!owns) { reply.status(404); return { error: 'Not found' }; }
      return trx.selectFrom('ondi_wallet_shares')
        .innerJoin('users', 'users.id', 'ondi_wallet_shares.grantee_user_id')
        .select([
          'ondi_wallet_shares.id as id', 'ondi_wallet_shares.permission as permission', 'ondi_wallet_shares.created_at as created_at',
          'users.name as grantee_name', 'users.email as grantee_email',
        ])
        .where('ondi_wallet_shares.item_id', '=', request.params.id)
        .where('ondi_wallet_shares.revoked_at', 'is', null)
        .orderBy('users.name', 'asc')
        .execute();
    });
  });

  fastify.post<{ Body: { label: string; username?: string; url?: string; secret: string } }>('/wallet', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      label: z.string().trim().min(1).max(160),
      username: z.string().trim().max(200).optional(),
      url: z.string().trim().max(500).optional(),
      secret: z.string().min(1).max(4000),
    }).parse(request.body);

    const created = await withTenant(user.tenant_id, trx => trx.insertInto('ondi_wallet_items').values({
      tenant_id: user.tenant_id, user_id: user.sub,
      label: body.label, username: body.username || null, url: body.url || null,
      secret_cipher: encryptSecret(body.secret),
    }).returning(['id', 'label', 'username', 'url', 'created_at', 'updated_at']).executeTakeFirstOrThrow());

    await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_added', { metadata: { item_id: created.id, label: created.label } });
    reply.status(201);
    return created;
  });

  // Decrypts and returns the secret — the only route that ever does. Kept
  // separate from the list/update responses so a page render or an edit
  // save never puts the plaintext secret on the wire unless the user
  // explicitly clicked "Reveal".
  //
  // Ondi feature-gap pass (M2): the first real caller of the authz-check
  // policy engine — a reveal is exactly the "prove it's really you, right
  // now" case requireFreshAuth exists for. A STEP_UP decision surfaces as a
  // 403 the frontend recognises and answers by re-prompting for the user's
  // own current 2FA code, then retrying with ?totp=; ALLOW (including the
  // "no 2FA configured" case — see authz-check.ts) proceeds exactly as
  // before this milestone.
  fastify.get<{ Params: { id: string }; Querystring: { totp?: string } }>('/wallet/:id/reveal', async (request, reply) => {
    const user = request.user;
    const access = await evaluateAccess({
      tenantId: user.tenant_id, userId: user.sub,
      requireFreshAuth: true, freshAuthTotp: request.query.totp,
    });
    if (access.decision === 'STEP_UP') {
      reply.status(403);
      return { error: 'step_up_required', reason: access.reason };
    }

    return withTenant(user.tenant_id, async (trx) => {
      const owned = await trx.selectFrom('ondi_wallet_items').select(['id', 'label', 'secret_cipher'])
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      // Not the owner? Check for an active share (M3) before giving up —
      // either grant tier ('view' or 'edit') can reveal.
      const row = owned ?? await trx.selectFrom('ondi_wallet_shares')
        .innerJoin('ondi_wallet_items', 'ondi_wallet_items.id', 'ondi_wallet_shares.item_id')
        .select(['ondi_wallet_items.id as id', 'ondi_wallet_items.label as label', 'ondi_wallet_items.secret_cipher as secret_cipher'])
        .where('ondi_wallet_shares.item_id', '=', request.params.id)
        .where('ondi_wallet_shares.grantee_user_id', '=', user.sub)
        .where('ondi_wallet_shares.revoked_at', 'is', null)
        .executeTakeFirst();
      if (!row) { reply.status(404); return { error: 'Not found' }; }
      let secret: string;
      try { secret = decryptSecret(row.secret_cipher); }
      catch { reply.status(500); return { error: 'Could not decrypt this item.' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_viewed', { metadata: { item_id: row.id, label: row.label } });
      return { secret };
    });
  });

  fastify.patch<{ Params: { id: string }; Body: { label?: string; username?: string; url?: string; secret?: string } }>('/wallet/:id', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      label: z.string().trim().min(1).max(160).optional(),
      username: z.string().trim().max(200).nullable().optional(),
      url: z.string().trim().max(500).nullable().optional(),
      secret: z.string().min(1).max(4000).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      // M3: an 'edit'-tier grantee may update the item too, not just the owner.
      const owns = await trx.selectFrom('ondi_wallet_items').select('id')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!owns) {
        const canEdit = await trx.selectFrom('ondi_wallet_shares').select('id')
          .where('item_id', '=', request.params.id).where('grantee_user_id', '=', user.sub)
          .where('permission', '=', 'edit').where('revoked_at', 'is', null).executeTakeFirst();
        if (!canEdit) { reply.status(404); return { error: 'Not found' }; }
      }

      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (body.label !== undefined) patch.label = body.label;
      if (body.username !== undefined) patch.username = body.username;
      if (body.url !== undefined) patch.url = body.url;
      if (body.secret !== undefined) patch.secret_cipher = encryptSecret(body.secret);

      const updated = await trx.updateTable('ondi_wallet_items').set(patch)
        .where('id', '=', request.params.id)
        .returning(['id', 'label', 'username', 'url', 'created_at', 'updated_at']).executeTakeFirst();
      if (!updated) { reply.status(404); return { error: 'Not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_updated', { metadata: { item_id: updated.id, label: updated.label } });
      return updated;
    });
  });

  // Owner-only — share an owned item with another user in this tenant, at
  // 'view' or 'edit' tier. Step-up gated the same way reveal is: deciding
  // who else can see a secret is at least as sensitive as viewing it
  // yourself. Re-sharing with someone already granted access updates their
  // tier in place instead of erroring.
  fastify.post<{ Params: { id: string }; Body: { grantee_user_id: string; permission?: 'view' | 'edit'; freshAuthTotp?: string } }>('/wallet/:id/share', async (request, reply) => {
    const user = request.user;
    const body = z.object({
      grantee_user_id: z.string().uuid(),
      permission: z.enum(['view', 'edit']).default('view'),
      freshAuthTotp: z.string().optional(),
    }).parse(request.body);

    const access = await evaluateAccess({
      tenantId: user.tenant_id, userId: user.sub,
      requireFreshAuth: true, freshAuthTotp: body.freshAuthTotp,
    });
    if (access.decision === 'STEP_UP') { reply.status(403); return { error: 'step_up_required', reason: access.reason }; }

    if (body.grantee_user_id === user.sub) { reply.status(400); return { error: "You can't share an item with yourself." }; }

    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('ondi_wallet_items').select(['id', 'label'])
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!item) { reply.status(404); return { error: 'Not found' }; }

      const grantee = await trx.selectFrom('users').select(['id', 'name'])
        .where('id', '=', body.grantee_user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!grantee) { reply.status(404); return { error: 'That person was not found in this workspace.' }; }

      const existing = await trx.selectFrom('ondi_wallet_shares').select('id')
        .where('item_id', '=', item.id).where('grantee_user_id', '=', body.grantee_user_id).where('revoked_at', 'is', null)
        .executeTakeFirst();

      const share = existing
        ? await trx.updateTable('ondi_wallet_shares').set({ permission: body.permission })
            .where('id', '=', existing.id).returning(['id', 'permission']).executeTakeFirstOrThrow()
        : await trx.insertInto('ondi_wallet_shares').values({
            tenant_id: user.tenant_id, item_id: item.id, owner_id: user.sub,
            grantee_user_id: body.grantee_user_id, permission: body.permission,
          }).returning(['id', 'permission']).executeTakeFirstOrThrow();

      await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_shared', {
        metadata: { item_id: item.id, label: item.label, grantee_user_id: body.grantee_user_id, permission: body.permission },
      });
      reply.status(existing ? 200 : 201);
      return { id: share.id, permission: share.permission, grantee_name: grantee.name };
    });
  });

  // Owner-only — revoke one grant. Never step-up gated: narrowing access is
  // never the risky direction.
  fastify.delete<{ Params: { id: string; shareId: string } }>('/wallet/:id/share/:shareId', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('ondi_wallet_items').select(['id', 'label'])
        .where('id', '=', request.params.id).where('user_id', '=', user.sub).executeTakeFirst();
      if (!item) { reply.status(404); return { error: 'Not found' }; }

      const revoked = await trx.updateTable('ondi_wallet_shares').set({ revoked_at: new Date() })
        .where('id', '=', request.params.shareId).where('item_id', '=', item.id).where('revoked_at', 'is', null)
        .returning(['id', 'grantee_user_id']).executeTakeFirst();
      if (!revoked) { reply.status(404); return { error: 'Not found' }; }

      await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_share_revoked', {
        metadata: { item_id: item.id, label: item.label, grantee_user_id: revoked.grantee_user_id },
      });
      return { success: true };
    });
  });

  fastify.delete<{ Params: { id: string } }>('/wallet/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('ondi_wallet_items')
        .where('id', '=', request.params.id).where('user_id', '=', user.sub)
        .returning(['id', 'label']).executeTakeFirst();
      if (!deleted) { reply.status(404); return { error: 'Not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'wallet_item_deleted', { metadata: { item_id: deleted.id, label: deleted.label } });
      return { success: true };
    });
  });

  // ── Recovery contacts — Ondi feature-gap pass (M4), Personal ▸ Security Settings ──
  // Mutual-consent account recovery: a real gap the fork's own feature-map
  // doc called out, absent from the integrated system before this (only
  // password-reset-by-email-token + OTP/TOTP login existed). The public
  // trigger/complete side of this lives in auth.routes.ts
  // (/auth/recovery/request, /status/:token, /complete) since neither the
  // requester nor a not-yet-logged-in contact has a session at that point —
  // everything below is the authenticated half: setting up who your
  // contacts are, and a contact reviewing requests waiting on them.

  fastify.get('/recovery-contacts', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const myContacts = await trx.selectFrom('ondi_recovery_contacts')
        .innerJoin('users', 'users.id', 'ondi_recovery_contacts.contact_user_id')
        .select([
          'ondi_recovery_contacts.id as id', 'ondi_recovery_contacts.status as status', 'ondi_recovery_contacts.created_at as created_at',
          'users.name as contact_name', 'users.email as contact_email',
        ])
        .where('ondi_recovery_contacts.user_id', '=', user.sub)
        .orderBy('ondi_recovery_contacts.created_at', 'desc')
        .execute();

      const vouchingFor = await trx.selectFrom('ondi_recovery_contacts')
        .innerJoin('users', 'users.id', 'ondi_recovery_contacts.user_id')
        .select([
          'ondi_recovery_contacts.id as id', 'ondi_recovery_contacts.status as status', 'ondi_recovery_contacts.created_at as created_at',
          'users.name as owner_name', 'users.email as owner_email',
        ])
        .where('ondi_recovery_contacts.contact_user_id', '=', user.sub)
        .orderBy('ondi_recovery_contacts.created_at', 'desc')
        .execute();

      return { myContacts, vouchingFor };
    });
  });

  fastify.post<{ Body: { contact_user_id: string } }>('/recovery-contacts', async (request, reply) => {
    const user = request.user;
    const body = z.object({ contact_user_id: z.string().uuid() }).parse(request.body);
    if (body.contact_user_id === user.sub) { reply.status(400); return { error: "You can't add yourself as a recovery contact." }; }

    return withTenant(user.tenant_id, async (trx) => {
      const contactUser = await trx.selectFrom('users').select(['id', 'name'])
        .where('id', '=', body.contact_user_id).executeTakeFirst();
      if (!contactUser) { reply.status(404); return { error: 'That person was not found in this workspace.' }; }

      const existing = await trx.selectFrom('ondi_recovery_contacts').select('id')
        .where('user_id', '=', user.sub).where('contact_user_id', '=', body.contact_user_id).executeTakeFirst();
      if (existing) { reply.status(409); return { error: 'Already added.' }; }

      const created = await trx.insertInto('ondi_recovery_contacts').values({
        tenant_id: user.tenant_id, user_id: user.sub, contact_user_id: body.contact_user_id,
      }).returning(['id', 'status', 'created_at']).executeTakeFirstOrThrow();

      await recordAuthEvent(user.tenant_id, user.sub, 'recovery_contact_added', { metadata: { contact_user_id: body.contact_user_id } });
      reply.status(201);
      return { ...created, contact_name: contactUser.name };
    });
  });

  // Only the named contact may accept or decline — mutual consent, not a
  // one-sided designation.
  fastify.post<{ Params: { id: string }; Body: { accept: boolean } }>('/recovery-contacts/:id/respond', async (request, reply) => {
    const user = request.user;
    const body = z.object({ accept: z.boolean() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('ondi_recovery_contacts').select(['id', 'user_id', 'status'])
        .where('id', '=', request.params.id).where('contact_user_id', '=', user.sub).executeTakeFirst();
      if (!row) { reply.status(404); return { error: 'Not found' }; }
      if (row.status !== 'pending') { reply.status(400); return { error: 'Already responded to.' }; }

      const updated = await trx.updateTable('ondi_recovery_contacts')
        .set({ status: body.accept ? 'accepted' : 'declined', responded_at: new Date() })
        .where('id', '=', row.id).returning(['id', 'status']).executeTakeFirstOrThrow();

      await recordAuthEvent(user.tenant_id, user.sub, 'recovery_contact_responded', { metadata: { relationship_id: row.id, accepted: body.accept } });
      return updated;
    });
  });

  // Either party can end the relationship at any time.
  fastify.delete<{ Params: { id: string } }>('/recovery-contacts/:id', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('ondi_recovery_contacts')
        .where('id', '=', request.params.id)
        .where(eb => eb.or([eb('user_id', '=', user.sub), eb('contact_user_id', '=', user.sub)]))
        .returning('id').executeTakeFirst();
      if (!deleted) { reply.status(404); return { error: 'Not found' }; }
      await recordAuthEvent(user.tenant_id, user.sub, 'recovery_contact_removed', { metadata: { relationship_id: deleted.id } });
      return { success: true };
    });
  });

  // Recovery requests where the caller is the CONTACT being asked to vouch —
  // never the caller's own account (they'd need to be logged in to see this
  // page, which means they aren't actually locked out).
  fastify.get('/recovery-requests', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => trx.selectFrom('ondi_recovery_requests')
      .innerJoin('ondi_recovery_contacts', 'ondi_recovery_contacts.id', 'ondi_recovery_requests.contact_id')
      .innerJoin('users', 'users.id', 'ondi_recovery_requests.user_id')
      .select([
        'ondi_recovery_requests.id as id', 'ondi_recovery_requests.status as status',
        'ondi_recovery_requests.requested_at as requested_at', 'ondi_recovery_requests.cooldown_ends_at as cooldown_ends_at',
        'users.name as requester_name', 'users.email as requester_email',
      ])
      .where('ondi_recovery_contacts.contact_user_id', '=', user.sub)
      .orderBy('ondi_recovery_requests.requested_at', 'desc')
      .limit(50)
      .execute());
  });

  fastify.post<{ Params: { id: string } }>('/recovery-requests/:id/approve', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('ondi_recovery_requests')
        .innerJoin('ondi_recovery_contacts', 'ondi_recovery_contacts.id', 'ondi_recovery_requests.contact_id')
        .select(['ondi_recovery_requests.id as id', 'ondi_recovery_requests.status as status', 'ondi_recovery_requests.user_id as user_id'])
        .where('ondi_recovery_requests.id', '=', request.params.id)
        .where('ondi_recovery_contacts.contact_user_id', '=', user.sub)
        .executeTakeFirst();
      if (!row) { reply.status(404); return { error: 'Not found' }; }
      if (row.status !== 'pending') { reply.status(400); return { error: 'This request is no longer pending.' }; }

      // 24h cooldown — the real owner's window to notice and cancel this
      // just by logging in normally (see cancelPendingRecoveryRequests in
      // auth.routes.ts).
      const cooldownEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const updated = await trx.updateTable('ondi_recovery_requests')
        .set({ status: 'approved', responded_at: new Date(), cooldown_ends_at: cooldownEndsAt })
        .where('id', '=', row.id).returning(['id', 'status', 'cooldown_ends_at']).executeTakeFirstOrThrow();

      await recordAuthEvent(user.tenant_id, user.sub, 'recovery_request_approved', { metadata: { request_id: row.id, for_user_id: row.user_id } });
      return updated;
    });
  });

  fastify.post<{ Params: { id: string } }>('/recovery-requests/:id/decline', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('ondi_recovery_requests')
        .innerJoin('ondi_recovery_contacts', 'ondi_recovery_contacts.id', 'ondi_recovery_requests.contact_id')
        .select(['ondi_recovery_requests.id as id', 'ondi_recovery_requests.status as status', 'ondi_recovery_requests.user_id as user_id'])
        .where('ondi_recovery_requests.id', '=', request.params.id)
        .where('ondi_recovery_contacts.contact_user_id', '=', user.sub)
        .executeTakeFirst();
      if (!row) { reply.status(404); return { error: 'Not found' }; }
      if (row.status !== 'pending') { reply.status(400); return { error: 'This request is no longer pending.' }; }

      const updated = await trx.updateTable('ondi_recovery_requests')
        .set({ status: 'declined', responded_at: new Date() })
        .where('id', '=', row.id).returning(['id', 'status']).executeTakeFirstOrThrow();

      await recordAuthEvent(user.tenant_id, user.sub, 'recovery_request_declined', { metadata: { request_id: row.id, for_user_id: row.user_id } });
      return updated;
    });
  });

  // ── Data export — Ondi M2, Personal ▸ Privacy ────────────────────
  // A real export of what this platform actually holds about the caller —
  // not a certified GDPR/PDPA Subject Access Request, just an honest JSON
  // dump of the same rows every other self-service page here already reads
  // (no new data collection, nothing invented for this endpoint).
  fastify.get('/data-export', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const [profile, devices, logins, totp, passkeys, consents] = await Promise.all([
        trx.selectFrom('users')
          .select(['id', 'name', 'email', 'phone', 'role', 'profile', 'kyc_status', 'verification_level', 'created_at'])
          .where('id', '=', user.sub).executeTakeFirst(),
        trx.selectFrom('hr_devices')
          .select(['device_label', 'device_type', 'trusted', 'last_used_at', 'created_at'])
          .where('user_id', '=', user.sub).where('revoked_at', 'is', null).execute(),
        trx.selectFrom('hr_login_history')
          .select(['ip', 'user_agent', 'status', 'created_at'])
          .where('user_id', '=', user.sub).orderBy('created_at', 'desc').limit(50).execute(),
        trx.selectFrom('user_totp').select('enabled').where('user_id', '=', user.sub).executeTakeFirst(),
        trx.selectFrom('ondi_credentials').select(['label', 'created_at']).where('user_id', '=', user.sub).execute(),
        trx.selectFrom('ondi_oauth_consents').select(['client_id', 'scopes', 'granted_at']).where('user_id', '=', user.sub).execute(),
      ]);
      const [trustScore, reliability] = await Promise.all([
        computeTrustScore(user.tenant_id, user.sub),
        computeReliabilitySignals(user.tenant_id, user.sub),
      ]);

      return {
        exported_at: new Date().toISOString(),
        profile,
        two_factor_enabled: !!totp?.enabled,
        passkeys,
        active_devices: devices,
        recent_logins: logins,
        trust_score: trustScore,
        reliability_signals: reliability,
        authorized_apps: consents,
      };
    });
  });
}
