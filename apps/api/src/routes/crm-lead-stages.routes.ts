import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const READ_ROLES  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  label:    z.string().trim().min(1).max(100),
  color:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  position: z.number().int().min(0).optional().default(0),
  is_won:   z.boolean().optional().default(false),
  is_lost:  z.boolean().optional().default(false),
});
const patchSchema = createSchema.partial();

const reorderSchema = z.array(z.object({
  id:       z.string().uuid(),
  position: z.number().int().min(0),
}));

export async function crmLeadStagesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));

  /* GET /v1/crm/lead-stages */
  fastify.get('/', { preHandler: [requireRole(...READ_ROLES)] }, async (request: any) => {
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, trx =>
      trx.selectFrom('crm_lead_stages')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('position', 'asc')
        .orderBy('label', 'asc')
        .execute()
    );
  });

  /* POST /v1/crm/lead-stages */
  fastify.post('/', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx =>
      trx.insertInto('crm_lead_stages').values({
        tenant_id: tenantId,
        label:     b.label,
        color:     b.color ?? null,
        position:  b.position,
        is_won:    b.is_won,
        is_lost:   b.is_lost,
      }).returningAll().executeTakeFirstOrThrow()
    );
    return reply.status(201).send(row);
  });

  /* PATCH /v1/crm/lead-stages/:id */
  fastify.patch('/:id', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const b = patchSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.label    !== undefined) patch.label    = b.label;
    if (b.color    !== undefined) patch.color    = b.color ?? null;
    if (b.position !== undefined) patch.position = b.position;
    if (b.is_won   !== undefined) patch.is_won   = b.is_won;
    if (b.is_lost  !== undefined) patch.is_lost  = b.is_lost;
    await withTenant(tenantId, trx =>
      trx.updateTable('crm_lead_stages').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });

  /* PUT /v1/crm/lead-stages/reorder — bulk position update */
  fastify.put('/reorder', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const items = reorderSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, async trx => {
      for (const item of items) {
        await trx.updateTable('crm_lead_stages')
          .set({ position: item.position, updated_at: new Date() } as any)
          .where('id', '=', item.id).where('tenant_id', '=', tenantId)
          .execute();
      }
    });
    return reply.status(204).send();
  });

  /* DELETE /v1/crm/lead-stages/:id */
  fastify.delete('/:id', { preHandler: [requireRole(...ADMIN_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const { migrate_to } = z.object({ migrate_to: z.string().uuid().optional() }).parse(request.query);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, async trx => {
      if (migrate_to) {
        await trx.updateTable('leads').set({ stage: migrate_to } as any)
          .where('stage', '=', id).where('tenant_id', '=', tenantId).execute();
      }
      await trx.deleteFrom('crm_lead_stages')
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute();
    });
    return reply.status(204).send();
  });
}
