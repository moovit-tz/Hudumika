import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const RULE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const conditionSchema = z.object({
  field: z.enum(['source', 'industry', 'location', 'priority', 'company']),
  op:    z.enum(['eq', 'contains', 'starts_with']),
  value: z.string().max(200),
});

const createSchema = z.object({
  name:         z.string().trim().min(1).max(200),
  active:       z.boolean().optional().default(true),
  priority:     z.number().int().min(0).max(999).optional().default(10),
  subject_type: z.enum(['lead', 'deal']).optional().default('lead'),
  match_type:   z.enum(['all', 'any']).optional().default('all'),
  conditions:   z.array(conditionSchema).min(0),
  assign_to:    z.string().uuid().nullish(),
});
const patchSchema = createSchema.partial();
const idParamSchema = z.object({ id: z.string().uuid() });

/** Called inside a transaction from leads.routes.ts POST / to apply auto-assign. */
export async function applyAssignmentRules(
  trx: any,
  tenantId: string,
  lead: { source?: string; industry?: string; location?: string; priority?: string; company?: string },
): Promise<string | null> {
  const rules = await trx.selectFrom('crm_assignment_rules')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('active', '=', true)
    .where('subject_type', '=', 'lead')
    .orderBy('priority', 'asc')
    .execute();

  for (const rule of rules) {
    const conditions = (rule.conditions ?? []) as { field: string; op: string; value: string }[];
    if (conditions.length === 0) continue; // skip catch-all rules with no conditions
    const results = conditions.map(c => {
      const fieldVal = String((lead as any)[c.field] ?? '').toLowerCase();
      const ruleVal  = c.value.toLowerCase();
      if (c.op === 'eq')          return fieldVal === ruleVal;
      if (c.op === 'contains')    return fieldVal.includes(ruleVal);
      if (c.op === 'starts_with') return fieldVal.startsWith(ruleVal);
      return false;
    });
    const matched = rule.match_type === 'all' ? results.every(Boolean) : results.some(Boolean);
    if (matched && rule.assign_to) return rule.assign_to as string;
  }
  return null;
}

export async function crmAssignmentRulesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));
  fastify.addHook('preHandler', requireRole(...RULE_ROLES));

  fastify.get('/', async (request: any) => {
    const tenantId = request.user.tenant_id;
    return withTenant(tenantId, trx =>
      trx.selectFrom('crm_assignment_rules as r')
        .leftJoin('users as u', 'u.id', 'r.assign_to')
        .select(['r.id', 'r.name', 'r.active', 'r.priority', 'r.subject_type', 'r.match_type', 'r.conditions', 'r.assign_to', 'r.created_at', 'u.name as assignee_name'])
        .where('r.tenant_id', '=', tenantId)
        .orderBy('r.priority', 'asc')
        .orderBy('r.name', 'asc')
        .execute()
    );
  });

  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const row = await withTenant(tenantId, trx =>
      trx.insertInto('crm_assignment_rules').values({
        tenant_id: tenantId, name: b.name, active: b.active, priority: b.priority,
        subject_type: b.subject_type, match_type: b.match_type,
        conditions: JSON.stringify(b.conditions), assign_to: b.assign_to || null,
      }).returningAll().executeTakeFirstOrThrow()
    );
    return reply.status(201).send(row);
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const b = patchSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.name        !== undefined) patch.name        = b.name;
    if (b.active      !== undefined) patch.active      = b.active;
    if (b.priority    !== undefined) patch.priority    = b.priority;
    if (b.match_type  !== undefined) patch.match_type  = b.match_type;
    if (b.conditions  !== undefined) patch.conditions  = JSON.stringify(b.conditions);
    if (b.assign_to   !== undefined) patch.assign_to   = b.assign_to || null;

    await withTenant(tenantId, trx =>
      trx.updateTable('crm_assignment_rules').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });

  fastify.delete('/:id', async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx =>
      trx.deleteFrom('crm_assignment_rules')
        .where('id', '=', id).where('tenant_id', '=', tenantId).execute()
    );
    return reply.status(204).send();
  });
}
