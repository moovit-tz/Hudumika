import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const ENTITY_TYPES = ['lead', 'deal', 'customer'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const ENTITY_TABLE: Record<EntityType, 'leads' | 'deals' | 'customers'> = { lead: 'leads', deal: 'deals', customer: 'customers' };
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'] as const;

// Anyone in the CRM can read defs and read/write values; only management
// defines or removes the fields themselves.
const READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR', 'JUNIOR', 'OFFICER', 'FINANCE'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';

const defCreateSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  label: z.string().trim().min(1).max(60),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().max(60)).max(50).optional(),
});
const defPatchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  options: z.array(z.string().max(60)).max(50).optional(),
  position: z.number().int().min(0).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nothing to update' });

const valuesPutSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  subject_id: z.string().uuid(),
  values: z.record(z.string().uuid(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])),
});

// A malformed (non-UUID) :id used to reach Postgres as-is and crash with a
// raw "invalid input syntax for type uuid" driver error (sanitized to an
// opaque 500 by the global handler, but still the wrong status code for a
// caller-input problem) instead of the clean 404/400 every other id lookup
// in this file already gives a well-formed-but-nonexistent id.
const idParamSchema = z.object({ id: z.string().uuid() });
class SmartFieldValueError extends Error {}

function normOptions(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(x => typeof x === 'string');
  if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

export async function crmCustomFieldsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('crm'));
  fastify.addHook('preHandler', requireRole(...READ_ROLES));

  // ── Definitions ──────────────────────────────────────────────────────
  fastify.get('/defs', async (request: any) => {
    const q = z.object({ entity_type: z.enum(ENTITY_TYPES).optional() }).parse(request.query);
    const tenantId = request.user.tenant_id;
    const rows = await withTenant(tenantId, async trx => {
      let sel = trx.selectFrom('crm_custom_field_defs').selectAll().where('tenant_id', '=', tenantId);
      if (q.entity_type) sel = sel.where('entity_type', '=', q.entity_type);
      return sel.orderBy('entity_type', 'asc').orderBy('position', 'asc').orderBy('created_at', 'asc').execute();
    });
    return rows.map(r => ({ ...r, options: normOptions(r.options) }));
  });

  fastify.post('/defs', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const b = defCreateSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    try {
      const key = slug(b.label);
      const [row] = await withTenant(tenantId, async trx => {
        const max = await trx.selectFrom('crm_custom_field_defs').select(trx.fn.max('position').as('m'))
          .where('tenant_id', '=', tenantId).where('entity_type', '=', b.entity_type).executeTakeFirst();
        return trx.insertInto('crm_custom_field_defs').values({
          tenant_id: tenantId, entity_type: b.entity_type, field_key: key, label: b.label.trim(),
          type: b.type, options: JSON.stringify(b.type === 'select' ? (b.options ?? []) : []) as any,
          position: Number(max?.m ?? -1) + 1,
        }).returningAll().execute();
      });
      return { ...row, options: normOptions(row.options) };
    } catch (err: any) {
      if (err.message?.includes('duplicate key')) return reply.status(400).send({ error: `A "${b.label}" field already exists for ${b.entity_type}s` });
      throw err;
    }
  });

  fastify.patch('/defs/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const b = defPatchSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    const patch: any = {};
    if (b.label !== undefined) patch.label = b.label.trim();
    if (b.options !== undefined) patch.options = JSON.stringify(b.options) as any;
    if (b.position !== undefined) patch.position = b.position;
    const [row] = await withTenant(tenantId, trx =>
      trx.updateTable('crm_custom_field_defs').set(patch)
        .where('id', '=', id).where('tenant_id', '=', tenantId).returningAll().execute()
    );
    if (!row) return reply.status(404).send({ error: 'Field not found' });
    return { ...row, options: normOptions(row.options) };
  });

  fastify.delete('/defs/:id', { preHandler: requireRole(...ADMIN_ROLES) }, async (request: any, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await withTenant(request.user.tenant_id, trx =>
      trx.deleteFrom('crm_custom_field_defs').where('id', '=', id)
        .where('tenant_id', '=', request.user.tenant_id).execute()
    );
    reply.status(204);
    return null;
  });

  // ── Values for one record ────────────────────────────────────────────
  fastify.get('/values', async (request: any) => {
    const q = z.object({ entity_type: z.enum(ENTITY_TYPES), subject_id: z.string().uuid() }).parse(request.query);
    const tenantId = request.user.tenant_id;
    const rows = await withTenant(tenantId, trx =>
      trx.selectFrom('crm_custom_field_values')
        .innerJoin('crm_custom_field_defs', 'crm_custom_field_defs.id', 'crm_custom_field_values.def_id')
        .select(['crm_custom_field_values.def_id', 'crm_custom_field_values.value'])
        .where('crm_custom_field_defs.tenant_id', '=', tenantId)
        .where('crm_custom_field_defs.entity_type', '=', q.entity_type)
        .where('crm_custom_field_values.subject_id', '=', q.subject_id)
        .execute()
    );
    return Object.fromEntries(rows.map(r => [r.def_id, r.value]));
  });

  fastify.put('/values', async (request: any, reply) => {
    const b = valuesPutSchema.parse(request.body);
    const tenantId = request.user.tenant_id;
    try {
      const ok = await withTenant(tenantId, async trx => {
      const subject = await trx.selectFrom(ENTITY_TABLE[b.entity_type]).select('id')
        .where('id', '=', b.subject_id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!subject) return false;
      const defs = await trx.selectFrom('crm_custom_field_defs').select(['id', 'type', 'options'])
        .where('tenant_id', '=', tenantId).where('entity_type', '=', b.entity_type).execute();
      const defsById = new Map(defs.map(d => [d.id, d]));

      for (const [defId, raw] of Object.entries(b.values)) {
        const def = defsById.get(defId);
        if (!def) throw new SmartFieldValueError(`Custom field ${defId} does not belong to this ${b.entity_type}`);
        if (raw === null || raw === '') {
          await trx.deleteFrom('crm_custom_field_values').where('def_id', '=', defId).where('subject_id', '=', b.subject_id).execute();
        } else {
          const stringValue = String(raw);
          if (def.type === 'number' && (typeof raw === 'boolean' || !Number.isFinite(Number(raw)))) {
            throw new SmartFieldValueError('Number fields require a valid number');
          }
          if (def.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue) || Number.isNaN(Date.parse(`${stringValue}T00:00:00Z`)))) {
            throw new SmartFieldValueError('Date fields require a valid YYYY-MM-DD date');
          }
          if (def.type === 'checkbox' && !['true', 'false'].includes(stringValue)) {
            throw new SmartFieldValueError('Checkbox fields require true or false');
          }
          if (def.type === 'select' && !normOptions(def.options).includes(stringValue)) {
            throw new SmartFieldValueError(`"${stringValue}" is not an allowed dropdown option`);
          }
          const value = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw);
          await trx.insertInto('crm_custom_field_values')
            .values({ def_id: defId, subject_id: b.subject_id, value, updated_at: new Date() })
            .onConflict(oc => oc.columns(['def_id', 'subject_id']).doUpdateSet({ value, updated_at: new Date() }))
            .execute();
        }
      }
      return true;
      });
      if (!ok) return reply.status(404).send({ error: 'Record not found' });
      return { success: true };
    } catch (error) {
      if (error instanceof SmartFieldValueError) return reply.status(400).send({ error: error.message });
      throw error;
    }
  });
}
