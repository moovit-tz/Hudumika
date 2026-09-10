import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const ENTITY_TYPES = ['lead', 'deal', 'customer'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const ENTITY_TABLE: Record<EntityType, 'leads' | 'deals' | 'customers'> = { lead: 'leads', deal: 'deals', customer: 'customers' };

const VIEW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'] as const;

type FieldSpec = { kind: 'text' | 'uuid' | 'bool' | 'date' | 'num' | 'label'; col?: string; ops: string[] };

// One catalog per entity type — the columns that actually exist and are
// worth filtering on. Mirrors Contacts' SMART_FIELDS shape (contacts.service.ts).
const CATALOGS: Record<EntityType, Record<string, FieldSpec>> = {
  lead: {
    stage:          { kind: 'text', col: 'stage',          ops: ['eq', 'neq'] },
    source:         { kind: 'text', col: 'source',         ops: ['eq', 'neq', 'contains'] },
    priority:       { kind: 'text', col: 'priority',       ops: ['eq', 'neq'] },
    industry:       { kind: 'text', col: 'industry',       ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    location:       { kind: 'text', col: 'location',       ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    value:          { kind: 'num',  col: 'value',          ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
    assigned_to_id: { kind: 'uuid', col: 'assigned_to_id', ops: ['eq', 'neq', 'is_set', 'is_empty'] },
    label:          { kind: 'label',                       ops: ['has', 'not_has'] },
    created:        { kind: 'date', col: 'created_at',     ops: ['within_days', 'before_days'] },
    expected_close: { kind: 'date', col: 'expected_close', ops: ['within_days', 'before_days', 'is_empty'] },
  },
  deal: {
    stage:          { kind: 'text', col: 'stage',            ops: ['eq', 'neq'] },
    source:         { kind: 'text', col: 'source',           ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    currency:       { kind: 'text', col: 'currency',         ops: ['eq', 'neq'] },
    value:          { kind: 'num',  col: 'value',            ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
    probability:    { kind: 'num',  col: 'probability',      ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
    owner_id:       { kind: 'uuid', col: 'owner_id',         ops: ['eq', 'neq', 'is_set', 'is_empty'] },
    label:          { kind: 'label',                         ops: ['has', 'not_has'] },
    created:        { kind: 'date', col: 'created_at',       ops: ['within_days', 'before_days'] },
    stagnant:       { kind: 'date', col: 'stage_changed_at', ops: ['before_days'] },
    expected_close: { kind: 'date', col: 'expected_close',   ops: ['within_days', 'before_days', 'is_empty'] },
  },
  customer: {
    company_type:   { kind: 'text', col: 'entity_type',        ops: ['eq', 'neq', 'is_set', 'is_empty'] },
    category:       { kind: 'text', col: 'category',           ops: ['eq', 'neq', 'is_set', 'is_empty'] },
    city:           { kind: 'text', col: 'city',               ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    country:        { kind: 'text', col: 'country',            ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    source:         { kind: 'text', col: 'source',             ops: ['eq', 'neq', 'contains', 'is_set', 'is_empty'] },
    is_partner:     { kind: 'bool', col: 'is_partner',         ops: ['is_true', 'is_false'] },
    assigned_to_id: { kind: 'uuid', col: 'assigned_officer_id', ops: ['eq', 'neq', 'is_set', 'is_empty'] },
    label:          { kind: 'label',                           ops: ['has', 'not_has'] },
    created:        { kind: 'date', col: 'created_at',         ops: ['within_days', 'before_days'] },
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Compiles one rule to a boolean SQL fragment (strict → throw, lenient → null).
// `table` is the entity's own table alias so `label` rules can scope the
// EXISTS subquery correctly.
function compileRule(entity: EntityType, rule: any, strict: boolean): any {
  const bail = (msg: string) => { if (strict) throw new Error(msg); return null; };
  if (!rule || typeof rule !== 'object') return bail('Malformed rule');
  const spec = CATALOGS[entity][rule.field];
  if (!spec) return bail(`Unknown filter field "${rule.field}"`);
  if (!spec.ops.includes(rule.op)) return bail(`Operator "${rule.op}" is not valid for "${rule.field}"`);

  const table = ENTITY_TABLE[entity];
  const col = spec.col ? sql.ref(`${table}.${spec.col}`) : null;
  const op = rule.op;

  if (spec.kind === 'text' && col) {
    if (op === 'is_set')   return sql<boolean>`(${col} IS NOT NULL AND ${col} <> '')`;
    if (op === 'is_empty') return sql<boolean>`(${col} IS NULL OR ${col} = '')`;
    const v = typeof rule.value === 'string' ? rule.value.trim() : '';
    if (!v) return bail(`"${rule.field}" needs a value`);
    if (v.length > 200) return bail('Filter value is too long');
    if (op === 'eq')  return sql<boolean>`${col} = ${v}`;
    if (op === 'neq') return sql<boolean>`(${col} IS NULL OR ${col} <> ${v})`;
    const like = `%${v.replace(/[\\%_]/g, (m: string) => '\\' + m)}%`;
    if (op === 'contains') return sql<boolean>`${col} ILIKE ${like}`;
    return bail(`Unhandled operator "${op}"`);
  }

  if (spec.kind === 'num' && col) {
    const n = Number(rule.value);
    if (!Number.isFinite(n)) return bail(`"${rule.field}" needs a number`);
    if (op === 'gt')  return sql<boolean>`${col} > ${n}`;
    if (op === 'gte') return sql<boolean>`${col} >= ${n}`;
    if (op === 'lt')  return sql<boolean>`${col} < ${n}`;
    if (op === 'lte') return sql<boolean>`${col} <= ${n}`;
    if (op === 'eq')  return sql<boolean>`${col} = ${n}`;
    return bail(`Unhandled operator "${op}"`);
  }

  if (spec.kind === 'uuid' && col) {
    if (op === 'is_set')   return sql<boolean>`${col} IS NOT NULL`;
    if (op === 'is_empty') return sql<boolean>`${col} IS NULL`;
    const v = typeof rule.value === 'string' ? rule.value.trim() : '';
    if (!UUID_RE.test(v)) return bail(`"${rule.field}" needs a valid selection`);
    if (op === 'eq')  return sql<boolean>`${col} = ${v}::uuid`;
    if (op === 'neq') return sql<boolean>`(${col} IS NULL OR ${col} <> ${v}::uuid)`;
    return bail(`Unhandled operator "${op}"`);
  }

  if (spec.kind === 'bool' && col) {
    return op === 'is_true' ? sql<boolean>`${col} IS TRUE` : sql<boolean>`(${col} IS NOT TRUE)`;
  }

  if (spec.kind === 'date' && col) {
    if (op === 'is_empty') return sql<boolean>`${col} IS NULL`;
    const n = Number(rule.value);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return bail(`"${rule.field}" needs a whole number of days (0–3650)`);
    if (op === 'within_days') return sql<boolean>`${col} >= now() - (${n} || ' days')::interval`;
    if (op === 'before_days') return sql<boolean>`${col} < now() - (${n} || ' days')::interval`;
    return bail(`Unhandled operator "${op}"`);
  }

  if (spec.kind === 'label') {
    const v = typeof rule.value === 'string' ? rule.value.trim() : '';
    if (!UUID_RE.test(v)) return bail('Pick a label for this rule');
    const exists = sql<boolean>`EXISTS (SELECT 1 FROM crm_label_mappings m WHERE m.subject_type = ${entity} AND m.subject_id = ${sql.ref(`${table}.id`)} AND m.label_id = ${v}::uuid)`;
    return op === 'has' ? exists : sql<boolean>`NOT ${exists}`;
  }

  return bail('Rule could not be compiled');
}

function buildPredicate(entity: EntityType, rules: any[], matchType: 'all' | 'any', strict: boolean): any {
  const parts = (Array.isArray(rules) ? rules : []).map(r => compileRule(entity, r, strict)).filter((p): p is any => p != null);
  if (parts.length === 0) return sql<boolean>`false`;
  const joiner = matchType === 'any' ? sql`\nOR ` : sql`\nAND `;
  return sql<boolean>`(${sql.join(parts, joiner)})`;
}

function normalizeRules(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

const ruleSchema = z.object({ field: z.string().min(1).max(40), op: z.string().min(1).max(20), value: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]).optional() });
const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  name: z.string().trim().min(1).max(120),
  match_type: z.enum(['all', 'any']).optional(),
  rules: z.array(ruleSchema).max(25).optional(),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  match_type: z.enum(['all', 'any']).optional(),
  rules: z.array(ruleSchema).max(25).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nothing to update' });

export async function crmSmartViewsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(...VIEW_ROLES));

  // The field catalog itself — the frontend rule builder's dropdowns.
  fastify.get('/catalog', async () => CATALOGS);

  fastify.get('/', async (request: any, reply) => {
    const q = z.object({ entity_type: z.enum(ENTITY_TYPES).optional() }).parse(request.query);
    try {
      const tenantId = request.user.tenant_id;
      const views = await withTenant(tenantId, async trx => {
        let sel = trx.selectFrom('crm_smart_views').selectAll().where('tenant_id', '=', tenantId);
        if (q.entity_type) sel = sel.where('entity_type', '=', q.entity_type);
        const rows = await sel.orderBy('name', 'asc').execute();
        const out = [];
        for (const v of rows) {
          const rules = normalizeRules(v.rules);
          let count = 0;
          try {
            const r = await trx.selectFrom(ENTITY_TABLE[v.entity_type as EntityType])
              .select(sql<string>`count(*)`.as('c'))
              .where('tenant_id', '=', tenantId)
              .where(buildPredicate(v.entity_type as EntityType, rules, v.match_type as any, false))
              .executeTakeFirst();
            count = Number(r?.c ?? 0);
          } catch { count = 0; }
          out.push({ id: v.id, entity_type: v.entity_type, name: v.name, match_type: v.match_type, rules, count });
        }
        return out;
      });
      return views;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/:id/results', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const rows = await withTenant(tenantId, async trx => {
        const view = await trx.selectFrom('crm_smart_views').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!view) return null;
        const entity = view.entity_type as EntityType;
        const rules = normalizeRules(view.rules);
        return trx.selectFrom(ENTITY_TABLE[entity]).selectAll()
          .where('tenant_id', '=', tenantId)
          .where(buildPredicate(entity, rules, view.match_type as any, false))
          .orderBy('created_at', 'desc')
          .limit(500)
          .execute();
      });
      if (rows === null) return reply.status(404).send({ error: 'Smart view not found' });
      return rows;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/', async (request: any, reply) => {
    const b = createSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const matchType = b.match_type === 'any' ? 'any' : 'all';
      const rules = normalizeRules(b.rules);
      buildPredicate(b.entity_type, rules, matchType, true); // validate

      const [row] = await withTenant(tenantId, trx =>
        trx.insertInto('crm_smart_views').values({
          tenant_id: tenantId, entity_type: b.entity_type, name: b.name.trim(),
          match_type: matchType, rules: JSON.stringify(rules) as any, created_by: request.user.sub,
        }).returningAll().execute()
      );
      return { ...row, rules, count: 0 };
    } catch (err: any) {
      if (err.message?.includes('duplicate key')) return reply.status(400).send({ error: `A ${b.entity_type} view named "${b.name}" already exists` });
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/:id', async (request: any, reply) => {
    const b = patchSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const row = await withTenant(tenantId, async trx => {
        const existing = await trx.selectFrom('crm_smart_views').selectAll()
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).executeTakeFirst();
        if (!existing) return null;
        const entity = existing.entity_type as EntityType;
        const patch: any = {};
        if (b.name !== undefined) patch.name = b.name.trim();
        const matchType = (b.match_type ?? existing.match_type) === 'any' ? 'any' : 'all';
        if (b.match_type !== undefined) patch.match_type = matchType;
        const rules = b.rules !== undefined ? normalizeRules(b.rules) : normalizeRules(existing.rules);
        if (b.rules !== undefined) patch.rules = JSON.stringify(rules) as any;
        if (b.rules !== undefined || b.match_type !== undefined) buildPredicate(entity, rules, matchType, true);
        const [r] = await trx.updateTable('crm_smart_views').set(patch)
          .where('id', '=', request.params.id).where('tenant_id', '=', tenantId).returningAll().execute();
        return { ...r, rules: normalizeRules(r.rules) };
      });
      if (!row) return reply.status(404).send({ error: 'Smart view not found' });
      return row;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/:id', async (request: any, reply) => {
    try {
      await withTenant(request.user.tenant_id, trx =>
        trx.deleteFrom('crm_smart_views').where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).execute()
      );
      reply.status(204);
      return null;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
