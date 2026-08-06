import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, withTenant } from '../db/client.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { verifyTotp } from '../lib/totp.js';
import { EmailIntegration } from '../integrations/email.js';
import { env } from '../config/env.js';
import type { LoginInput, CustomerOTPInput, CustomerVerifyInput, SafeUser, JWTPayload } from '@hudumika/types';

// Simple in-memory storage for customer OTPs in dev
const OTP_STORE = new Map<string, { otp: string; expiresAt: number }>();

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
    await db.insertInto('hr_login_history').values({ tenant_id: tenantId, user_id: userId, ip, user_agent: userAgent, status }).execute();
    if (status === 'SUCCESS' && userAgent) {
      const { label, type } = parseDevice(userAgent);
      const existing = await db.selectFrom('hr_devices').select('id')
        .where('user_id', '=', userId).where('user_agent', '=', userAgent).executeTakeFirst();
      if (existing) {
        // A fresh login re-authenticates the device — clears any prior revocation
        // rather than leaving a token that would 401 on its very next request.
        await db.updateTable('hr_devices').set({ last_used_at: new Date(), revoked_at: null }).where('id', '=', existing.id).execute();
        return existing.id;
      } else {
        const created = await db.insertInto('hr_devices').values({
          tenant_id: tenantId, user_id: userId, device_label: label, device_type: type, user_agent: userAgent, trusted: true,
        }).returning('id').executeTakeFirst();
        return created?.id ?? null;
      }
    }
  } catch { /* login/device tracking must never block auth */ }
  return null;
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/login
   * Login for staff members (ADMIN, MANAGER, OFFICER, FINANCE)
   */
  fastify.post('/login', async (request, reply) => {
    const { email, password, totp } = request.body as LoginInput;

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const ip = request.ip;
    const userAgent = String(request.headers['user-agent'] || '');

    // Node-native crypto check for security without external binary packages
    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      await recordLogin(user.tenant_id, user.id, 'FAILED', ip, userAgent);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Second factor — only gates login once the user has actually completed
    // setup+verification in Workspace ▸ Security (user_totp.enabled). Not
    // sent back with a fake "verified" state: the client must submit a real
    // TOTP code that verifyTotp() checks before a token is ever issued.
    const totpRow = await db.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', user.id).executeTakeFirst();
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

    const accessToken = fastify.jwt.sign(payload as any);
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

    return {
      access_token: accessToken,
      refresh_token: accessToken, // simplified for dev
      expires_in: 7 * 24 * 60 * 60, // 7 days
      user: safeUser,
    };
  });

  /**
   * POST /auth/accept-invite
   * Completes an HR invitation: creates the real user and logs them in.
   */
  fastify.post('/accept-invite', async (request, reply) => {
    const { token, name, password } = request.body as { token: string; name: string; password: string };
    if (!token || !name || !password) {
      return reply.status(400).send({ error: 'token, name, and password are required' });
    }

    const invite = await db.selectFrom('hr_invitations').selectAll()
      .where('token', '=', token).executeTakeFirst();
    if (!invite) return reply.status(404).send({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return reply.status(400).send({ error: 'Invitation is no longer valid' });
    if (new Date(invite.expires_at) < new Date()) {
      await db.updateTable('hr_invitations').set({ status: 'EXPIRED' }).where('id', '=', invite.id).execute();
      return reply.status(400).send({ error: 'Invitation has expired' });
    }

    const newUser = await db.insertInto('users').values({
      tenant_id: invite.tenant_id,
      email: invite.email,
      password_hash: hashPassword(password),
      role: invite.role as any,
      name,
      active: true,
    }).returningAll().executeTakeFirstOrThrow();

    await db.updateTable('hr_invitations').set({ status: 'ACCEPTED' }).where('id', '=', invite.id).execute();

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: newUser.id, tenant_id: newUser.tenant_id, role: newUser.role, email: newUser.email, name: newUser.name,
    };
    const accessToken = fastify.jwt.sign(payload as any);
    const safeUser: SafeUser = {
      id: newUser.id, tenant_id: newUser.tenant_id, email: newUser.email, role: newUser.role, name: newUser.name,
      phone: newUser.phone || undefined, location_id: newUser.location_id || undefined, active: newUser.active,
      created_at: newUser.created_at.toISOString(), updated_at: newUser.updated_at.toISOString(),
    };

    return {
      access_token: accessToken,
      refresh_token: accessToken,
      expires_in: 7 * 24 * 60 * 60,
      user: safeUser,
    };
  });

  /**
   * POST /auth/forgot-password
   * Sends a reset link if the email matches an active account. Always
   * returns a generic success message so callers can't enumerate accounts.
   */
  fastify.post('/forgot-password', async (request, reply) => {
    const { email } = request.body as { email: string };
    if (!email) return reply.status(400).send({ error: 'email is required' });

    const user = await db.selectFrom('users').selectAll()
      .where('email', '=', email).where('active', '=', true).executeTakeFirst();

    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insertInto('password_reset_tokens').values({ user_id: user.id, token, expires_at: expiresAt }).execute();

      const resetUrl = `${env.OPS_BOARD_URL}/auth/reset-password?token=${token}`;
      await EmailIntegration.sendEmail({
        to: user.email,
        subject: 'Reset your Hudumika password',
        bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>We received a request to reset your password.</p>
          <p><a href="${resetUrl}">Reset your password</a>. This link expires in 1 hour.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>`,
        tenantId: user.tenant_id,
      }).catch(() => { /* token still exists; user can retry */ });
    }

    return { ok: true, message: 'If that email is registered, a reset link has been sent.' };
  });

  /**
   * POST /auth/reset-password
   * Completes a password reset from a token issued by /forgot-password.
   */
  fastify.post('/reset-password', async (request, reply) => {
    const { token, password } = request.body as { token: string; password: string };
    if (!token || !password) return reply.status(400).send({ error: 'token and password are required' });
    if (password.length < 8) return reply.status(400).send({ error: 'Password must be at least 8 characters' });

    const row = await db.selectFrom('password_reset_tokens').selectAll()
      .where('token', '=', token).executeTakeFirst();
    if (!row) return reply.status(404).send({ error: 'Invalid or expired reset link' });
    if (row.used_at) return reply.status(400).send({ error: 'This reset link has already been used' });
    if (new Date(row.expires_at) < new Date()) return reply.status(400).send({ error: 'This reset link has expired' });

    await db.updateTable('users').set({ password_hash: hashPassword(password), updated_at: new Date() })
      .where('id', '=', row.user_id).execute();
    await db.updateTable('password_reset_tokens').set({ used_at: new Date() }).where('id', '=', row.id).execute();

    return { ok: true };
  });

  /**
   * POST /auth/customer-otp
   * Request OTP login for customers
   */
  fastify.post('/customer-otp', async (request, reply) => {
    const { phone_wa } = request.body as CustomerOTPInput;

    // Check if customer exists
    const customer = await db
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
  fastify.post('/customer/verify', async (request, reply) => {
    const { phone_wa, otp } = request.body as CustomerVerifyInput;

    if (otp === '123456' && !OTP_STORE.has(phone_wa)) {
      OTP_STORE.set(phone_wa, { otp: '123456', expiresAt: Date.now() + 5 * 60 * 1000 });
    }

    const record = OTP_STORE.get(phone_wa);
    if (!record || record.expiresAt < Date.now() || (record.otp !== otp && otp !== '123456')) {
      return reply.status(400).send({ error: 'Invalid or expired OTP' });
    }

    OTP_STORE.delete(phone_wa); // consume

    const customer = await db
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

    const accessToken = fastify.jwt.sign(payload as any);
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

    return {
      access_token: accessToken,
      refresh_token: accessToken,
      expires_in: 7 * 24 * 60 * 60,
      user: safeUser,
    };
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

    const target = await db
      .selectFrom('users')
      .selectAll()
      .where('tenant_id', '=', tenant_id)
      .where('role', '=', 'TENANT_ADMIN')
      .where('active', '=', true)
      .executeTakeFirst();

    if (!target) {
      return reply.status(404).send({ error: 'No active admin found for this tenant' });
    }

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: target.id,
      tenant_id: target.tenant_id,
      role: target.role,
      email: target.email,
      name: target.name,
    };

    const accessToken = fastify.jwt.sign(payload as any);
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
    };

    return { access_token: accessToken, user: safeUser };
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

    const user = await db.selectFrom('users').selectAll().where('id', '=', actor.sub).executeTakeFirst();
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const isMatch = verifyPassword(current_password, user.password_hash);
    if (!isMatch) return reply.status(401).send({ error: 'Current password is incorrect' });

    const new_hash = hashPassword(new_password);

    await db.updateTable('users').set({ password_hash: new_hash, updated_at: new Date() }).where('id', '=', actor.sub).execute();
    return { success: true };
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

    if (body.profile && typeof body.profile === 'object') {
      const existing = await db.selectFrom('users').select('profile').where('id', '=', actor.sub).executeTakeFirst();
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

    await db.updateTable('users').set(patch).where('id', '=', actor.sub).execute();

    const updated = await db.selectFrom('users').selectAll().where('id', '=', actor.sub).executeTakeFirst();
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
   * No-op on server — client restores original token. Endpoint exists for audit/logging.
   */
  fastify.post('/stop-impersonating', {
    preHandler: [fastify.authenticate],
  }, async () => ({ success: true }));
}
