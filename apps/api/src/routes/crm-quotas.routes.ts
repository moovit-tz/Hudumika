import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const QUOTA_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const READ_ROLES  = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM');
const upsertSchema = z.object({
  user_id:      z.string().uuid(),
  period:       periodSchema,
  target_value: z.number().min(0),
  target_count: z.number().int().min(0).optional().default(0),
});

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export async function crmQuotasRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));

  /* GET /v1/crm/quotas/attainment?period=YYYY-MM */
  fastify.get('/attainment', { preHandler: [requireRole(...READ_ROLES)] }, async (request: any) => {
    const { period } = z.object({ period: periodSchema.optional() }).parse(request.query);
    const p = period || currentPeriod();
    const tenantId = request.user.tenant_id;

    return withTenant(tenantId, async trx => {
      const [quotas, wins] = await Promise.all([
        trx.selectFrom('crm_sales_quotas as q')
          .leftJoin('users as u', 'u.id', 'q.user_id')
          .select(['q.user_id', 'q.target_value', 'q.target_count', 'u.name as user_name'])
          .where('q.tenant_id', '=', tenantId)
          .where('q.period', '=', p)
          .execute(),
        trx.selectFrom('deals')
          .select([
            'owner_id',
            sql<string>`count(*)`.as('won_count'),
            sql<string>`coalesce(sum(value::numeric), 0)`.as('won_value'),
          ])
          .where('tenant_id', '=', tenantId)
          .where(sql`stage_changed_at >= date_trunc('month', to_date(${p}, 'YYYY-MM'))` as any)
          .where(sql`stage_changed_at < date_trunc('month', to_date(${p}, 'YYYY-MM')) + interval '1 month'` as any)
          .where(sql`closed_at is not null` as any)
          .where('lost_reason', 'is', null)
          .groupBy('owner_id')
          .execute(),
      ]);

      const winMap = new Map(wins.map(w => [w.owner_id, w]));
      return quotas.map(q => {
        const w = winMap.get(q.user_id);
        const wonValue  = Number(w?.won_value ?? 0);
        const wonCount  = Number(w?.won_count ?? 0);
        const tgtValue  = Number(q.target_value);
        const tgtCount  = Number(q.target_count);
        return {
          user_id:      q.user_id,
          user_name:    q.user_name,
          period:       p,
          target_value: tgtValue,
          target_count: tgtCount,
          won_value:    wonValue,
          won_count:    wonCount,
          attainment_pct: tgtValue > 0 ? Math.round(wonValue / tgtValue * 100) : null,
          count_pct:      tgtCount > 0 ? Math.round(wonCount / tgtCount * 100) : null,
        };
      });
    });
  });

  /* GET /v1/crm/quotas?period=YYYY-MM — list all quotas for a period (managers) */
  fastify.get('/', { preHandler: [requireRole(...QUOTA_ROLES)] }, async (request: any) => {
    const { period } = z.object({ period: periodSchema.optional() }).parse(request.query);
    const p = period || currentPeriod();
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, trx =>
      trx.selectFrom('crm_sales_quotas as q')
        .leftJoin('users as u', 'u.id', 'q.user_id')
        .select(['q.id', 'q.user_id', 'q.period', 'q.target_value', 'q.target_count', 'q.updated_at', 'u.name as user_name'])
        .where('q.tenant_id', '=', tenantId)
        .where('q.period', '=', p)
        .orderBy('u.name', 'asc')
        .execute()
    );
  });

  /* PUT /v1/crm/quotas — upsert one quota (manager only) */
  fastify.put('/', { preHandler: [requireRole(...QUOTA_ROLES)] }, async (request: any, reply) => {
    const b = upsertSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx =>
      trx.insertInto('crm_sales_quotas').values({
        tenant_id: tenantId, user_id: b.user_id, period: b.period,
        target_value: String(b.target_value), target_count: b.target_count,
        updated_at: new Date(),
      })
        .onConflict(oc => oc.columns(['tenant_id', 'user_id', 'period']).doUpdateSet(eb => ({
          target_value: eb.ref('excluded.target_value'),
          target_count: eb.ref('excluded.target_count'),
          updated_at:   new Date() as any,
        })))
        .returningAll()
        .executeTakeFirstOrThrow()
    );
    return reply.status(200).send(row);
  });

  /* DELETE /v1/crm/quotas/:userId/:period */
  fastify.delete('/:userId/:period', { preHandler: [requireRole(...QUOTA_ROLES)] }, async (request: any, reply) => {
    const { userId, period } = z.object({ userId: z.string().uuid(), period: periodSchema }).parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_sales_quotas')
        .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('period', '=', period)
        .execute()
    );
    return reply.status(204).send();
  });
}
