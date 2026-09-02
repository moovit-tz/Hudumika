import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { issueTokens } from '../services/token.service.js';
import { withTenant, dbPlatform } from '../db/client.js';
import { verifyTotp } from '../lib/totp.js';
import { SmsService } from '../services/sms.service.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';
import { setSessionCookies } from '../lib/cookies.js';
import { recordLogin } from './auth.routes.js';
import { webauthnOrigin, webauthnRpID } from '../lib/webauthn-config.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { verifyMicrosoftIdToken } from '../lib/microsoft-oidc.js';
import { computeTrustScore } from '../lib/trust-score.js';
import { assessRisk } from '../lib/risk-engine.js';
import type { SafeUser, JWTPayload } from '@hudumika/types';

/**
 * Ondi's login front door (M1 of the SSO migration plan) — phone-OTP and
 * passwordless-TOTP, both landing on the exact same session mechanism
 * /auth/login already uses (issueTokens + setSessionCookies + recordLogin),
 * so every existing withTenant()-scoped route keeps working unchanged for a
 * session that started here. Not yet wired as /auth/login's default — that's
 * the last, separate, reversible milestone (M7).
 *
 * OTP codes live in Redis, not Postgres: they're short-TTL, no retention
 * value, and this platform's own analytics/announcements/lens routes
 * already depend on Redis the same way. Unlike the pre-existing
 * /auth/customer-otp flow (an in-memory Map, console.log "send", explicitly
 * simulated), OTP delivery here is a real SMS send through sms.service.ts
 * (Africa's Talking/Twilio) — Ondi is meant to become the platform's real
 * front door, not another simulated one.
 */
let redisClient: Redis | null = null;
try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 1500,
    enableOfflineQueue: false,
  });
  redisClient.on('error', () => {
    try { redisClient?.disconnect(); } catch { /* already gone */ }
    redisClient = null;
  });
} catch {
  redisClient = null;
}

const otpRequestSchema = z.object({ phone: z.string().trim().min(5).max(30) });
const otpVerifySchema = z.object({ phone: z.string().trim().min(5).max(30), code: z.string().trim().length(6) });
const totpLoginSchema = z.object({ email: z.string().trim().email().max(320), code: z.string().trim().length(6) });
const magicLinkRequestSchema = z.object({ email: z.string().trim().email().max(320) });
const magicLinkVerifySchema = z.object({ token: z.string().trim().min(32).max(128), totp: z.string().trim().length(6).optional() });
const passkeyOptionsSchema = z.object({ email: z.string().trim().email().max(320) });
const passkeyVerifySchema = z.object({ email: z.string().trim().email().max(320), response: z.any() });
const googleVerifySchema = z.object({ credential: z.string().trim().min(1).max(4000) });
const microsoftVerifySchema = z.object({ credential: z.string().trim().min(1).max(4000) });

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const otpKey = (userId: string) => `ondi:otp:${userId}`;
const otpAttemptsKey = (userId: string) => `ondi:otp:attempts:${userId}`;
const passkeyLoginChallengeKey = (email: string) => `ondi:webauthn:login:${email.toLowerCase()}`;
// Short-lived and single-use by design — possession of the emailed link is
// the whole security model, same reasoning as password_reset_tokens' 1-hour
// window, just tighter (15 min) since this one signs the holder straight in
// rather than only unlocking a password change. Redis, not Postgres, for the
// same reason OTP codes are: no retention value once consumed or expired.
const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const magicLinkKey = (token: string) => `ondi:magiclink:${token}`;

function buildSafeUser(user: any): SafeUser {
  return {
    id: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone || undefined,
    avatar_url: user.avatar_url || undefined,
    profile: user.profile ? (typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile) : undefined,
    location_id: user.location_id || undefined,
    active: user.active,
    created_at: user.created_at.toISOString(),
    updated_at: user.updated_at.toISOString(),
  };
}

async function issueSessionFor(fastify: FastifyInstance, reply: any, user: any, ip: string, userAgent: string) {
  const deviceId = await recordLogin(user.tenant_id, user.id, 'SUCCESS', ip, userAgent);
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
    email: user.email,
    name: user.name,
    ...(deviceId ? { device_id: deviceId } : {}),
  };
  const tokens = issueTokens(fastify, payload as any);
  setSessionCookies(reply, tokens);
  return { ...tokens, user: buildSafeUser(user) };
}

