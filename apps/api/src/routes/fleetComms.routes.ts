import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { WhatsAppIntegration } from '../integrations/whatsapp.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

export async function fleetCommsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Driver Chat (internal ops <-> driver thread) ─────────────

  fastify.get('/drivers/:id/messages', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('driver_messages').selectAll()
        .where('driver_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc').limit(500).execute()
    );
  });

  fastify.post('/drivers/:id/messages', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { message: string; trip_id?: string };
    return withTenant(user.tenant_id, async (trx) =>
      trx.insertInto('driver_messages').values({
        tenant_id: user.tenant_id,
        driver_id: id,
        trip_id: body.trip_id ?? null,
        sender_type: 'OPS',
        sender_id: user.sub,
        message: body.message,
      } as any).returningAll().executeTakeFirstOrThrow()
    );
  });

  // ── WhatsApp quick action (reuses the existing integration, no new inbox) ──

  fastify.post('/drivers/:id/notify-whatsapp', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { message } = req.body as { message: string };

    const driver = await withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('drivers').select(['id', 'phone', 'name'])
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
    );
    if (!driver?.phone) return reply.status(400).send({ error: 'Driver has no phone number on file' });

    const result = await WhatsAppIntegration.sendMessage(driver.phone, message);
    return result;
  });
}
