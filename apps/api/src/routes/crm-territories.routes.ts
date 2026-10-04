import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const TERRITORY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

const criterionSchema = z.object({
  field: z.enum(['source', 'industry', 'location', 'priority', 'company']),
  op:    z.enum(['eq', 'contains', 'starts_with']),
  value: z.string().max(200),
});

const createSchema = z.object({
  name:        z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  active:      z.boolean().optional().default(true),
  criteria:    z.array(criterionSchema).optional().default([]),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullish(),
  member_ids:  z.array(z.string().uuid()).optional().default([]),
});
const patchSchema = createSchema.partial();
const idParam     = z.object({ id: z.string().uuid() });

export async function crmTerritoriesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));

  /* GET /v1/crm/territories — list with member count */
  fastify.get('/', { preHandler: [requireRole(...READ_ROLES)] }, async (request: any) => {
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async trx => {
      const territories = await trx.selectFrom('crm_territories as t')
        .select(['t.id', 't.name', 't.description', 't.active', 't.criteria', 't.color', 't.created_at'])
        .where('t.tenant_id', '=', tenantId)
        .orderBy('t.name', 'asc')
        .execute();

      const members = await trx.selectFrom('crm_territory_members as m')
        .leftJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.territory_id', 'm.user_id', 'u.name as user_name'])
        .where('m.tenant_id', '=', tenantId)
        .execute();

      const memberMap = new Map<string, { user_id: string; user_name: string | null }[]>();
      for (const m of members) {
        const list = memberMap.get(m.territory_id) ?? [];
        list.push({ user_id: m.user_id, user_name: m.user_name });
        memberMap.set(m.territory_id, list);
      }

      return territories.map((t: any) => ({
        ...t,
        members: memberMap.get(t.id) ?? [],
      }));
    });
  });

  /* GET /v1/crm/territories/:id */
  fastify.get('/:id', { preHandler: [requireRole(...READ_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, async trx => {
      const territory = await trx.selectFrom('crm_territories as t')
        .selectAll().where('t.id', '=', id).where('t.tenant_id', '=', tenantId)
        .executeTakeFirst();
      if (!territory) return reply.status(404).send({ error: 'Territory not found' });
      const members = await trx.selectFrom('crm_territory_members as m')
        .leftJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.user_id', 'u.name as user_name'])
        .where('m.territory_id', '=', id)
        .execute();
      return { ...territory, members };
    });
  });

  /* POST /v1/crm/territories */
  fastify.post('/', { preHandler: [requireRole(...TERRITORY_ROLES)] }, async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const territory = await withTenant(tenantId, async trx => {
      const row = await trx.insertInto('crm_territories').values({
        tenant_id: tenantId, name: b.name, description: b.description ?? null,
        active: b.active, criteria: JSON.stringify(b.criteria), color: b.color ?? null,
      }).returningAll().executeTakeFirstOrThrow();

      if (b.member_ids.length) {
        await trx.insertInto('crm_territory_members').values(
          b.member_ids.map(uid => ({ tenant_id: tenantId, territory_id: row.id, user_id: uid }))
        ).execute();
      }
      return row;
    });
    return reply.status(201).send(territory);
  });

  /* PATCH /v1/crm/territories/:id */
  fastify.patch('/:id', { preHandler: [requireRole(...TERRITORY_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const b = patchSchema.parse(request.body);
    const tenantId = request.user.tenant_id;

    await withTenant(tenantId, async trx => {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (b.name        !== undefined) patch.name        = b.name;
      if (b.description !== undefined) patch.description = b.description ?? null;
      if (b.active      !== undefined) patch.active      = b.active;
      if (b.criteria    !== undefined) patch.criteria    = JSON.stringify(b.criteria);
      if (b.color       !== undefined) patch.color       = b.color ?? null;

      await trx.updateTable('crm_territories').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute();

      if (b.member_ids !== undefined) {
        await trx.deleteFrom('crm_territory_members')
          .where('territory_id', '=', id).where('tenant_id', '=', tenantId).execute();
        if (b.member_ids.length) {
          await trx.insertInto('crm_territory_members').values(
            b.member_ids.map(uid => ({ tenant_id: tenantId, territory_id: id, user_id: uid }))
          ).execute();
        }
      }
    });
    return reply.status(204).send();
  });

  /* DELETE /v1/crm/territories/:id */
  fastify.delete('/:id', { preHandler: [requireRole(...TERRITORY_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_territories')
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });

  /* POST /v1/crm/territories/:id/members — add a single member */
  fastify.post('/:id/members', { preHandler: [requireRole(...TERRITORY_ROLES)] }, async (request: any, reply) => {
    const { id } = idParam.parse(request.params);
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(request.body);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.insertInto('crm_territory_members')
        .values({ tenant_id: tenantId, territory_id: id, user_id })
        .onConflict(oc => oc.columns(['territory_id', 'user_id']).doNothing())
        .execute()
    );
    return reply.status(204).send();
  });

  /* DELETE /v1/crm/territories/:id/members/:userId */
  fastify.delete('/:id/members/:userId', { preHandler: [requireRole(...TERRITORY_ROLES)] }, async (request: any, reply) => {
    const { id, userId } = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_territory_members')
        .where('territory_id', '=', id).where('user_id', '=', userId).where('tenant_id', '=', tenantId)
        .execute()
    );
    return reply.status(204).send();
  });
}
