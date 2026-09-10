import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

// Fields a scoring rule may test — a lead column, or 'activity_count'
// (from the timeline). Kept in one place so the admin UI and the
// evaluator agree.
export const SCORING_FIELDS: Record<string, { kind: 'text' | 'num' | 'date'; ops: string[] }> = {
  stage:          { kind: 'text', ops: ['eq', 'neq'] },
  source:         { kind: 'text', ops: ['eq', 'neq', 'contains'] },
  priority:       { kind: 'text', ops: ['eq', 'neq'] },
  industry:       { kind: 'text', ops: ['eq', 'neq', 'contains'] },
  value:          { kind: 'num',  ops: ['gt', 'gte', 'lt', 'lte'] },
  activity_count: { kind: 'num',  ops: ['gt', 'gte'] },
  age_days:       { kind: 'num',  ops: ['gt', 'gte', 'lt', 'lte'] },
};

type Rule = { field: string; op: string; value: string | null; points: number };

/** One lead's score = sum of the points of every active rule it matches,
 *  clamped 0-100. `lead` is a mapped lead object; `activityCount` is
 *  looked up in bulk by the caller. */
export function scoreLead(rules: Rule[], lead: any, activityCount: number): number {
  let total = 0;
  const ageDays = lead.created_at ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000) : 0;
  for (const r of rules) {
    const spec = SCORING_FIELDS[r.field];
    if (!spec || !spec.ops.includes(r.op)) continue;
    const actual = r.field === 'activity_count' ? activityCount
      : r.field === 'age_days' ? ageDays
      : (lead as any)[r.field];
    if (matches(spec.kind, r.op, actual, r.value)) total += r.points;
  }
  return Math.max(0, Math.min(100, total));
}

function matches(kind: 'text' | 'num' | 'date', op: string, actual: any, ruleValue: string | null): boolean {
  if (kind === 'num') {
    const a = Number(actual); const b = Number(ruleValue);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (op === 'gt') return a > b;
    if (op === 'gte') return a >= b;
    if (op === 'lt') return a < b;
    if (op === 'lte') return a <= b;
    return false;
  }
  const a = String(actual ?? '').toLowerCase();
  const b = String(ruleValue ?? '').toLowerCase();
  if (op === 'eq') return a === b;
  if (op === 'neq') return a !== b;
  if (op === 'contains') return b !== '' && a.includes(b);
  return false;
}

/** Loads active rules once and returns them — leads.routes.ts calls this
 *  per GET so a rule change takes effect on the very next list load. */
export async function loadScoringRules(trx: Transaction<Database>, tenantId: string): Promise<Rule[]> {
  const rows = await trx.selectFrom('crm_lead_scoring_rules')
    .select(['field', 'op', 'value', 'points'])
    .where('tenant_id', '=', tenantId).where('active', '=', true).execute();
  return rows.map(r => ({ field: r.field, op: r.op, value: r.value, points: r.points }));
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  field: z.string().refine(f => f in SCORING_FIELDS, 'Unknown field'),
  op: z.string().min(1).max(20),
  value: z.string().max(200).nullish(),
  points: z.number().int().min(-100).max(100),
});
const patchSchema = createSchema.partial().extend({ active: z.boolean().optional(), position: z.number().int().min(0).optional() });

export async function crmLeadScoringRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));
  fastify.addHook('preHandler', requireRole(...READ_ROLES));

  fastify.get('/fields', async () => SCORING_FIELDS);

  fastify.get('/rules', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      return await withTenant(tenantId, trx =>
        trx.selectFrom('crm_lead_scoring_rules').selectAll()
          .where('tenant_id', '=', tenantId).orderBy('position', 'asc').orderBy('created_at', 'asc').execute()
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/rules', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    if (!SCORING_FIELDS[b.field].ops.includes(b.op)) return reply.status(400).send({ error: `Operator "${b.op}" not valid for "${b.field}"` });
    try {
      const tenantId = request.user.tenant_id;
      const [row] = await withTenant(tenantId, async trx => {
        const max = await trx.selectFrom('crm_lead_scoring_rules').select(trx.fn.max('position').as('m'))
          .where('tenant_id', '=', tenantId).executeTakeFirst();
        return trx.insertInto('crm_lead_scoring_rules').values({
          tenant_id: tenantId, label: b.label.trim(), field: b.field, op: b.op,
          value: b.value ?? null, points: b.points, position: Number(max?.m ?? -1) + 1,
        }).returningAll().execute();
      });
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/rules/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = patchSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const patch: any = {};
      for (const k of ['label', 'field', 'op', 'value', 'points', 'active', 'position'] as const) {
        if (b[k] !== undefined) patch[k] = k === 'label' && typeof b[k] === 'string' ? (b[k] as string).trim() : b[k];
      }
      const [row] = await withTenant(tenantId, trx =>
        trx.updateTable('crm_lead_scoring_rules').set(patch)
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).returningAll().execute()
      );
      if (!row) return reply.status(404).send({ error: 'Rule not found' });
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/rules/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('crm_lead_scoring_rules').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
