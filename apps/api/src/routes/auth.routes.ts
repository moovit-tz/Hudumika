import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { issueTokens, durationSeconds } from '../services/token.service.js';
import crypto from 'crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { hashPassword, verifyPassword, needsRehash } from '../lib/password.js';
import { verifyTotp } from '../lib/totp.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';
import { PlatformAdminService } from '../services/platform-admin.service.js';
import { COOKIE_NAMES, setSessionCookies, clearSessionCookies, setSuperCookies, clearSuperCookies } from '../lib/cookies.js';
import { verifyCsrf } from '../middleware/csrf.js';
import type { LoginInput, CustomerOTPInput, CustomerVerifyInput, SafeUser, JWTPayload, OrgLoginInput, SafeOrgUser } from '@hudumika/types';

// Simple in-memory storage for customer OTPs in dev
const OTP_STORE = new Map<string, { otp: string; expiresAt: number }>();

// Every schema below guards a fully unauthenticated route — no JWT stands
// between the internet and these handlers, so a malformed/malicious body
// (wrong type, missing field, absurd length) previously reached DB queries
// and bcrypt-equivalent hashing with zero shape checking at all.
const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
  totp: z.string().max(20).optional(),
});
const acceptInviteSchema = z.object({
  token: z.string().min(1).max(500),
  name: z.string().trim().min(1).max(200),
  password: z.string().min(8).max(200),
});
const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(320) });
const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: z.string().min(8).max(200),
});
const customerOtpSchema = z.object({ phone_wa: z.string().trim().min(5).max(30) });
const customerVerifySchema = z.object({
  phone_wa: z.string().trim().min(5).max(30),
  otp: z.string().trim().min(1).max(20),
});
const orgLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(200),
});
const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(200),
  totp: z.string().max(20).optional(),
});

function parseDevice(userAgent: string): { label: string; type: string } {
  const ua = userAgent || '';
  const type = /Mobile|Android|iPhone/i.test(ua) ? 'Mobile' : /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { label: `${browser} on ${os}`, type };
}

// Returns the hr_devices row id for this login, so callers can stamp it into
// the JWT as `device_id` — that's what lets a single session later be
// "signed out" for real (see hr_devices.revoked_at, checked in middleware/auth.ts).
async function recordLogin(tenantId: string, userId: string, status: 'SUCCESS' | 'FAILED', ip: string, userAgent: string): Promise<string | null> {
  try {
    return await withTenant(tenantId, async (trx) => {
      await trx.insertInto('hr_login_history').values({ tenant_id: tenantId, user_id: userId, ip, user_agent: userAgent, status }).execute();
      if (status !== 'SUCCESS') return null;
      /**
       * users.last_login_at, which nothing had ever written.
       *
       * The column exists, /v1/hr/staff selects it, and the staff screens
       * display it — so every person in every workspace read "Never", forever.
       * Login history went to hr_login_history and hr_devices and stopped
       * there. A tenant administrator asking "who has not used this since we
       * bought it" needs this one field to be true.
       */
      await trx.updateTable('users')
        .set({ last_login_at: new Date() })
        .where('id', '=', userId)
        .where('tenant_id', '=', tenantId)
        .execute();

      // Unconditional: recordLogin used to return null when the client sent no
      // User-Agent, and a token with no device_id skips the revocation check in
      // middleware/auth.ts entirely — an unrevokable session. A nameless client
      // gets a row too, so "Sign out" can always reach it.
      const ua = userAgent || 'unknown-client';
      const { label, type } = parseDevice(ua);
      const existing = await trx.selectFrom('hr_devices').select('id')
        .where('user_id', '=', userId).where('user_agent', '=', ua).executeTakeFirst();
      if (existing) {
        // A fresh login re-authenticates the device — clears any prior revocation
        // rather than leaving a token that would 401 on its very next request.
        await trx.updateTable('hr_devices').set({ last_used_at: new Date(), revoked_at: null }).where('id', '=', existing.id).execute();
        return existing.id;
      } else {
        const created = await trx.insertInto('hr_devices').values({
          tenant_id: tenantId, user_id: userId, device_label: label, device_type: type, user_agent: ua, trusted: true,
        }).returning('id').executeTakeFirst();
        return created?.id ?? null;
      }
    });
  } catch { /* login/device tracking must never block auth */ }
  return null;
}

