import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { withTenant, type Database } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

// Same roster as deals.routes.ts's DEAL_ROLES for reading; only management
// reshapes the pipeline itself, same split as crm-custom-fields.routes.ts.
const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const DEFAULT_STAGES = [
  { key: 'QUALIFICATION', label: 'Qualification', color: 'gold',  position: 0, is_won: false, is_lost: false },
  { key: 'PROPOSAL',      label: 'Proposal',       color: 'blue',  position: 1, is_won: false, is_lost: false },
  { key: 'NEGOTIATION',   label: 'Negotiation',    color: 'teal',  position: 2, is_won: false, is_lost: false },
  { key: 'WON',           label: 'Won',            color: 'green', position: 3, is_won: true,  is_lost: false },
  { key: 'LOST',          label: 'Lost',           color: 'red',   position: 4, is_won: false, is_lost: true  },
] as const;

const COLORS = ['gold', 'blue', 'teal', 'green', 'red', 'purple'] as const;

export type PipelineStage = {
  id: string; key: string; label: string; color: string; position: number;
  is_won: boolean; is_lost: boolean; active: boolean;
};

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'STAGE';

/**
 * Returns this tenant's pipeline stages, seeding the same five defaults
 * migration 459 backfilled for every tenant that existed at the time — so a
 * tenant created afterward (or one whose row was deleted by a stray script)
 * still gets a working pipeline on first read, same lazy-ensure pattern as
 * Drive's cloud_storage_connections auto-row-creation. Ordered by position.
 */
export async function ensurePipelineStages(trx: Transaction<Database>, tenantId: string): Promise<PipelineStage[]> {
  const existing = await trx.selectFrom('crm_pipeline_stages').selectAll()
    .where('tenant_id', '=', tenantId).orderBy('position', 'asc').execute();
  if (existing.length > 0) return existing;

  await trx.insertInto('crm_pipeline_stages').values(
    DEFAULT_STAGES.map(s => ({ tenant_id: tenantId, ...s })),
  ).execute();
  return trx.selectFrom('crm_pipeline_stages').selectAll()
    .where('tenant_id', '=', tenantId).orderBy('position', 'asc').execute();
}

/** The stage a brand-new deal (or a lead just converted) lands in — the
 *  first active, non-terminal stage by position; falls back to the first
 *  stage at all if a tenant has somehow made every stage terminal. */
export function defaultStageKey(stages: PipelineStage[]): string {
  const open = stages.find(s => s.active && !s.is_won && !s.is_lost);
  return (open ?? stages[0])?.key ?? 'QUALIFICATION';
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(60),
  color: z.enum(COLORS).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
});
const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  color: z.enum(COLORS).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
  active: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nothing to update' });
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function crmPipelineStagesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));

  fastify.get('/', { preHandler: requireRole(...READ_ROLES) }, async (request: any, reply) => {
    try {
      const stages = await withTenant(request.user.tenant_id, trx => ensurePipelineStages(trx, request.user.tenant_id));
      // Live deal counts per stage — lets the settings page warn before a
      // delete that would orphan deals, and shows the pipeline isn't just a
      // list of labels nobody's using.
      const counts = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('deals').select(['stage']).select(({ fn }) => [fn.count<string>('id').as('n')])
          .where('tenant_id', '=', request.user.tenant_id).groupBy('stage').execute()
      );
      const byKey = new Map(counts.map((c: any) => [c.stage, Number(c.n)]));
      return stages.map(s => ({ ...s, deal_count: byKey.get(s.key) ?? 0 }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const row = await withTenant(tenantId, async (trx) => {
        const stages = await ensurePipelineStages(trx, tenantId);
        let key = slug(b.label);
        // Uniqueness within the tenant — two stages both labelled "Won"
        // shouldn't collide on the same storage key.
        if (stages.some(s => s.key === key)) key = `${key}_${Date.now().toString(36).toUpperCase()}`;
        const nextPos = stages.length ? Math.max(...stages.map(s => s.position)) + 1 : 0;
        return trx.insertInto('crm_pipeline_stages').values({
          tenant_id: tenantId, key, label: b.label, color: b.color ?? 'blue', position: nextPos,
          is_won: b.is_won ?? false, is_lost: b.is_lost ?? false,
        }).returningAll().executeTakeFirstOrThrow();
      });
      return row;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = patchSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const row = await withTenant(tenantId, async (trx) => {
        const existing = await trx.selectFrom('crm_pipeline_stages').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!existing) return null;
        // A stage can't be both won and lost — a deal needs one unambiguous
        // terminal meaning to close reporting correctly.
        const isWon = b.is_won ?? existing.is_won;
        const isLost = b.is_lost ?? existing.is_lost;
        if (isWon && isLost) throw new Error('A stage cannot be both Won and Lost');
        return trx.updateTable('crm_pipeline_stages').set({
          ...(b.label !== undefined ? { label: b.label } : {}),
          ...(b.color !== undefined ? { color: b.color } : {}),
          ...(b.is_won !== undefined ? { is_won: b.is_won } : {}),
          ...(b.is_lost !== undefined ? { is_lost: b.is_lost } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
          updated_at: new Date(),
        }).where('id', '=', request.params.id).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirstOrThrow();
      });
      if (!row) return reply.status(404).send({ error: 'Stage not found' });
      return row;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/reorder', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = reorderSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async (trx) => {
        const owned = await trx.selectFrom('crm_pipeline_stages').select('id')
          .where('tenant_id', '=', tenantId).where('id', 'in', b.ids).execute();
        if (owned.length !== b.ids.length) throw new Error('One or more stages were not found');
        for (let i = 0; i < b.ids.length; i++) {
          await trx.updateTable('crm_pipeline_stages').set({ position: i, updated_at: new Date() })
            .where('id', '=', b.ids[i]).where('tenant_id', '=', tenantId).execute();
        }
      });
      return { success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async (trx) => {
        const stage = await trx.selectFrom('crm_pipeline_stages').select(['id', 'key'])
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!stage) throw new Error('Stage not found');

        const total = await trx.selectFrom('crm_pipeline_stages').select(({ fn }) => fn.count<string>('id').as('n'))
          .where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
        if (Number(total.n) <= 1) throw new Error('A pipeline needs at least one stage');

        const inUse = await trx.selectFrom('deals').select(({ fn }) => fn.count<string>('id').as('n'))
          .where('tenant_id', '=', tenantId).where('stage', '=', stage.key).executeTakeFirstOrThrow();
        if (Number(inUse.n) > 0) {
          throw new Error(`${inUse.n} deal(s) are in this stage — move them first, then delete it.`);
        }

        await trx.deleteFrom('crm_pipeline_stages').where('id', '=', request.params.id).where('tenant_id', '=', tenantId).execute();
      });
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
