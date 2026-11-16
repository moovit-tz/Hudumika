import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import * as Eq from '../services/project-equipment.service.js';
import { resolveProjectAccess, canEditProject } from './task-projects.routes.js';

/** Projects equipment register (see project-equipment.service.ts for the access rules). */

const uuid = z.string().uuid();
const date = z.string().date();
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v));
const optNum = z.number().min(0).nullable().optional();
const condition = z.enum(Eq.CONDITIONS);

const assetFields = {
  resource_type: z.enum(Eq.ASSET_TYPES),
  name: z.string().trim().min(1).max(200),
  code: optText(50),
  category: optText(100), manufacturer: optText(120), make_model: optText(1000), serial_number: optText(100),
  registration_number: optText(50), year_built: z.number().int().min(1900).max(2100).nullable().optional(),
  ownership: z.enum(['OWNED', 'RENTED', 'LEASED']).optional(), owner_vendor_id: uuid.nullable().optional(),
  rental_reference: optText(100), rental_start: date.nullable().optional(), rental_end: date.nullable().optional(),
  home_site: optText(200), current_location: optText(200), custodian_id: uuid.nullable().optional(), condition: condition.optional(),
  capacity_value: optNum, capacity_unit: optText(30), capacity_rating: optText(1000),
  meter_unit: z.enum(['HOURS', 'KM', 'MILES', 'CYCLES']).nullable().optional(), meter_reading: optNum,
  inspection_interval_days: z.number().int().min(1).max(3650).nullable().optional(), next_inspection_due: date.nullable().optional(),
  service_interval_days: z.number().int().min(1).max(3650).nullable().optional(), service_interval_meter: optNum,
  next_service_due: date.nullable().optional(), next_service_meter: optNum,
  fixed_asset_id: uuid.nullable().optional(), vehicle_id: uuid.nullable().optional(), notes: optText(4000),
  cost_rate: z.number().min(0).optional(), billing_rate: z.number().min(0).optional(),
  rate_unit: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH']).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  status: z.enum(['available', 'maintenance']).optional(),
};
const rentalRule = (d: { ownership?: string; owner_vendor_id?: string | null; rental_start?: string | null; rental_end?: string | null }) =>
  !(d.rental_start && d.rental_end && d.rental_end < d.rental_start);
const createSchema = z.object(assetFields).refine(rentalRule, { message: 'Rental end must be on or after its start', path: ['rental_end'] });
const updateSchema = z.object(assetFields).partial().refine(rentalRule, { message: 'Rental end must be on or after its start', path: ['rental_end'] });

