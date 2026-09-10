import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { logCrmActivity } from './crm-activity.routes.js';

// Same roster as leads.routes.ts's LEAD_ROLES — a deal is what a lead
// becomes, so whoever can touch one can touch the other.
const DEAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;
// Real values — 447_crm_deals.sql's CHECK constraint.
const DEAL_STAGES = ['QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
const CLOSED_STAGES = new Set(['WON', 'LOST']);

const dealCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  customer_id: z.string().uuid().nullish(),
  lead_id: z.string().uuid().nullish(),
  stage: z.enum(DEAL_STAGES).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  owner_id: z.string().uuid().nullish(),
  source: z.string().max(100).nullish(),
  expected_close: z.string().nullable().optional(),
  notes: z.string().max(5000).nullish(),
});
const dealPatchSchema = dealCreateSchema.partial();
const stageMoveSchema = z.object({
  stage: z.enum(DEAL_STAGES),
  lost_reason: z.string().max(500).nullish(),
});

export function mapDeal(row: any) {
  return {
    id: row.id,
    name: row.name,
    customer_id: row.customer_id ?? undefined,
    customer_name: row.customer_name ?? undefined,
    lead_id: row.lead_id ?? undefined,
    lead_company: row.lead_company ?? undefined,
    stage: row.stage,
    value: Number(row.value),
    currency: row.currency,
    probability: row.probability,
    owner_id: row.owner_id ?? undefined,
    owner_name: row.owner_name ?? undefined,
    source: row.source ?? undefined,
    expected_close: row.expected_close ? new Date(row.expected_close).toISOString().slice(0, 10) : undefined,
    closed_at: row.closed_at ?? undefined,
    lost_reason: row.lost_reason ?? undefined,
    notes: row.notes ?? undefined,
    stage_changed_at: row.stage_changed_at,
    days_in_stage: Math.floor((Date.now() - new Date(row.stage_changed_at).getTime()) / 86_400_000),
    created_at: row.created_at,
  };
}

export const dealSelect = (qb: any): any => qb
  .selectFrom('deals')
  .leftJoin('customers', 'customers.id', 'deals.customer_id')
  .leftJoin('leads', 'leads.id', 'deals.lead_id')
  .leftJoin('users', 'users.id', 'deals.owner_id')
  .select([
    'deals.id', 'deals.name', 'deals.customer_id', 'deals.lead_id', 'deals.stage',
    'deals.value', 'deals.currency', 'deals.probability', 'deals.owner_id', 'deals.source',
    'deals.expected_close', 'deals.closed_at', 'deals.lost_reason', 'deals.notes',
    'deals.stage_changed_at', 'deals.created_at',
    'customers.name as customer_name', 'leads.company as lead_company', 'users.name as owner_name',
  ]);

