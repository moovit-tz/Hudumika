import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { checkLocationLimit } from '../lib/plan-limits.js';

/**
 * Tenant business locations (migration 001's `locations` table).
 *
 * Separate from the many app-specific `*_locations` tables (warehouse_
 * locations, inventory_locations, seal_locations, hr_locations) — those
 * track operational locations *within* an app and are untouched by this
 * file. This is the base, plan-governed "how many offices/branches does
 * this tenant have" record `checkLocationLimit` (lib/plan-limits.ts) was
 * written against — until now nothing created a row here, so the limit
 * check was unreachable. See LENS-53.
 */

const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(50),
  type: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100),
});

const locationPatchSchema = locationCreateSchema.partial();

export async function locationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('locations').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'asc')
        .execute());
  });

  fastify.post('/', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const body = locationCreateSchema.parse(request.body);

    const check = await checkLocationLimit(user.tenant_id);
    if (!check.allowed) return reply.status(403).send({ error: check.message });

    return withTenant(user.tenant_id, (trx) =>
      trx.insertInto('locations').values({
        tenant_id: user.tenant_id,
        name: body.name,
        code: body.code,
        type: body.type,
        city: body.city,
        country: body.country,
      }).returningAll().executeTakeFirstOrThrow());
  });

  fastify.patch('/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = locationPatchSchema.parse(request.body);
    if (Object.keys(body).length === 0) return reply.status(400).send({ error: 'No fields to update' });

    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('locations').select('id')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Location not found' });

      return trx.updateTable('locations').set(body)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/:id', { preHandler: requireRole('MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };

    return withTenant(user.tenant_id, async (trx) => {
      const deleted = await trx.deleteFrom('locations')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!deleted) return reply.status(404).send({ error: 'Location not found' });
      return { success: true };
    });
  });
}