const listQuery = z.object({
  q: z.string().max(200).optional(), type: z.enum(Eq.ASSET_TYPES).optional(),
  status: z.enum(['available', 'allocated', 'maintenance', 'decommissioned']).optional(),
  ownership: z.enum(['OWNED', 'RENTED', 'LEASED']).optional(), availability: z.enum(['available', 'unavailable', 'issued']).optional(),
  site: z.string().max(200).optional(), custodian: uuid.optional(), due: z.coerce.boolean().optional(),
  sort: z.enum(['name', 'code', 'type', 'status', 'location', 'next_inspection_due', 'next_service_due', 'updated_at']).optional(),
  dir: z.enum(['asc', 'desc']).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const CSV_COLUMNS = ['code', 'name', 'resource_type', 'category', 'manufacturer', 'make_model', 'serial_number', 'registration_number', 'year_built',
  'ownership', 'rental_reference', 'rental_start', 'rental_end', 'home_site', 'current_location', 'condition', 'status',
  'capacity_value', 'capacity_unit', 'meter_unit', 'meter_reading', 'inspection_interval_days', 'next_inspection_due',
  'service_interval_days', 'service_interval_meter', 'next_service_due', 'next_service_meter', 'notes'] as const;
const COST_COLUMNS = ['cost_rate', 'billing_rate', 'rate_unit', 'currency'] as const;
const NUMERIC = new Set(['year_built', 'capacity_value', 'meter_reading', 'inspection_interval_days', 'service_interval_days', 'service_interval_meter', 'next_service_meter', 'cost_rate', 'billing_rate']);
const UPPER = new Set(['ownership', 'condition', 'meter_unit', 'rate_unit', 'currency']);

const csvCell = (v: unknown) => {
  if (v == null) return '';
  let s = String(v);
  // Spreadsheet formula injection: a cell starting with these is evaluated.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function projectEquipmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('projects'));
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user.role === 'CUSTOMER') return reply.code(403).send({ error: 'Not available for this account type.' });
  });
  const run = <T>(request: any, fn: (trx: any, actor: Eq.EquipmentActor) => Promise<T>) =>
    withTenant(request.user.tenant_id, trx => fn(trx, Eq.actorFrom(request.user)));

  fastify.get('/powers', async request => run(request, Eq.equipmentPowers));

  /** What the caller may do on one project, so the UI only offers permitted actions. */
  fastify.get('/projects/:projectId/access', async (request, reply) => {
    const { projectId } = z.object({ projectId: uuid }).parse(request.params);
    return run(request, async (trx, actor) => {
      const access = await resolveProjectAccess(trx, actor.tenantId, actor.userId, actor.role, projectId);
      if (!access) return reply.code(404).send({ error: 'Project not found' });
      return { access: access.access, can_request: canEditProject(access.access), can_manage: ['owner', 'admin'].includes(access.access), ...(await Eq.equipmentPowers(trx, actor)) };
    });
  });

  fastify.get('/assets', async request => {
    const f = listQuery.parse(request.query);
    return run(request, (trx, actor) => Eq.listAssets(trx, actor, f));
  });

  fastify.get('/assets/export', async (request, reply) => {
    const f = listQuery.parse(request.query);
    const { rows, cost } = await run(request, async (trx, actor) => {
      const powers = await Eq.equipmentPowers(trx, actor);
      const all: any[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await Eq.listAssets(trx, actor, { ...f, page, pageSize: 200 });
        all.push(...res.data);
        if (all.length >= res.total) break;
      }
      return { rows: all, cost: powers.seeCost };
    });
    const cols = [...CSV_COLUMNS, ...(cost ? COST_COLUMNS : []), 'custodian_name', 'availability'];
    const body = [cols.join(','), ...rows.map(r => cols.map(c => csvCell(c === 'availability' ? (r.eligibility?.ok ? 'available' : r.eligibility?.reasons.join('; ')) : r[c])).join(','))].join('\r\n');
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="equipment-register-${new Date().toISOString().slice(0, 10)}.csv"`).send(`﻿${body}`);
  });

  fastify.post('/assets/import', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const body = z.object({
      rows: z.array(z.record(z.string(), z.any())).min(1).max(1000),
      on_duplicate: z.enum(['skip', 'update']).default('skip'),
      dry_run: z.boolean().default(true),
    }).parse(request.body);
    return run(request, async (trx, actor) => {
      const powers = await Eq.equipmentPowers(trx, actor);
      if (!powers.manage) throw Object.assign(new Error('Only equipment managers can import into the register.'), { statusCode: 403 });
      const allowed = new Set<string>([...CSV_COLUMNS, ...COST_COLUMNS]);
      const existing = new Map((await trx.selectFrom('project_resources').select(['id', 'code']).where('tenant_id', '=', actor.tenantId).execute()).map((r: any) => [r.code, r.id]));
      const seen = new Set<string>();
      const results: Array<{ row: number; code: string | null; status: 'create' | 'update' | 'skip' | 'error'; errors: string[] }> = [];
      for (const [i, raw] of body.rows.entries()) {
        const rec: Record<string, any> = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = k.trim().toLowerCase().replace(/\s+/g, '_');
          if (!allowed.has(key) || v == null || String(v).trim() === '') continue;
          let val: any = String(v).trim();
          if (NUMERIC.has(key)) val = Number(val.replace(/,/g, ''));
          if (UPPER.has(key)) val = val.toUpperCase();
          if (key === 'resource_type') val = val.toLowerCase().replace(/\s+/g, '_');
          rec[key] = val;
        }
        delete rec.status;
        const code = rec.code ?? null;
        const parsed = createSchema.safeParse(rec);
        if (!parsed.success) { results.push({ row: i + 2, code, status: 'error', errors: parsed.error.issues.map(e => `${e.path.join('.') || 'row'}: ${e.message}`) }); continue; }
        if (!code) { results.push({ row: i + 2, code, status: 'error', errors: ['code: required for import so a re-import can match the row'] }); continue; }
        if (seen.has(code)) { results.push({ row: i + 2, code, status: 'error', errors: [`code: ${code} appears more than once in this file`] }); continue; }
        seen.add(code);
        const dup = existing.get(code);
        const status = dup ? (body.on_duplicate === 'update' ? 'update' : 'skip') : 'create';
        if (!body.dry_run && status !== 'skip') {
          try {
            if (status === 'create') await Eq.createAsset(trx, actor, { ...parsed.data, code } as any, 'IMPORTED');
            else { const { code: _c, ...rest } = parsed.data; await Eq.updateAsset(trx, actor, dup as string, rest as any, 'IMPORTED'); }
          } catch (e: any) {
            // Any failure aborts the whole import (one transaction), so nothing half-applies.
            throw Object.assign(new Error(`Row ${i + 2} (${code}): ${e.message}`), { statusCode: e.statusCode ?? 400 });
          }
        }
        results.push({ row: i + 2, code, status, errors: [] });
      }
      const count = (s: string) => results.filter(r => r.status === s).length;
      if (!body.dry_run && count('error')) throw Object.assign(new Error(`${count('error')} rows have errors. Fix them or remove them, then import again.`), { statusCode: 400 });
      return { dry_run: body.dry_run, results, summary: { create: count('create'), update: count('update'), skip: count('skip'), error: count('error') } };
    });
  });

  fastify.post('/assets', async (request, reply) => {
    const d = createSchema.parse(request.body);
    const asset = await run(request, (trx, actor) => Eq.createAsset(trx, actor, d as any));
    return reply.code(201).send(asset);
  });

  fastify.get('/assets/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return run(request, (trx, actor) => Eq.getAsset(trx, actor, id));
  });

  fastify.patch('/assets/:id', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = updateSchema.parse(request.body);
    return run(request, (trx, actor) => Eq.updateAsset(trx, actor, id, d as any));
  });

  fastify.post('/assets/:id/dispose', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { reason } = z.object({ reason: z.string().trim().min(5).max(2000) }).parse(request.body);
    return run(request, (trx, actor) => Eq.disposeAsset(trx, actor, id, reason));
  });

  fastify.get('/assets/:id/availability', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const q = z.object({ start: date, end: date, pct: z.coerce.number().int().min(1).max(100).optional(), project_id: uuid.optional() }).parse(request.query);
    return run(request, (trx, actor) => Eq.availability(trx, actor, id, q.start, q.end, q.pct, q.project_id));
  });

  fastify.post('/assets/:id/readings', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { reading } = z.object({ reading: z.number().min(0) }).parse(request.body);
    return reply.code(201).send(await run(request, (trx, actor) => Eq.addReading(trx, actor, id, reading)));
  });

  fastify.post('/assets/:id/inspections', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ inspection_type: z.enum(['PRE_USE', 'PERIODIC', 'RETURN', 'STATUTORY']), result: z.enum(['PASS', 'PASS_WITH_DEFECTS', 'FAIL']),
      defects: optText(4000), next_due: date.nullable().optional() }).parse(request.body);
    return reply.code(201).send(await run(request, (trx, actor) => Eq.addInspection(trx, actor, id, d)));
  });

  fastify.post('/assets/:id/certificates', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ certificate_type: z.string().trim().min(2).max(80), reference: optText(120), issuer: optText(200),
      issued_on: date.nullable().optional(), expires_on: date.nullable().optional(), blocks_assignment: z.boolean().optional(), file_id: uuid.nullable().optional() }).parse(request.body);
    return reply.code(201).send(await run(request, (trx, actor) => Eq.addCertificate(trx, actor, id, d)));
  });

  fastify.post('/assets/:id/maintenance', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ kind: z.enum(['SERVICE', 'REPAIR', 'BREAKDOWN']), description: z.string().trim().min(3).max(2000),
      scheduled_for: date.nullable().optional(), vendor_id: uuid.nullable().optional(), start_now: z.boolean().optional() }).parse(request.body);
    return reply.code(201).send(await run(request, (trx, actor) => Eq.scheduleMaintenance(trx, actor, id, d)));
  });

  fastify.post('/maintenance/:id/start', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return run(request, (trx, actor) => Eq.startMaintenance(trx, actor, id));
  });

  fastify.post('/maintenance/:id/complete', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ downtime_hours: optNum, cost: optNum, meter_at_service: optNum, condition: condition.optional(), cancel: z.boolean().optional() }).parse(request.body ?? {});
    return run(request, (trx, actor) => Eq.completeMaintenance(trx, actor, id, d));
  });

  fastify.get('/allocations', async request => {
    const q = z.object({ view: z.enum(['requests', 'reserved', 'issued', 'overdue', 'history', 'all']).optional(), project_id: uuid.optional(),
      resource_id: uuid.optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional() }).parse(request.query);
    return run(request, (trx, actor) => Eq.listAllocations(trx, actor, { ...q, projectId: q.project_id, resourceId: q.resource_id }));
  });

  fastify.post('/projects/:projectId/requests', async (request, reply) => {
    const { projectId } = z.object({ projectId: uuid }).parse(request.params);
    const d = z.object({ resource_id: uuid, start_date: date, end_date: date, allocated_pct: z.number().int().min(1).max(100).optional(),
      hours_planned: z.number().min(0).optional(), work_package_id: uuid.nullable().optional(), operator_id: uuid.nullable().optional(),
      notes: optText(2000), request_key: z.string().trim().min(8).max(80).nullable().optional() }).parse(request.body);
    const row = await run(request, (trx, actor) => Eq.requestAllocation(trx, actor, projectId, d));
    return reply.code((row as any).replayed ? 200 : 201).send(row);
  });

  fastify.post('/allocations/:id/reserve', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return run(request, (trx, actor) => Eq.reserveAllocation(trx, actor, id));
  });
  fastify.post('/allocations/:id/issue', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ condition, meter: optNum, handed_to: uuid.nullable().optional(), location: optText(200) }).parse(request.body);
    return run(request, (trx, actor) => Eq.issueAllocation(trx, actor, id, d));
  });
  fastify.post('/allocations/:id/return', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ condition, meter: optNum, location: optText(200),
      inspection: z.object({ result: z.enum(['PASS', 'PASS_WITH_DEFECTS', 'FAIL']), defects: optText(4000), next_due: date.nullable().optional() }).nullable().optional() }).parse(request.body);
    return run(request, (trx, actor) => Eq.returnAllocation(trx, actor, id, d));
  });
  fastify.post('/allocations/:id/cancel', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { reason } = z.object({ reason: optText(2000) }).parse(request.body ?? {});
    return run(request, (trx, actor) => Eq.cancelAllocation(trx, actor, id, reason ?? null));
  });
  fastify.post('/allocations/:id/reassign', async request => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const d = z.object({ project_id: uuid, end_date: date, location: optText(200), meter: optNum }).parse(request.body);
    return run(request, (trx, actor) => Eq.reassignAllocation(trx, actor, id, d));
  });

  fastify.get('/due', async request => run(request, Eq.dueSummary));

  fastify.get('/reports/utilisation', async request => {
    const q = z.object({ from: date, to: date }).parse(request.query);
    return run(request, (trx, actor) => Eq.utilisation(trx, actor, q.from, q.to));
  });
}
