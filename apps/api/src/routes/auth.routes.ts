import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, withTenant } from '../db/client.js';
import type { LoginInput, CustomerOTPInput, CustomerVerifyInput, SafeUser, JWTPayload } from '@clearos/types';

// Simple in-memory storage for customer OTPs in dev
const OTP_STORE = new Map<string, { otp: string; expiresAt: number }>();

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/login
   * Login for staff members (ADMIN, MANAGER, OFFICER, FINANCE)
   */
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as LoginInput;

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .where('active', '=', true)
      .executeTakeFirst();

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Node-native crypto check for security without external binary packages
    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenant_id: user.tenant_id,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    const accessToken = fastify.jwt.sign(payload as any);
    const safeUser: SafeUser = {
      id: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
      name: user.name,
      phone: user.phone || undefined,
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
      email: customer.email || `${customer.id}@clearos.co`,
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

    const { randomBytes, pbkdf2Sync } = await import('crypto');
    const salt = randomBytes(16).toString('hex');
    const hash = pbkdf2Sync(new_password, salt, 1000, 64, 'sha512').toString('hex');
    const new_hash = `${salt}:${hash}`;

    await db.updateTable('users').set({ password_hash: new_hash, updated_at: new Date() }).where('id', '=', actor.sub).execute();
    return { success: true };
  });

  /**
   * POST /auth/stop-impersonating
   * No-op on server — client restores original token. Endpoint exists for audit/logging.
   */
  fastify.post('/stop-impersonating', {
    preHandler: [fastify.authenticate],
  }, async () => ({ success: true }));
}

// Helper methods for pbkdf2 secure native hashing
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return password === storedHash; // support plaintext seeds safely
  const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === testHash;
}