export async function dealsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...DEAL_ROLES));

  fastify.get('/', async (request: any, reply) => {
    try {
      const rows = await withTenant<any[]>(request.user.tenant_id, trx =>
        dealSelect(trx).where('deals.tenant_id', '=', request.user.tenant_id)
          .orderBy('deals.created_at', 'desc').execute()
      );
      return rows.map(mapDeal);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Pipeline metrics for the dashboard header — value by stage, this
  // month's win rate, and a per-rep leaderboard. All from `deals` alone;
  // no separate rollup table to keep in sync.
  fastify.get('/metrics', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, trx =>
        trx.selectFrom('deals').leftJoin('users', 'users.id', 'deals.owner_id')
          .select([
            'deals.stage', 'deals.value', 'deals.owner_id', 'deals.closed_at',
            'users.name as owner_name',
          ])
          .where('deals.tenant_id', '=', tenantId).execute()
      );

      const byStage: Record<string, { count: number; value: number }> = {};
      for (const s of DEAL_STAGES) byStage[s] = { count: 0, value: 0 };
      for (const r of rows) {
        byStage[r.stage].count++;
        byStage[r.stage].value += Number(r.value);
      }

      const open = rows.filter(r => !CLOSED_STAGES.has(r.stage));
      const openValue = open.reduce((sum, r) => sum + Number(r.value), 0);

      const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
      const closedRecent = rows.filter(r => r.closed_at && new Date(r.closed_at).getTime() >= thirtyDaysAgo);
      const wonRecent = closedRecent.filter(r => r.stage === 'WON');
      const winRate = closedRecent.length ? Math.round((wonRecent.length / closedRecent.length) * 100) : null;

      const leaderboardMap = new Map<string, { owner_id: string; owner_name: string; won: number; value: number }>();
      for (const r of rows) {
        if (r.stage !== 'WON' || !r.owner_id) continue;
        const cur = leaderboardMap.get(r.owner_id) ?? { owner_id: r.owner_id, owner_name: r.owner_name ?? 'Unassigned', won: 0, value: 0 };
        cur.won++;
        cur.value += Number(r.value);
        leaderboardMap.set(r.owner_id, cur);
      }
      const leaderboard = [...leaderboardMap.values()].sort((a, b) => b.value - a.value).slice(0, 10);

      return {
        by_stage: byStage,
        open_count: open.length,
        open_value: openValue,
        win_rate_30d: winRate,
        closed_30d: closedRecent.length,
        leaderboard,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = dealCreateSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const id = await withTenant(tenantId, async trx => {
        const [row] = await trx.insertInto('deals').values({
          tenant_id: tenantId,
          name: b.name,
          customer_id: b.customer_id || null,
          lead_id: b.lead_id || null,
          stage: b.stage || 'QUALIFICATION',
          value: String(b.value ?? 0),
          currency: b.currency || 'TZS',
          probability: b.probability ?? 50,
          owner_id: b.owner_id || null,
          source: b.source || null,
          expected_close: b.expected_close ? new Date(b.expected_close) : null,
          notes: b.notes || null,
          created_by: request.user.sub,
        }).returning('id').execute();
        await logCrmActivity(trx, {
          tenantId, subjectType: 'deal', subjectId: row.id, type: 'created',
          body: `Deal created${b.lead_id ? ' from a converted lead' : ''}`,
          actorId: request.user.sub, actorName: request.user.name,
        });
        return row.id;
      });
      const [row] = await withTenant<any[]>(tenantId, trx => dealSelect(trx).where('deals.id', '=', id).execute());
      return mapDeal(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const b = dealPatchSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (b.name !== undefined) patch.name = b.name;
      if (b.customer_id !== undefined) patch.customer_id = b.customer_id || null;
      if (b.lead_id !== undefined) patch.lead_id = b.lead_id || null;
      if (b.value !== undefined) patch.value = String(b.value);
      if (b.currency !== undefined) patch.currency = b.currency;
      if (b.probability !== undefined) patch.probability = b.probability;
      if (b.owner_id !== undefined) patch.owner_id = b.owner_id || null;
      if (b.source !== undefined) patch.source = b.source || null;
      if (b.expected_close !== undefined) patch.expected_close = b.expected_close ? new Date(b.expected_close) : null;
      if (b.notes !== undefined) patch.notes = b.notes || null;
      // Stage changes go through PATCH /:id/stage, which also stamps
      // stage_changed_at/closed_at — not duplicated here.

      await withTenant<any>(tenantId, trx =>
        trx.updateTable('deals').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).execute()
      );
      const [row] = await withTenant<any[]>(tenantId, trx => dealSelect(trx).where('deals.id', '=', request.params.id).execute());
      if (!row) return reply.status(404).send({ error: 'Deal not found' });
      return mapDeal(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Dedicated stage-move endpoint — the kanban board's drag-and-drop hits
  // this, not the general PATCH, so stage_changed_at (the aging badge's
  // clock) and closed_at (won/lost reporting) are always kept honest
  // together rather than relying on every future caller to remember both.
  fastify.patch('/:id/stage', async (request: any, reply) => {
    const b = stageMoveSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const row = await withTenant(tenantId, async trx => {
        const existing = await trx.selectFrom('deals').select(['id', 'stage'])
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!existing) return null;

        const patch: Record<string, unknown> = {
          stage: b.stage,
          stage_changed_at: new Date(),
          updated_at: new Date(),
          closed_at: CLOSED_STAGES.has(b.stage) ? new Date() : null,
          lost_reason: b.stage === 'LOST' ? (b.lost_reason || null) : null,
        };
        await trx.updateTable('deals').set(patch).where('id', '=', request.params.id).execute();

        if (existing.stage !== b.stage) {
          await logCrmActivity(trx, {
            tenantId, subjectType: 'deal', subjectId: request.params.id, type: 'stage_change',
            body: `Stage moved from ${existing.stage} to ${b.stage}${b.stage === 'LOST' && b.lost_reason ? ` — ${b.lost_reason}` : ''}`,
            meta: { from: existing.stage, to: b.stage, lost_reason: b.lost_reason || undefined },
            actorId: request.user.sub, actorName: request.user.name,
          });
        }
        return dealSelect(trx).where('deals.id', '=', request.params.id).execute();
      });
      if (!row) return reply.status(404).send({ error: 'Deal not found' });
      return mapDeal((row as any[])[0]);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      await withTenant(tenantId, async trx => {
        // Same orphan-prevention as leads.routes.ts's DELETE — crm_activities
        // has no FK to deals (polymorphic subject_id, migration 449).
        await trx.deleteFrom('crm_activities')
          .where('tenant_id', '=', tenantId).where('subject_type', '=', 'deal').where('subject_id', '=', request.params.id).execute();
        await trx.deleteFrom('deals').where('id', '=', request.params.id)
          .where('tenant_id', '=', tenantId).execute();
      });
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