export async function ondiAuthRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/ondi/auth/config
   * What the login page can offer — Google sign-in only if a real Cloud
   * OAuth client is configured (GOOGLE_OAUTH_CLIENT_ID). Client IDs aren't
   * secret (only a client secret would be, and this flow doesn't use one —
   * see env.ts's own comment), so serving it here is what lets the frontend
   * initialize Google Identity Services without hardcoding it.
   *
   * sso_enabled (M7) — a SuperAdmin-controlled, platform-global dark-launch
   * flag (Platform Settings → Ondi SSO), defaulting false. Global rather
   * than per-tenant: the unauthenticated landing route that reads this has
   * no tenant context yet (nobody has typed an email or phone at that
   * point) — the same "pre-tenant" constraint every login lookup in this
   * codebase already works around, just with no user identifier at all to
   * resolve a tenant from. App.tsx uses this to decide whether the
   * catch-all unauthenticated route renders OndiLogin or the password
   * Login page by default; the other one stays fully reachable via the
   * cross-link either page already has — this never removes the password
   * path, only changes which one a visitor sees first.
   */
  fastify.get('/config', async () => {
    const row = await dbPlatform.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', '00000000-0000-0000-0000-000000000000').executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return {
      google_client_id: env.GOOGLE_OAUTH_CLIENT_ID || null,
      microsoft_client_id: env.MICROSOFT_OAUTH_CLIENT_ID || null,
      sso_enabled: !!settings?.ondiSso?.enabled,
    };
  });

  /**
   * POST /v1/ondi/auth/otp/request
   * Sends a 6-digit SMS code to an existing, active user's phone.
   */
  fastify.post('/otp/request', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { phone } = otpRequestSchema.parse(request.body);

    if (!redisClient) {
      return reply.status(503).send({ error: 'OTP login is temporarily unavailable. Try again shortly.' });
    }

    // Pre-tenant: phone lookup across all tenants, same reasoning as
    // /login's email lookup and /customer-otp's phone_wa lookup.
    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('phone', '=', phone).where('active', '=', true).executeTakeFirst();
    if (!user) {
      return reply.status(404).send({ error: 'No active account found for this phone number.' });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    await redisClient.set(otpKey(user.id), code, 'EX', OTP_TTL_SECONDS);
    await redisClient.del(otpAttemptsKey(user.id));

    const result = await SmsService.sendNow(user.tenant_id, user.id, {
      to: phone,
      body: `${code} is your Hudumika sign-in code. It expires in 5 minutes. Never share this code.`,
      sourceApp: 'oneid',
    });
    if (!result.success) {
      return reply.status(502).send({ error: result.error || 'Could not send the SMS code. Try again shortly.' });
    }

    await recordAuthEvent(user.tenant_id, user.id, 'otp_issued', {
      ip: request.ip, userAgent: String(request.headers['user-agent'] || ''),
    });
    return { success: true, message: 'A sign-in code was sent by SMS.' };
  });

  /**
   * POST /v1/ondi/auth/otp/verify
   * Verifies the code and issues a real platform session.
   */
  fastify.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { phone, code } = otpVerifySchema.parse(request.body);

    if (!redisClient) {
      return reply.status(503).send({ error: 'OTP login is temporarily unavailable. Try again shortly.' });
    }

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('phone', '=', phone).where('active', '=', true).executeTakeFirst();
    if (!user) {
      return reply.status(404).send({ error: 'No active account found for this phone number.' });
    }

    const ip = request.ip;
    const userAgent = String(request.headers['user-agent'] || '');

    const attempts = await redisClient.incr(otpAttemptsKey(user.id));
    if (attempts === 1) await redisClient.expire(otpAttemptsKey(user.id), OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await redisClient.del(otpKey(user.id));
      await recordLogin(user.tenant_id, user.id, 'FAILED', ip, userAgent);
      await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip, userAgent, metadata: { via: 'otp', reason: 'too_many_attempts' } });
      return reply.status(429).send({ error: 'Too many incorrect attempts. Request a new code.' });
    }

    const stored = await redisClient.get(otpKey(user.id));
    if (!stored || stored !== code) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', ip, userAgent);
      await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip, userAgent, metadata: { via: 'otp', reason: 'invalid_code' } });
      return reply.status(401).send({ error: 'Invalid or expired code.' });
    }

    await redisClient.del(otpKey(user.id));
    await redisClient.del(otpAttemptsKey(user.id));

    // Risk-based step-up (M3): OTP itself already satisfies the 'otp'-tier
    // decision below, so this doesn't gate a correct code behind anything
    // further in the reachable cases — see risk-engine.ts's own header
    // comment on why 'block' can't actually fire with today's 3 signals.
    // It's still computed and recorded on every login so the audit trail
    // and trust score have real history to build on, and so a future signal
    // can make blocking reachable without touching this route again.
    const [isNewDevice, lastKnown, recentFailed, trust] = await withTenant(user.tenant_id, async (trx) => {
      const existingDevice = await trx.selectFrom('hr_devices').select('id')
        .where('user_id', '=', user.id).where('user_agent', '=', userAgent || 'unknown-client').executeTakeFirst();
      const lastSuccess = await trx.selectFrom('hr_login_history').select('ip')
        .where('user_id', '=', user.id).where('status', '=', 'SUCCESS')
        .orderBy('created_at', 'desc').executeTakeFirst();
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const failedCount = await trx.selectFrom('hr_login_history').select(({ fn }) => fn.countAll().as('n'))
        .where('user_id', '=', user.id).where('status', '=', 'FAILED').where('created_at', '>=', fifteenMinAgo)
        .executeTakeFirst();
      return [!existingDevice, lastSuccess?.ip ?? null, Number(failedCount?.n ?? 0), await computeTrustScore(user.tenant_id, user.id)] as const;
    });

    const risk = assessRisk({ trustScore: trust.score, isNewDevice, ipAddress: ip, lastKnownIp: lastKnown, recentFailedAttempts: recentFailed });

    if (risk.decision === 'block') {
      await recordAuthEvent(user.tenant_id, user.id, 'access_denied', { ip, userAgent, metadata: { via: 'otp', risk } });
      return reply.status(403).send({ error: 'This sign-in was blocked for your account\'s safety. Contact your workspace admin.' });
    }

    await recordAuthEvent(user.tenant_id, user.id, 'login_success', { ip, userAgent, metadata: { via: 'otp', risk, trust_score: trust.score } });

    const session = await issueSessionFor(fastify, reply, user, ip, userAgent);
    return { ...session, risk: { score: risk.riskScore, factors: risk.factors } };
  });

  /**
   * POST /v1/ondi/auth/magic-link/request
   * Emails a one-click sign-in link. Enumeration-safe like /forgot-password
   * and /recovery/request in auth.routes.ts — always the same generic
   * response, whether or not the email matched an active account, since this
   * (like those) is an unauthenticated, account-takeover-adjacent flow keyed
   * on an inbox rather than a typed secret. Deliberately not folded into
   * /forgot-password itself: that endpoint hands back a password-*change*
   * link, this one hands back a link that signs you straight in.
   */
  fastify.post('/magic-link/request', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email } = magicLinkRequestSchema.parse(request.body);

    if (!redisClient) {
      return reply.status(503).send({ error: 'Sign-in links are temporarily unavailable. Try again shortly.' });
    }

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await redisClient.set(magicLinkKey(token), user.id, 'EX', MAGIC_LINK_TTL_SECONDS);

      const magicLinkUrl = `${env.OPS_BOARD_URL}/auth/magic-link?token=${token}`;
      await MailService.enqueueTemplated(user.tenant_id, 'auth.magic_link', user.email, { magicLinkUrl }, 'auth')
        .catch(() => { /* link still exists in Redis; user can request again */ });

      await recordAuthEvent(user.tenant_id, user.id, 'magic_link_requested', {
        ip: request.ip, userAgent: String(request.headers['user-agent'] || ''),
      });
    }

    return { ok: true, message: 'If that email is registered, a sign-in link has been sent.' };
  });

  /**
   * POST /v1/ondi/auth/magic-link/verify
   * Consumes the token from the emailed link and issues a real session —
   * same requires_2fa shape as /auth/login: a user with TOTP enabled still
   * has to prove it, since a magic link only proves inbox access (the "have"
   * factor most users already get from the password login they're used to),
   * not the "know" factor they explicitly opted into with an authenticator.
   * The token is only actually consumed (deleted from Redis) once a session
   * is really about to be issued — a 2FA-required response leaves it valid
   * so the same link can be resubmitted with a code, the same way a correct
   * password isn't "used up" by a wrong or missing TOTP at /auth/login.
   */
  fastify.post('/magic-link/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token, totp } = magicLinkVerifySchema.parse(request.body);

    if (!redisClient) {
      return reply.status(503).send({ error: 'Sign-in links are temporarily unavailable. Try again shortly.' });
    }

    const userId = await redisClient.get(magicLinkKey(token));
    if (!userId) {
      return reply.status(400).send({ error: 'This sign-in link is invalid or has expired.' });
    }

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('id', '=', userId).where('active', '=', true).executeTakeFirst();
    if (!user) {
      await redisClient.del(magicLinkKey(token));
      return reply.status(401).send({ error: 'This sign-in link is invalid or has expired.' });
    }

    const ip = request.ip;
    const userAgent = String(request.headers['user-agent'] || '');

    const totpRow = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.id).executeTakeFirst());
    if (totpRow?.enabled) {
      if (!totp) {
        return { requires_2fa: true };
      }
      if (!verifyTotp(totpRow.secret, totp)) {
        await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip, userAgent, metadata: { via: 'magic_link' } });
        return reply.status(401).send({ error: 'Invalid authentication code' });
      }
    }

    await redisClient.del(magicLinkKey(token));
    await recordAuthEvent(user.tenant_id, user.id, 'magic_link_login', { ip, userAgent });
    return issueSessionFor(fastify, reply, user, ip, userAgent);
  });

  /**
   * POST /v1/ondi/auth/totp/verify
   * Passwordless login for a user who already has TOTP enabled
   * (Workspace ▸ Security) — proves identity with an authenticator code
   * instead of a password. Reuses user_totp + lib/totp.ts as-is; no new
   * credential storage.
   */
  fastify.post('/totp/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, code } = totpLoginSchema.parse(request.body);

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or code.' });
    }

    const totpRow = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.id).executeTakeFirst());
    if (!totpRow?.enabled) {
      return reply.status(400).send({ error: 'This account has not set up an authenticator app.' });
    }
    if (!verifyTotp(totpRow.secret, code)) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', request.ip, String(request.headers['user-agent'] || ''));
      await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'totp' } });
      return reply.status(401).send({ error: 'Invalid email or code.' });
    }

    await recordAuthEvent(user.tenant_id, user.id, 'totp_verified', { ip: request.ip, userAgent: String(request.headers['user-agent'] || '') });
    return issueSessionFor(fastify, reply, user, request.ip, String(request.headers['user-agent'] || ''));
  });

  /**
   * POST /v1/ondi/auth/passkey/login/options
   * Email-first passkey login (not usernameless/discoverable): the server
   * needs to know whose credentials to scope the WebAuthn ceremony to before
   * the browser can even prompt, since a login here has no session yet.
   */
  fastify.post('/passkey/login/options', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email } = passkeyOptionsSchema.parse(request.body);
    if (!redisClient) {
      return reply.status(503).send({ error: 'Passkey login is temporarily unavailable. Try again shortly.' });
    }

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();
    if (!user) return reply.status(404).send({ error: 'No active account found for this email.' });

    const creds = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_credentials')
      .select(['passkey_credential_id', 'passkey_transports'])
      .where('user_id', '=', user.id).execute());
    if (creds.length === 0) return reply.status(400).send({ error: 'No passkey is registered for this account.' });

    const options = await generateAuthenticationOptions({
      rpID: webauthnRpID(),
      allowCredentials: creds.map(c => ({
        id: c.passkey_credential_id,
        transports: (c.passkey_transports?.split(',') ?? []) as any,
      })),
      userVerification: 'preferred',
    });

    await redisClient.set(passkeyLoginChallengeKey(email), JSON.stringify({ challenge: options.challenge, userId: user.id }), 'EX', 120);
    return options;
  });

  /**
   * POST /v1/ondi/auth/passkey/login/verify
   */
  fastify.post('/passkey/login/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, response } = passkeyVerifySchema.parse(request.body);
    if (!redisClient) {
      return reply.status(503).send({ error: 'Passkey login is temporarily unavailable. Try again shortly.' });
    }

    const raw = await redisClient.get(passkeyLoginChallengeKey(email));
    if (!raw) return reply.status(400).send({ error: 'This passkey sign-in expired. Start again.' });
    await redisClient.del(passkeyLoginChallengeKey(email));
    const { challenge, userId } = JSON.parse(raw) as { challenge: string; userId: string };

    const user = await dbPlatform.selectFrom('users').selectAll().where('id', '=', userId).where('active', '=', true).executeTakeFirst();
    if (!user) return reply.status(401).send({ error: 'Invalid passkey.' });

    const credRow = await withTenant(user.tenant_id, trx => trx.selectFrom('ondi_credentials').selectAll()
      .where('user_id', '=', userId).where('passkey_credential_id', '=', response?.id).executeTakeFirst());
    if (!credRow) return reply.status(401).send({ error: 'Invalid passkey.' });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: webauthnOrigin(),
        expectedRPID: webauthnRpID(),
        credential: {
          id: credRow.passkey_credential_id,
          publicKey: new Uint8Array(Buffer.from(credRow.passkey_public_key, 'base64url')),
          counter: credRow.passkey_counter,
          transports: (credRow.passkey_transports?.split(',') ?? []) as any,
        },
      });
    } catch {
      await recordLogin(user.tenant_id, user.id, 'FAILED', request.ip, String(request.headers['user-agent'] || ''));
      await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'passkey' } });
      return reply.status(401).send({ error: 'Could not verify that passkey.' });
    }
    if (!verification.verified) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', request.ip, String(request.headers['user-agent'] || ''));
      await recordAuthEvent(user.tenant_id, user.id, 'login_failed', { ip: request.ip, userAgent: String(request.headers['user-agent'] || ''), metadata: { via: 'passkey' } });
      return reply.status(401).send({ error: 'Could not verify that passkey.' });
    }

    await withTenant(user.tenant_id, trx => trx.updateTable('ondi_credentials')
      .set({ passkey_counter: verification.authenticationInfo.newCounter, last_used_at: new Date() })
      .where('id', '=', credRow.id).execute());

    await recordAuthEvent(user.tenant_id, user.id, 'passkey_login', { ip: request.ip, userAgent: String(request.headers['user-agent'] || '') });
    return issueSessionFor(fastify, reply, user, request.ip, String(request.headers['user-agent'] || ''));
  });

  /**
   * POST /v1/ondi/auth/google/verify
   * Login-only, not registration — mirrors /totp/verify's constraint: the
   * Google email must already match an active users row (see M1's own note
   * on why self-service registration is out of scope until there's a real
   * tenant-creation story to attach it to).
   */
  fastify.post('/google/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { credential } = googleVerifySchema.parse(request.body);
    if (!env.GOOGLE_OAUTH_CLIENT_ID) {
      return reply.status(503).send({ error: 'Google sign-in is not configured for this platform yet.' });
    }

    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) return reply.status(401).send({ error: 'Invalid Google credential.' });
    const data: any = await res.json().catch(() => ({}));

    if (data.aud !== env.GOOGLE_OAUTH_CLIENT_ID) return reply.status(401).send({ error: 'Invalid Google credential.' });
    if (data.email_verified !== 'true' && data.email_verified !== true) {
      return reply.status(401).send({ error: 'Your Google account email is not verified.' });
    }

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', data.email).where('active', '=', true).executeTakeFirst();
    if (!user) return reply.status(404).send({ error: 'No active account found for this Google email.' });

    await recordAuthEvent(user.tenant_id, user.id, 'google_login', { ip: request.ip, userAgent: String(request.headers['user-agent'] || '') });
    return issueSessionFor(fastify, reply, user, request.ip, String(request.headers['user-agent'] || ''));
  });

  /**
   * POST /v1/ondi/auth/microsoft/verify
   * Login-only, not registration — same constraint as /google/verify just
   * above, for the same reason. `email` falls back to `preferred_username`
   * because Azure AD v2 id_tokens don't reliably populate a distinct
   * `email` claim for work/school accounts unless the tenant's directory
   * has one configured — `preferred_username` is the account's UPN, which
   * is email-shaped and present on every token this flow will see.
   */
  fastify.post('/microsoft/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { credential } = microsoftVerifySchema.parse(request.body);
    if (!env.MICROSOFT_OAUTH_CLIENT_ID) {
      return reply.status(503).send({ error: 'Microsoft sign-in is not configured for this platform yet.' });
    }

    const data = await verifyMicrosoftIdToken(credential, env.MICROSOFT_OAUTH_CLIENT_ID);
    if (!data) return reply.status(401).send({ error: 'Invalid Microsoft credential.' });

    const email = data.email || data.preferred_username;
    if (!email) return reply.status(401).send({ error: 'Your Microsoft account has no email address to sign in with.' });

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();
    if (!user) return reply.status(404).send({ error: 'No active account found for this Microsoft email.' });

    await recordAuthEvent(user.tenant_id, user.id, 'microsoft_login', { ip: request.ip, userAgent: String(request.headers['user-agent'] || '') });
    return issueSessionFor(fastify, reply, user, request.ip, String(request.headers['user-agent'] || ''));
  });
}