// Gives an impersonation session the same hr_devices row a real login gets,
// so it can /auth/refresh past its first hour and be revoked early from
// Workspace ▸ Security — see AccessClaims.device_id's own doc comment.
// Deliberately narrower than recordLogin(): it never touches
// hr_login_history or users.last_login_at, since the person who actually
// signed in was the SuperAdmin, not the target — those must keep telling
// the truth about when the target themself last logged in.
// Only ever called with a real users.id — the legacy customer-OTP shape
// (sub = customers.id) has no such row, and hr_devices.user_id is a hard FK
// to users(id), so that branch stays device-less, exactly as a real legacy
// customer login already is (see POST /auth/customer/verify above, which
// never calls recordLogin either).
async function registerImpersonationDevice(tenantId: string, userId: string, actorName: string, userAgent: string): Promise<string | null> {
  try {
    return await withTenant(tenantId, async (trx) => {
      const ua = userAgent || 'unknown-client';
      const label = `Impersonated by ${actorName || 'SuperAdmin'}`;
      const existing = await trx.selectFrom('hr_devices').select('id')
        .where('user_id', '=', userId).where('user_agent', '=', ua).executeTakeFirst();
      if (existing) {
        await trx.updateTable('hr_devices').set({ last_used_at: new Date(), revoked_at: null }).where('id', '=', existing.id).execute();
        return existing.id;
      }
      const created = await trx.insertInto('hr_devices').values({
        tenant_id: tenantId, user_id: userId, device_label: label, device_type: 'Desktop', user_agent: ua, trusted: false,
      }).returning('id').executeTakeFirst();
      return created?.id ?? null;
    });
  } catch { return null; } // device tracking must never block impersonation
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/login
   * Login for staff members (ADMIN, MANAGER, OFFICER, FINANCE)
   */
  // The plugin-wide limiter (1200/min per IP, registered in index.ts) is sized
  // for normal app traffic, not a credential-stuffing deterrent — at that
  // ceiling an attacker gets 20 guesses/second against one account. Login and
  // OTP endpoints get their own much tighter per-IP ceiling on top of it.
  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, password, totp } = loginSchema.parse(request.body) as LoginInput;

    // Pre-tenant: the tenant isn't known until this resolves — dbPlatform.
    const user = await dbPlatform
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    /**
     * Seeded throwaway accounts must not be usable in production.
     *
     * The six that prompted this — one per access level, so that
     * role-differentiated behaviour could be tested at all, since a SUPER_ADMIN
     * passes every check — have since been promoted to real staff of their
     * tenant on that company's own domain. No account matches this rule today.
     *
     * It stays because the seed scripts that created them still exist, and the
     * next batch of throwaways would otherwise reach production the same way.
     * .test is reserved by RFC 2606 precisely so it can never resolve, which
     * makes it safe to refuse outright: no real customer can ever hold one.
     */
    if (env.APP_ENV === 'production' && /@hudumika\.test$/i.test(user.email)) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', request.ip, String(request.headers['user-agent'] || ''));
      return reply.status(403).send({
        error: 'This is a seeded test account and cannot be used in production.',
      });
    }

    const ip = request.ip;
    const userAgent = String(request.headers['user-agent'] || '');

    // Node-native crypto check for security without external binary packages
    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', ip, userAgent);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Transparent rehash-on-login: the password is already known-good (it
    // just matched), so this is the one safe moment to silently replace a
    // hash created under a weaker/older iteration count with a current one —
    // no forced reset, no bulk migration, every account upgrades itself the
    // next time its owner actually signs in.
    if (needsRehash(user.password_hash)) {
      await withTenant(user.tenant_id, trx => trx.updateTable('users').set({ password_hash: hashPassword(password) }).where('id', '=', user.id).execute());
    }

    // Second factor — only gates login once the user has actually completed
    // setup+verification in Workspace ▸ Security (user_totp.enabled). Not
    // sent back with a fake "verified" state: the client must submit a real
    // TOTP code that verifyTotp() checks before a token is ever issued.
    const totpRow = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.id).executeTakeFirst());
    if (totpRow?.enabled) {
      if (!totp) {
        return reply.status(200).send({ requires_2fa: true });
      }
      if (!verifyTotp(totpRow.secret, totp)) {
        await recordLogin(user.tenant_id, user.id, 'FAILED', ip, userAgent);
        return reply.status(401).send({ error: 'Invalid authentication code' });
      }
    }

    const deviceId = await recordLogin(user.tenant_id, user.id, 'SUCCESS', ip, userAgent);

    // Generate JWT
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
      name: user.name,
      ...(deviceId ? { device_id: deviceId } : {}),
    };

    const tokens = issueTokens(fastify, payload as any);
    const safeUser: SafeUser = {
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

    setSessionCookies(reply, tokens);
    return { ...tokens, user: safeUser };
  });

  /**
   * POST /auth/accept-invite
   * Completes an HR invitation: creates the real user and logs them in.
   */
  fastify.post('/accept-invite', async (request, reply) => {
    const { token, name, password } = acceptInviteSchema.parse(request.body);

    // Pre-tenant: the invite lookup by token is what discovers the tenant.
    const invite = await dbPlatform.selectFrom('hr_invitations').selectAll()
      .where('token', '=', token).executeTakeFirst();
    if (!invite) return reply.status(404).send({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return reply.status(400).send({ error: 'Invitation is no longer valid' });
    if (new Date(invite.expires_at) < new Date()) {
      await withTenant(invite.tenant_id, trx => trx.updateTable('hr_invitations').set({ status: 'EXPIRED' }).where('id', '=', invite.id).execute());
      return reply.status(400).send({ error: 'Invitation has expired' });
    }

    // The invite's own tenant is now known — everything past this point is
    // that tenant's own data.
    const { newUser } = await withTenant(invite.tenant_id, async (trx) => {
      const newUser = await trx.insertInto('users').values({
        tenant_id: invite.tenant_id,
        email: invite.email,
        password_hash: hashPassword(password),
        role: invite.role as any,
        name,
        active: true,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.updateTable('hr_invitations').set({ status: 'ACCEPTED' }).where('id', '=', invite.id).execute();
      return { newUser };
    });

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: newUser.id, tenant_id: newUser.tenant_id, role: newUser.role, email: newUser.email, name: newUser.name,
    };
    const tokens = issueTokens(fastify, payload as any);
    const safeUser: SafeUser = {
      id: newUser.id, tenant_id: newUser.tenant_id, email: newUser.email, role: newUser.role, name: newUser.name,
      phone: newUser.phone || undefined, location_id: newUser.location_id || undefined, active: newUser.active,
      created_at: newUser.created_at.toISOString(), updated_at: newUser.updated_at.toISOString(),
    };

    setSessionCookies(reply, tokens);
    return { ...tokens, user: safeUser };
  });

  /**
   * POST /auth/forgot-password
   * Sends a reset link if the email matches an active account. Always
   * returns a generic success message so callers can't enumerate accounts.
   */
  fastify.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    // Pre-tenant: an unauthenticated email lookup, and password_reset_tokens
    // itself carries no tenant_id at all (its own security boundary is
    // possession of the emailed token, not tenant membership) — dbPlatform.
    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();

    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await dbPlatform.insertInto('password_reset_tokens').values({ user_id: user.id, token, expires_at: expiresAt }).execute();

      const resetUrl = `${env.OPS_BOARD_URL}/auth/reset-password?token=${token}`;
      await MailService.enqueueTemplated(user.tenant_id, 'auth.password_reset', user.email, { resetUrl }, 'auth')
        .catch(() => { /* token still exists; user can retry */ });
    }

    return { ok: true, message: 'If that email is registered, a reset link has been sent.' };
  });

  /**
   * POST /auth/reset-password
   * Completes a password reset from a token issued by /forgot-password.
   */
  fastify.post('/reset-password', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body);

    // Same reasoning as /forgot-password above — dbPlatform throughout.
    const row = await dbPlatform.selectFrom('password_reset_tokens').selectAll()
      .where('token', '=', token).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Invalid or expired reset link' });
    if (row.used_at) return reply.status(400).send({ error: 'This reset link has already been used' });
    if (new Date(row.expires_at) < new Date()) return reply.status(400).send({ error: 'This reset link has expired' });

    await dbPlatform.updateTable('users').set({ password_hash: hashPassword(password), updated_at: new Date() })
      .where('id', '=', row.user_id).execute();
    await dbPlatform.updateTable('password_reset_tokens').set({ used_at: new Date() }).where('id', '=', row.id).execute();

    return { ok: true };
  });

  /**
   * POST /auth/customer-otp
   * Request OTP login for customers
   */
  fastify.post('/customer-otp', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { phone_wa } = customerOtpSchema.parse(request.body) as CustomerOTPInput;

    // Pre-tenant: phone-number lookup across all tenants, same reasoning as
    // /login's email lookup.
    const customer = await dbPlatform
      .selectFrom('customers')
      .selectAll()
      .where('phone_wa', '=', phone_wa)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!customer) {
      return reply.status(404).send({ error: 'Customer phone number not registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    OTP_STORE.set(phone_wa, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min expiry
    });

    console.log(`📱 [OTP Login] Generated OTP for customer ${customer.name} (${phone_wa}): ${otp}`);

    // In production, we'd send this via WhatsApp Meta API.
    // For local testing, we simulate it.
    return {
      success: true,
      message: 'OTP sent successfully (Simulated). Check API server terminal output.',
    };
  });

  /**
   * POST /auth/customer/verify
   * Verify OTP code and login customer
   */
  fastify.post('/customer/verify', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { phone_wa, otp } = customerVerifySchema.parse(request.body);

    // Dev-only bypass: real OTP delivery via WhatsApp isn't wired up yet (see
    // the comment on /customer-otp above), so local/staging testing needs a
    // fixed code that always works. This was previously unconditional — in
    // any environment, POSTing {phone_wa, otp:"123456"} for any phone number
    // with an active `customers` row (no prior /customer-otp call needed)
    // returned a real, valid session JWT for that customer. A live,
    // unauthenticated authentication-bypass endpoint, gated on nothing.
    if (env.APP_ENV !== 'production' && otp === '123456' && !OTP_STORE.has(phone_wa)) {
      OTP_STORE.set(phone_wa, { otp: '123456', expiresAt: Date.now() + 5 * 60 * 1000 });
    }

    const record = OTP_STORE.get(phone_wa);
    const devBypassOk = env.APP_ENV !== 'production' && otp === '123456';
    if (!record || record.expiresAt < Date.now() || (record.otp !== otp && !devBypassOk)) {
      return reply.status(400).send({ error: 'Invalid or expired OTP' });
    }

    OTP_STORE.delete(phone_wa); // consume

    // Pre-tenant, same reasoning as above.
    const customer = await dbPlatform
      .selectFrom('customers')
      .selectAll()
      .where('phone_wa', '=', phone_wa)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!customer) {
      return reply.status(404).send({ error: 'Customer record not found' });
    }

    // Generate customer JWT payload
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: customer.id,
      tenant_id: customer.tenant_id,
      role: 'CUSTOMER',
      email: customer.email || `${customer.id}@hudumika.co`,
      name: customer.name,
    };

    const tokens = issueTokens(fastify, payload as any);
    const safeUser: SafeUser = {
      id: customer.id,
      tenant_id: customer.tenant_id,
      email: customer.email || '',
      role: 'CUSTOMER',
      name: customer.name,
      phone: customer.phone_wa || undefined,
      active: customer.active,
      created_at: customer.created_at.toISOString(),
      updated_at: customer.updated_at.toISOString(),
    };

    setSessionCookies(reply, tokens);
    return { ...tokens, user: safeUser };
  });

  /**
   * POST /auth/org-login
   * Login for an Organization — a platform-level identity spanning every
   * tenant that has linked one of its own customers to it (migration 230).
   * A separate table (organization_users) and endpoint, not folded into
   * /auth/login, matching this file's existing convention of one dedicated
   * mechanism per identity type (staff vs. legacy customer-OTP vs. this).
   * No tenant_id in the issued token at all — see OrgJWTPayload and the
   * ORG_ALLOWED_ROUTES gate in middleware/auth.ts.
   */
  fastify.post('/org-login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { email, password } = orgLoginSchema.parse(request.body) as OrgLoginInput;

    // organization_users carries no tenant_id at all (see the comment above) —
    // genuinely platform-level, not just pre-tenant.
    const orgUser = await dbPlatform
      .selectFrom('organization_users')
      .selectAll()
      .where('email', '=', email)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!orgUser || !verifyPassword(password, orgUser.password_hash)) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (needsRehash(orgUser.password_hash)) {
      await dbPlatform.updateTable('organization_users').set({ password_hash: hashPassword(password) }).where('id', '=', orgUser.id).execute();
    }

    const payload = {
      sub: orgUser.id,
      org_id: orgUser.organization_id,
      role: 'ORG' as const,
      email: orgUser.email,
      name: orgUser.name,
    };
    const tokens = issueTokens(fastify, payload as any);
    const safeOrgUser: SafeOrgUser = {
      id: orgUser.id,
      org_id: orgUser.organization_id,
      email: orgUser.email,
      name: orgUser.name,
      active: orgUser.active,
      created_at: orgUser.created_at.toISOString(),
      updated_at: orgUser.updated_at.toISOString(),
    };

    setSessionCookies(reply, tokens, { org: true });
    return { ...tokens, user: safeOrgUser };
  });

  /**
   * POST /auth/impersonate
   * SUPER_ADMIN only — generate a token acting as a tenant's admin user
   */
  fastify.post('/impersonate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const actor = request.user;
    if (actor.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only SUPER_ADMIN can impersonate' });
    }

    const { tenant_id } = request.body as { tenant_id: string };
    if (!tenant_id) {
      return reply.status(400).send({ error: 'tenant_id is required' });
    }

    // SUPER_ADMIN picking an arbitrary tenant to impersonate into — a
    // genuine cross-tenant read, not this actor's own tenant.
    const target = await dbPlatform
      .selectFrom('users')
      .selectAll()
      .where('tenant_id', '=', tenant_id)
      .where('role', '=', 'TENANT_ADMIN')
      .where('active', '=', true)
      .executeTakeFirst();

    if (!target) {
      return reply.status(404).send({ error: 'No active admin found for this tenant' });
    }

    const deviceId = await registerImpersonationDevice(
      target.tenant_id, target.id, actor.name || actor.email, String(request.headers['user-agent'] || ''),
    );

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: target.id,
      tenant_id: target.tenant_id,
      role: target.role,
      email: target.email,
      name: target.name,
      ...(deviceId ? { device_id: deviceId } : {}),
      impersonated_by: actor.sub,
      impersonated_by_name: actor.name,
    };

    const tokens = issueTokens(fastify, payload as any);
    const safeUser: SafeUser = {
      id: target.id,
      tenant_id: target.tenant_id,
      email: target.email,
      role: target.role,
      name: target.name,
      phone: target.phone || undefined,
      location_id: target.location_id || undefined,
      active: target.active,
      created_at: target.created_at.toISOString(),
      updated_at: target.updated_at.toISOString(),
      impersonated_by: actor.sub,
      impersonated_by_name: actor.name,
    };

    await PlatformAdminService.recordActivity({
      actorUserId: actor.sub, actorName: actor.name || actor.email || 'Unknown superadmin',
      action: 'Logged in as company admin', category: 'user',
      targetType: 'tenant', targetId: target.tenant_id, targetName: target.name, tenantId: target.tenant_id,
      metadata: { impersonated_user_id: target.id },
    });

    // Stash the actor's own current session before overwriting the primary
    // cookies with the impersonated one — /stop-impersonating reads these
    // back to recover the real actor. Only present once the caller's own
    // session was itself cookie-issued (every session is, from here on).
    const actorAccess = request.cookies[COOKIE_NAMES.access];
    const actorRefresh = request.cookies[COOKIE_NAMES.refresh];
    if (actorAccess && actorRefresh) {
      setSuperCookies(reply, actorAccess, actorRefresh, durationSeconds(env.JWT_EXPIRES_IN));
    }
    setSessionCookies(reply, tokens);
    return { ...tokens, user: safeUser };
  });

  /**
   * POST /auth/impersonate-customer
   * SUPER_ADMIN only — generate a token acting as a specific customer, the
   * customer-side counterpart to /auth/impersonate above. Mints whichever of
   * the two CUSTOMER JWT shapes this codebase actually issues at real login:
   * the modern users.customer_id-linked shape (migration 207) when such a
   * user row exists, otherwise the legacy phone-OTP shape (sub = customers.id
   * directly, see POST /auth/customer/verify) — matching resolveCustomerId()'s
   * own precedence in customer-identity.service.ts.
   */
  fastify.post('/impersonate-customer', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const actor = request.user;
    if (actor.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only SUPER_ADMIN can impersonate' });
    }

    const { customer_id } = request.body as { customer_id: string };
    if (!customer_id) {
      return reply.status(400).send({ error: 'customer_id is required' });
    }

    // SUPER_ADMIN picking an arbitrary customer by id — same reasoning as
    // /impersonate above.
    const customer = await dbPlatform.selectFrom('customers').selectAll()
      .where('id', '=', customer_id).where('active', '=', true).executeTakeFirst();
    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found or inactive' });
    }

    const linkedUser = await dbPlatform.selectFrom('users').selectAll()
      .where('customer_id', '=', customer.id).where('tenant_id', '=', customer.tenant_id)
      .where('role', '=', 'CUSTOMER').where('active', '=', true)
      .orderBy('created_at', 'asc').executeTakeFirst();

    // Only the modern shape has a real users.id to hang a device on — the
    // legacy shape below stays device-less, same as a real legacy customer
    // login (see registerImpersonationDevice's own doc comment).
    const deviceId = linkedUser
      ? await registerImpersonationDevice(linkedUser.tenant_id, linkedUser.id, actor.name || actor.email, String(request.headers['user-agent'] || ''))
      : null;

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = linkedUser
      ? {
          sub: linkedUser.id, tenant_id: linkedUser.tenant_id, role: 'CUSTOMER',
          email: linkedUser.email, name: linkedUser.name,
          ...(deviceId ? { device_id: deviceId } : {}),
          impersonated_by: actor.sub, impersonated_by_name: actor.name,
        }
      : {
          sub: customer.id, tenant_id: customer.tenant_id, role: 'CUSTOMER',
          email: customer.email || `${customer.id}@hudumika.co`, name: customer.name,
          impersonated_by: actor.sub, impersonated_by_name: actor.name,
        };

    const tokens = issueTokens(fastify, payload as any);
    const safeUser: SafeUser = linkedUser
      ? {
          id: linkedUser.id, tenant_id: linkedUser.tenant_id, email: linkedUser.email, role: 'CUSTOMER',
          name: linkedUser.name, active: linkedUser.active,
          created_at: linkedUser.created_at.toISOString(), updated_at: linkedUser.updated_at.toISOString(),
          impersonated_by: actor.sub, impersonated_by_name: actor.name,
        }
      : {
          id: customer.id, tenant_id: customer.tenant_id, email: customer.email || '', role: 'CUSTOMER',
          name: customer.name, phone: customer.phone_wa || undefined, active: customer.active,
          created_at: customer.created_at.toISOString(), updated_at: customer.updated_at.toISOString(),
          impersonated_by: actor.sub, impersonated_by_name: actor.name,
        };

    await PlatformAdminService.recordActivity({
      actorUserId: actor.sub, actorName: actor.name || actor.email || 'Unknown superadmin',
      action: 'Logged in as customer', category: 'user',
      targetType: 'customer', targetId: customer.id, targetName: customer.name, tenantId: customer.tenant_id,
      metadata: { via: linkedUser ? 'linked_user' : 'legacy_customer_login' },
    });

    const actorAccess = request.cookies[COOKIE_NAMES.access];
    const actorRefresh = request.cookies[COOKIE_NAMES.refresh];
    if (actorAccess && actorRefresh) {
      setSuperCookies(reply, actorAccess, actorRefresh, durationSeconds(env.JWT_EXPIRES_IN));
    }
    setSessionCookies(reply, tokens);
    return { ...tokens, user: safeUser };
  });

  /**
   * POST /auth/refresh
   *
   * Exchanges a refresh token for a new access token. There was no such
   * endpoint: `refresh_token` was the access token itself, so "refreshing"
   * meant reusing a credential that never expired.
   *
   * Refuses an access token here, and the auth middleware refuses a refresh
   * token everywhere else. Both directions matter — without the second check a
   * stolen 30-day refresh token would just be a 30-day access token.
   *
   * The device is re-checked live, so signing a device out kills its refresh
   * token too rather than letting the session reappear an hour later.
   */
  fastify.post('/refresh', async (request, reply) => {
    const body = (request.body ?? {}) as { refresh_token?: string };
    // Cookie-first, body-fallback — mirrors the same dual-mode everywhere
    // else. A cookie-authenticated caller (the SPA, once migrated) sends no
    // body at all; a Bearer/JSON caller still passes it explicitly.
    const cookieRefresh = request.cookies[COOKIE_NAMES.refresh] || request.cookies[COOKIE_NAMES.orgRefresh];
    const refresh_token = cookieRefresh || body.refresh_token;
    if (!refresh_token) return reply.status(400).send({ error: 'refresh_token is required' });

    // CSRF: this route has no preHandler:[authenticate] of its own (it IS
    // the mechanism that re-authenticates), so the double-submit check is
    // applied explicitly here. Only relevant when the token was sourced
    // from the ambient cookie — a body-supplied token was never CSRF-able
    // in the first place (a forged cross-site request can't read/replay it).
    if (!verifyCsrf(request, reply, !!cookieRefresh)) return;

    let claims: any;
    try {
      claims = fastify.jwt.verify(refresh_token);
    } catch {
      return reply.status(401).send({ error: 'Refresh token is invalid or has expired. Sign in again.' });
    }
    if (claims?.typ !== 'refresh') {
      return reply.status(401).send({ error: 'That is not a refresh token.' });
    }

    // Org sessions (organization_users) have no tenant_id/device_id at all —
    // the hr_devices-based checks below don't apply to them, and never will.
    // See token.service.ts's issueTokens() for why the refresh token now
    // carries `role` at all (it didn't before; this branch was unreachable).
    if (claims.role === 'ORG') {
      const orgUser = await dbPlatform.selectFrom('organization_users').selectAll()
        .where('id', '=', claims.sub).where('active', '=', true).executeTakeFirst();
      if (!orgUser) return reply.status(401).send({ error: 'This account is no longer active.' });

      const tokens = issueTokens(fastify, {
        sub: orgUser.id, org_id: orgUser.organization_id, role: 'ORG', email: orgUser.email, name: orgUser.name,
      } as any);
      setSessionCookies(reply, tokens, { org: true });
      return tokens;
    }

    // Pre-tenant re-verification, deliberately independent of what the token
    // claims — dbPlatform throughout this handler.
    const device = claims.device_id
      ? await dbPlatform.selectFrom('hr_devices').select('revoked_at').where('id', '=', claims.device_id).executeTakeFirst()
      : null;
    if (!claims.device_id || device?.revoked_at) {
      return reply.status(401).send({ error: 'This session has been signed out.' });
    }

    // Re-read the user: a role change, a deactivation or a move between tenants
    // must take effect on refresh rather than riding the old claims for 30 days.
    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('id', '=', claims.sub).where('active', '=', true).executeTakeFirst();
    if (!user) return reply.status(401).send({ error: 'This account is no longer active.' });

    await dbPlatform.updateTable('hr_devices').set({ last_used_at: new Date() })
      .where('id', '=', claims.device_id).execute();

    const tokens = issueTokens(fastify, {
      sub: user.id, tenant_id: user.tenant_id, role: user.role,
      email: user.email, name: user.name, device_id: claims.device_id,
      // Impersonation is a property of the session (the verified refresh
      // token), not the re-fetched target user — carried through as-is.
      ...(claims.impersonated_by ? { impersonated_by: claims.impersonated_by, impersonated_by_name: claims.impersonated_by_name } : {}),
    });
    setSessionCookies(reply, tokens);
    return tokens;
  });

  /**
   * POST /auth/logout
   *
   * Signing out was a localStorage wipe and nothing else, which left two ways
   * back in. The access token stayed valid for its full hour wherever a copy
   * of it existed, and the refresh token — good for thirty days, and the one
   * the client did not even clear — would mint fresh access tokens on demand.
   * Neither the browser nor the server had any record that the session ended.
   *
   * Revoking the device row closes both: middleware/auth.ts rejects any access
   * token whose device_id is revoked, and /auth/refresh above refuses to mint
   * from one. Every tab in this browser shares one hr_devices row (they share a
   * User-Agent), so one sign-out ends the session for all of them server-side —
   * the storage-event listener in useAuth.tsx only makes the UI agree promptly.
   *
   * Signing back in clears revoked_at (see recordLogin), so this is a sign-out,
   * not a device ban.
   */
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const actor = request.user;

    // organization_users has no device/revocation concept at all — clearing
    // its cookies (plus any stashed super_* pair, in case an impersonation
    // was mid-flight) is the entire sign-out.
    if ((actor.role as string) === 'ORG') {
      clearSessionCookies(reply, { org: true });
      clearSuperCookies(reply);
      return { success: true, revoked: false };
    }

    clearSessionCookies(reply);
    clearSuperCookies(reply);

    // No device_id means a token minted before device tracking existed; there
    // is nothing to revoke, and the client clearing its own keys is all that
    // is left to do. Not an error — sign-out must always appear to succeed.
    if (!actor.device_id) return { success: true, revoked: false };

    return withTenant(actor.tenant_id, async (trx) => {
      const revoked = await trx.updateTable('hr_devices')
        .set({ revoked_at: new Date() })
        .where('id', '=', actor.device_id!)
        .where('user_id', '=', actor.sub)
        .where('tenant_id', '=', actor.tenant_id)
        .returning('id')
        .executeTakeFirst();
      return { success: true, revoked: !!revoked };
    });
  });

  /**
   * POST /auth/change-password
   * Authenticated user changes their own password.
   */
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const actor = request.user;
    const { current_password, new_password } = request.body as { current_password: string; new_password: string };

    if (!current_password || !new_password) {
      return reply.status(400).send({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    }

    return withTenant(actor.tenant_id, async (trx) => {
      const user = await trx.selectFrom('users').selectAll().where('id', '=', actor.sub).executeTakeFirst();
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const isMatch = verifyPassword(current_password, user.password_hash);
      if (!isMatch) return reply.status(401).send({ error: 'Current password is incorrect' });

      const new_hash = hashPassword(new_password);

      await trx.updateTable('users').set({ password_hash: new_hash, updated_at: new Date() }).where('id', '=', actor.sub).execute();
      return { success: true };
    });
  });

  /**
   * PATCH /auth/me
   * Authenticated user updates their own profile. Self-service only — id is
   * always the caller's own (request.user.sub from the JWT), never a param,
   * so there's no cross-tenant/cross-user access surface to guard against.
   */
  fastify.patch('/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const actor = request.user;
    const body = request.body as { name?: string; phone?: string; avatar_url?: string | null; profile?: Record<string, any> };

    const patch: Record<string, any> = { updated_at: new Date() };
    if (typeof body.name === 'string') {
      if (!body.name.trim()) return reply.status(400).send({ error: 'Name cannot be empty' });
      patch.name = body.name.trim();
    }
    if (typeof body.phone === 'string') patch.phone = body.phone.trim() || null;
    if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url ? body.avatar_url.trim() : null;

    const updated = await withTenant(actor.tenant_id, async (trx) => {
      if (body.profile && typeof body.profile === 'object') {
        const existing = await trx.selectFrom('users').select('profile').where('id', '=', actor.sub).executeTakeFirst();
        // Guarded: the driver hands JSONB back as a string in some paths, but a
        // malformed value would throw here and 500 the whole profile update
        // rather than just losing one field.
        let existingProfile: Record<string, any> = {};
        if (typeof existing?.profile === 'string') {
          try { existingProfile = JSON.parse(existing.profile) || {}; } catch { existingProfile = {}; }
        } else {
          existingProfile = (existing?.profile as Record<string, any>) || {};
        }
        patch.profile = JSON.stringify({ ...existingProfile, ...body.profile });
      }

      await trx.updateTable('users').set(patch).where('id', '=', actor.sub).execute();

      return trx.selectFrom('users').selectAll().where('id', '=', actor.sub).executeTakeFirst();
    });
    if (!updated) return reply.status(404).send({ error: 'User not found' });

    const safeUser: SafeUser & { profile?: Record<string, any> } = {
      id: updated.id,
      tenant_id: updated.tenant_id,
      email: updated.email,
      role: updated.role,
      name: updated.name,
      phone: updated.phone || undefined,
      avatar_url: updated.avatar_url || undefined,
      location_id: updated.location_id || undefined,
      profile: typeof updated.profile === 'string' ? JSON.parse(updated.profile) : (updated.profile || {}),
      active: updated.active,
      last_login_at: updated.last_login_at ? updated.last_login_at.toISOString() : undefined,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    };
    return { user: safeUser };
  });

  /**
   * POST /auth/stop-impersonating
   *
   * Used to work by having the client restore the SuperAdmin's own token to
   * localStorage before calling this, so it authenticated as the real actor
   * with no JWT trickery needed. That's impossible once the token is an
   * httpOnly cookie — JS can't read a cookie's value to stash it, and can't
   * swap one cookie's value in before a single fetch. The server does the
   * stacking instead now: /auth/impersonate copies the caller's own current
   * session into hudumika_super_access/_refresh before overwriting the
   * primary pair (see lib/cookies.ts's setSuperCookies), and this handler
   * reads that stash back — NOT request.user, which under cookie-priority
   * extraction (middleware/auth.ts) resolves to the *impersonated* identity,
   * since the primary cookie still holds it at this point.
   */
  fastify.post('/stop-impersonating', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const superAccess = request.cookies[COOKIE_NAMES.superAccess];
    const superRefresh = request.cookies[COOKIE_NAMES.superRefresh];
    if (!superAccess || !superRefresh) {
      return { success: false, reason: 'no_active_impersonation' };
    }

    let actor: { sub: string; name?: string; email?: string; role: string };
    try {
      actor = fastify.jwt.verify(superAccess);
    } catch {
      // Stale/expired stash — nothing safe to restore. Clear it so the
      // client doesn't keep retrying against a dead cookie; the primary
      // (impersonated) session is left exactly as it was, since there's no
      // verified real actor to hand control back to.
      clearSuperCookies(reply);
      return { success: false, reason: 'stale_session' };
    }

    const body = request.body as { target_id?: string; target_role?: string; tenant_id?: string; target_name?: string } | undefined;
    if (actor.role === 'SUPER_ADMIN' && body?.target_id) {
      await PlatformAdminService.recordActivity({
        actorUserId: actor.sub, actorName: actor.name || actor.email || 'Unknown superadmin',
        action: body.target_role === 'CUSTOMER' ? 'Stopped impersonating customer' : 'Stopped impersonating company admin',
        category: 'user',
        targetType: body.target_role === 'CUSTOMER' ? 'customer' : 'tenant',
        targetId: body.target_id, targetName: body.target_name ?? null, tenantId: body.tenant_id ?? null,
      });
    }

    setSessionCookies(reply, { access_token: superAccess, refresh_token: superRefresh, expires_in: durationSeconds(env.JWT_EXPIRES_IN) });
    clearSuperCookies(reply);
    return { success: true };
  });

  /**
   * POST /auth/verify-password — the idle-lock unlock check.
   *
   * Re-checks the *current* session's own password (request.user.sub is
   * never caller-supplied) without issuing anything: no new tokens, no
   * cookie writes, no hr_login_history/hr_devices row. Locking is a
   * client-side overlay sitting in front of an already-live session — this
   * only answers "does this password match," the same way /login already
   * does, so unlocking is never a weaker check than logging in was.
   */
  fastify.post('/verify-password', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { password, totp } = verifyPasswordSchema.parse(request.body);
    const actor = request.user;

    const user = await dbPlatform.selectFrom('users').selectAll()
      .where('id', '=', actor.sub).where('active', '=', true).executeTakeFirst();
    if (!user || !verifyPassword(password, user.password_hash)) {
      return reply.status(401).send({ error: 'Incorrect password' });
    }

    // Same second-factor gate /login enforces — unlocking must ask for
    // whatever logging in would have asked for.
    const totpRow = await withTenant(user.tenant_id, trx => trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.id).executeTakeFirst());
    if (totpRow?.enabled) {
      if (!totp) return reply.status(200).send({ requires_2fa: true });
      if (!verifyTotp(totpRow.secret, totp)) {
        return reply.status(401).send({ error: 'Invalid authentication code' });
      }
    }

    return { success: true };
  });
}
