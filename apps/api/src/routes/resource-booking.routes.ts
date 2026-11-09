import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { createBookableResource, bookResource, cancelBooking } from '../services/resource-booking.service.js';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'] as const;
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

export async function resourceBookingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'finance.core']));

  fastify.get('/resources', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('bookable_resources').selectAll()
      .where('tenant_id', '=', user.tenant_id).orderBy('name').execute());
  });

  fastify.post('/resources', { preHandler: requireRole(...MANAGER_ROLES) }, async (request) => {
    const user = request.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      resource_type: z.string().trim().max(100).nullable().optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      capacity: z.number().int().positive().optional(),
    }).parse(request.body);
    return withTenant(user.tenant_id, trx => createBookableResource(trx, user.tenant_id, {
      name: body.name, resourceType: body.resource_type, description: body.description, capacity: body.capacity, actorId: user.sub,
    }));
  });

  fastify.patch('/resources/:id', { preHandler: requireRole(...MANAGER_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ active: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional(), capacity: z.number().int().positive().optional() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('bookable_resources').select('id').where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Resource not found.' });
      return trx.updateTable('bookable_resources').set(body).where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });

  // Window-filtered so a resource's calendar can be rendered without
  // pulling its entire booking history.
  fastify.get('/resources/:id/bookings', async (request) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { from, to } = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('resource_bookings').selectAll().where('tenant_id', '=', user.tenant_id).where('resource_id', '=', id);
      if (from) q = q.where('ends_at', '>', new Date(from));
      if (to) q = q.where('starts_at', '<', new Date(to));
      return q.orderBy('starts_at').execute();
    });
  });

  fastify.post('/bookings', { preHandler: requireRole(...STAFF_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      resource_id: z.string().uuid(),
      customer_id: z.string().uuid().nullable().optional(),
      starts_at: z.string().datetime(),
      ends_at: z.string().datetime(),
      qty: z.number().int().positive().optional(),
      note: z.string().trim().max(2000).nullable().optional(),
    }).parse(request.body);

    try {
      return await withTenant(user.tenant_id, trx => bookResource(trx, user.tenant_id, {
        resourceId: body.resource_id, customerId: body.customer_id, bookedBy: user.sub,
        startsAt: new Date(body.starts_at), endsAt: new Date(body.ends_at), qty: body.qty, note: body.note,
      }));
    } catch (error: any) {
      if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  fastify.post('/bookings/:id/cancel', { preHandler: requireRole(...STAFF_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(request.body);
    try {
      return await withTenant(user.tenant_id, trx => cancelBooking(trx, user.tenant_id, id, user.sub, body.reason));
    } catch (error: any) {
      if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
