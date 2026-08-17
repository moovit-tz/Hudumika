import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'TENANT_ADMIN', 'OFFICER'] as const;

// Ondi (Identity & Access) — presents the existing users/invitations/login-history
// data (owned by the HR tables) as its own app, plus SSO provider configuration
// that doesn't exist anywhere else. See hr.routes.ts for the underlying HR-facing
// endpoints this mirrors; kept separate rather than migrated to avoid regressing
// the working HR module.
export async function oneidRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('oneid'));

  // ── Users ────────────────────────────────────────────────────

  fastify.get('/users', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('users')
        .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at', 'last_login_at'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name')
        .execute();
    });
  });

  fastify.patch('/users/:id/role', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    // Same fix as hr.routes.ts PATCH /staff/:id/role — this route is
    // reachable by ADMIN/TENANT_ADMIN (both tenant-scoped), and an
    // unvalidated role let either self-grant SUPER_ADMIN on any user in
    // their own tenant.
    const { role } = z.object({ role: z.enum(STAFF_ROLES) }).parse(req.body);
    if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can grant SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ role, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'role'])
        .executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/users/:id/status', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('users').set({ active, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'active'])
        .executeTakeFirstOrThrow();
    });
  });

  // ── Invitations (same hr_invitations table/flow as HR) ─────────

  fastify.get('/invitations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_invitations as i')
        .leftJoin('users as u', 'u.id', 'i.invited_by')
        .select(['i.id', 'i.email', 'i.role', 'i.status', 'i.expires_at', 'i.created_at', 'u.name as invited_by_name'])
        .where('i.tenant_id', '=', user.tenant_id)
        .orderBy('i.created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/invitations', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    // Same fix as hr.routes.ts POST /invitations — the invite's role becomes
    // the accepted user's real role, so this needed the identical guard.
    const body = z.object({
      email: z.string().trim().email().max(320),
      role: z.enum(STAFF_ROLES),
    }).parse(req.body);
    if (body.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can invite a SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await trx.insertInto('hr_invitations').values({
        tenant_id: user.tenant_id, email: body.email, role: body.role,
        token, invited_by: user.sub, expires_at: expiresAt,
      }).returningAll().executeTakeFirstOrThrow();

      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${token}`;
      // Same template key HR's own /invitations uses (hr.routes.ts) — this
      // was byte-identical duplicated HTML before; one template, two callers.
      await MailService.enqueueTemplated(user.tenant_id, 'hr.staff_invitation', body.email, { role: body.role, acceptUrl }, 'oneid')
        .catch(() => { /* invite row exists regardless; resend is available via HR's endpoint */ });

      return invite;
    });
  });

  // ── Login history (already populated by auth.routes.ts on every login) ─

  fastify.get('/login-history', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_login_history as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .select(['l.id', 'l.ip', 'l.user_agent', 'l.status', 'l.created_at', 'u.name as user_name'])
        .where('l.tenant_id', '=', user.tenant_id)
        .orderBy('l.created_at', 'desc')
        .limit(200)
        .execute();
    });
  });

  fastify.get('/devices', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_devices as d')
        .innerJoin('users as u', 'u.id', 'd.user_id')
        .select(['d.id', 'd.device_label', 'd.device_type', 'd.trusted', 'd.last_used_at', 'u.name as user_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.last_used_at', 'desc')
        .execute();
    });
  });

  fastify.patch('/devices/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { trusted } = req.body as { trusted: boolean };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_devices').set({ trusted })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── SSO providers (config registry — see migration 053 header comment:
  //    this is NOT a working SAML/OIDC federation implementation) ────────

  fastify.get('/sso-providers', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('sso_providers')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/sso-providers', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as { provider_type: string; name: string; config?: Record<string, any> };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('sso_providers').values({
        tenant_id: user.tenant_id,
        provider_type: body.provider_type,
        name: body.name,
        config: JSON.stringify(body.config ?? {}),
        created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/sso-providers/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; config?: Record<string, any>; enabled?: boolean };
    return withTenant(user.tenant_id, async (trx) => {
      const updates: Record<string, any> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.config !== undefined) updates.config = JSON.stringify(body.config);
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      return trx.updateTable('sso_providers').set(updates)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/sso-providers/:id', { preHandler: requireRole('ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('sso_providers')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });
}
