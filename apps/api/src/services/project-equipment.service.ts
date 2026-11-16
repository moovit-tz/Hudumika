import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { JWTPayload } from '@hudumika/types';
import { hasOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';
import { resolveProjectAccess, canEditProject } from '../routes/task-projects.routes.js';
import { NotificationService } from './notification.service.js';

/**
 * Projects equipment register (migration 913). project_resources is the one
 * identity per asset; FinOps fixed_assets (book value, depreciation) and
 * Tracking vehicles (telematics) are referenced, never copied.
 *
 * Who may do what:
 *  - view the register: any staff user with the Projects app;
 *  - see cost and hire rates: admins, FINANCE, equipment managers;
 *  - register, edit, import, dispose, add certificates: admins and holders of
 *    projects.equipment.manage ("equipment managers");
 *  - reserve, issue, receive, inspect, read meters, run maintenance: equipment
 *    managers, plus the asset's own custodian for that asset only;
 *  - request equipment for a project: anyone who can edit that project;
 *  - cancel a request: the requester, the project's owner/admin, or the above.
 * Allocation writes lock the asset row, so concurrent bookings of one asset
 * are serialised and the capacity check sees every committed booking.
 */

type Trx = Transaction<Database>;
const ADMIN_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'];
const COST_ROLES = [...ADMIN_ROLES, 'FINANCE'];
const LIVE = ['REQUESTED', 'CONFIRMED', 'ISSUED'] as const;
export const ASSET_TYPES = ['heavy_machinery', 'equipment', 'tool', 'vehicle', 'facility', 'personnel'] as const;
export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;

export interface EquipmentActor { tenantId: string; userId: string; role: string; impersonatedBy: string | null }
export interface Powers { manage: boolean; seeCost: boolean }

const fail = (message: string, statusCode: number, extra?: Record<string, unknown>): never => {
  throw Object.assign(new Error(message), { statusCode, ...extra });
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const num = (v: unknown) => (v == null ? null : Number(v));

export function actorFrom(user: JWTPayload): EquipmentActor {
  return { tenantId: user.tenant_id, userId: user.sub, role: user.role, impersonatedBy: user.impersonated_by ?? null };
}

export async function equipmentPowers(trx: Trx, actor: EquipmentActor): Promise<Powers> {
  const manage = ADMIN_ROLES.includes(actor.role)
    || await hasOrgPermission(actor.tenantId, actor.userId, ORG_PERMISSIONS.PROJECT_EQUIPMENT_MANAGE, trx);
  return { manage, seeCost: manage || COST_ROLES.includes(actor.role) };
}

async function requireManage(trx: Trx, actor: EquipmentActor) {
  const powers = await equipmentPowers(trx, actor);
  if (!powers.manage) fail('Only equipment managers can change the register.', 403);
  return powers;
}

/** Managers handle every asset; a custodian handles the assets in their care. */
async function requireHandler(trx: Trx, actor: EquipmentActor, asset: { custodian_id: string | null }) {
  const powers = await equipmentPowers(trx, actor);
  if (!powers.manage && asset.custodian_id !== actor.userId) fail('Only an equipment manager or this asset\'s custodian can do that.', 403);
  return powers;
}

async function logEvent(trx: Trx, actor: EquipmentActor, e: {
  resourceId: string; type: string; allocationId?: string | null; projectId?: string | null;
  from?: string | null; to?: string | null; details?: Record<string, unknown>;
}) {
  await trx.insertInto('project_equipment_events').values({
    tenant_id: actor.tenantId, resource_id: e.resourceId, allocation_id: e.allocationId ?? null, project_id: e.projectId ?? null,
    event_type: e.type, from_location: e.from ?? null, to_location: e.to ?? null, details: (e.details ?? {}) as any,
    actor_id: actor.userId, impersonated_by: actor.impersonatedBy,
  }).execute();
}

async function lockAsset(trx: Trx, tenantId: string, id: string) {
  const asset = await trx.selectFrom('project_resources').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
  if (!asset) fail('Asset not found', 404);
  return asset!;
}

async function sameTenant(trx: Trx, tenantId: string, table: 'users' | 'suppliers' | 'fixed_assets' | 'vehicles' | 'cloud_files' | 'projects', id: string | null | undefined, label: string) {
  if (!id) return;
  const row = await (trx as any).selectFrom(table).select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!row) fail(`${label} not found`, 404);
}

// ── Serialisation ────────────────────────────────────────────────────────────

export function assetOut(row: any, powers: Powers) {
  const out: Record<string, any> = {
    id: row.id, code: row.code, name: row.name, resource_type: String(row.resource_type).toLowerCase(),
    category: row.category, manufacturer: row.manufacturer, make_model: row.model_or_specs, serial_number: row.serial_number,
    registration_number: row.registration_number, year_built: row.year_built,
    ownership: row.ownership, owner_vendor_id: row.owner_vendor_id, vendor_name: row.vendor_name ?? null,
    rental_reference: row.rental_reference, rental_start: row.rental_start, rental_end: row.rental_end,
    home_site: row.home_site, current_location: row.current_location,
    custodian_id: row.custodian_id, custodian_name: row.custodian_name ?? null, custodian_avatar_url: row.custodian_avatar_url ?? null,
    condition: row.condition, status: String(row.status).toLowerCase(),
    capacity_value: num(row.capacity_value), capacity_unit: row.capacity_unit,
    capacity_rating: row.metadata?.capacity_rating ?? null,
    meter_unit: row.meter_unit, meter_reading: num(row.meter_reading), meter_read_at: row.meter_read_at,
    inspection_interval_days: row.inspection_interval_days, next_inspection_due: row.next_inspection_due,
    service_interval_days: row.service_interval_days, service_interval_meter: num(row.service_interval_meter),
    next_service_due: row.next_service_due, next_service_meter: num(row.next_service_meter),
    fixed_asset_id: row.fixed_asset_id, vehicle_id: row.vehicle_id,
    disposed_at: row.disposed_at, disposal_reason: row.disposal_reason, notes: row.notes,
    currency: row.currency, rate_unit: row.rate_unit, updated_at: row.updated_at,
    // Kept for the older project-workspace fleet view.
    location: row.current_location, license_plate: row.registration_number, next_maintenance_date: row.next_service_due,
  };
  if (powers.seeCost) {
    out.cost_rate = Number(row.cost_rate); out.billing_rate = Number(row.billing_rate);
    out.cost_rate_hourly = row.metadata?.cost_rate_hourly ?? (row.rate_unit === 'HOUR' ? Number(row.cost_rate) : 0);
    out.cost_rate_daily = row.metadata?.cost_rate_daily ?? (row.rate_unit === 'DAY' ? Number(row.cost_rate) : 0);
  }
  return out;
}

function allocationOut(row: any) {
  return {
    id: row.id, project_id: row.project_id, project_name: row.project_name ?? null, resource_id: row.resource_id,
    resource_name: row.resource_name ?? null, resource_code: row.resource_code ?? null,
    resource_type: row.resource_type ? String(row.resource_type).toLowerCase() : undefined,
    start_date: row.start_date, end_date: row.end_date, allocated_pct: Number(row.allocation_pct),
    status: String(row.status).toLowerCase(), request_key: row.request_key,
    requested_by: row.requested_by, requested_by_name: row.requested_by_name ?? null,
    reserved_at: row.reserved_at, issued_at: row.issued_at, returned_at: row.returned_at,
    handed_to: row.handed_to, handed_to_name: row.handed_to_name ?? null,
    issue_condition: row.issue_condition, return_condition: row.return_condition,
    issue_meter: num(row.issue_meter), return_meter: num(row.return_meter), cancel_reason: row.cancel_reason,
    work_package_id: row.metadata?.work_package_id ?? null, hours_planned: row.metadata?.hours_planned ?? 0,
    hours_actual: row.metadata?.hours_actual ?? 0, allocated_cost: Number(row.allocated_cost ?? 0),
    operator_id: row.metadata?.operator_id ?? null, notes: row.metadata?.notes ?? null,
    overdue: row.status === 'ISSUED' && row.end_date < today(),
  };
}

// ── Eligibility & conflicts ──────────────────────────────────────────────────

export interface Eligibility { ok: boolean; reasons: string[] }

/** Why an asset can't be booked for [start, end]; computed for many assets at once. */
async function eligibilityFor(trx: Trx, tenantId: string, assets: any[], start = today(), end = start): Promise<Map<string, Eligibility>> {
  const ids = assets.map(a => a.id);
  const result = new Map<string, Eligibility>();
  if (!ids.length) return result;
  const [inspections, repairs, certs] = await Promise.all([
    trx.selectFrom('project_equipment_inspections').select(['resource_id', 'result', 'defects', 'inspected_at'])
      .where('tenant_id', '=', tenantId).where('resource_id', 'in', ids)
      .distinctOn('resource_id').orderBy('resource_id').orderBy('inspected_at', 'desc').execute(),
    trx.selectFrom('project_equipment_maintenance').select(['resource_id', 'description'])
      .where('tenant_id', '=', tenantId).where('resource_id', 'in', ids).where('status', '=', 'IN_PROGRESS').execute(),
    trx.selectFrom('project_equipment_certificates').select(['resource_id', 'certificate_type', 'expires_on'])
      .where('tenant_id', '=', tenantId).where('resource_id', 'in', ids).where('blocks_assignment', '=', true)
      .where('expires_on', 'is not', null).where('expires_on', '<', end).execute(),
  ]);
  for (const a of assets) {
    const reasons: string[] = [];
    if (a.status === 'DECOMMISSIONED') reasons.push(a.disposed_at ? 'Disposed' : 'Decommissioned');
    const repair = repairs.find(r => r.resource_id === a.id);
    if (repair) reasons.push(`Under maintenance: ${repair.description}`);
    else if (a.status === 'MAINTENANCE') reasons.push('Marked as in maintenance');
    if (a.condition === 'DAMAGED') reasons.push('Reported damaged');
    const insp = inspections.find(i => i.resource_id === a.id);
    if (insp?.result === 'FAIL') reasons.push(`Failed its last inspection: ${insp.defects}`);
    if (a.next_inspection_due && a.next_inspection_due < start) reasons.push(`Inspection overdue since ${a.next_inspection_due}`);
    for (const c of certs.filter(c => c.resource_id === a.id))
      reasons.push(c.expires_on! < start ? `${c.certificate_type} expired on ${c.expires_on}` : `${c.certificate_type} expires on ${c.expires_on}, before this booking ends`);
    if (a.ownership !== 'OWNED' && a.rental_end && a.rental_end < end) reasons.push(`Rental ends on ${a.rental_end}`);
    if (a.ownership !== 'OWNED' && a.rental_start && a.rental_start > start) reasons.push(`Rental starts on ${a.rental_start}`);
    result.set(a.id, { ok: reasons.length === 0, reasons });
  }
  return result;
}

/** Live bookings overlapping the window, and whether one more at `pct` fits. */
async function capacityCheck(trx: Trx, tenantId: string, resourceId: string, start: string, end: string, pct: number, excludeId?: string) {
  let q = trx.selectFrom('project_resource_allocations as al')
    .leftJoin('projects as p', j => j.onRef('p.id', '=', 'al.project_id').on('p.tenant_id', '=', tenantId))
    .select(['al.id', 'al.project_id', 'p.name as project_name', 'al.start_date', 'al.end_date', 'al.allocation_pct', 'al.status'])
    .where('al.tenant_id', '=', tenantId).where('al.resource_id', '=', resourceId).where('al.status', 'in', [...LIVE])
    .where('al.start_date', '<=', end).where('al.end_date', '>=', start);
  if (excludeId) q = q.where('al.id', '!=', excludeId);
  const overlapping = await q.orderBy('al.start_date').execute();
  // Capacity only changes where a booking starts, so check those points.
  const points = new Set([start, ...overlapping.map(r => r.start_date).filter(d => d >= start)]);
  let fits = true;
  for (const point of points) {
    const used = overlapping.filter(r => r.start_date <= point && r.end_date >= point).reduce((t, r) => t + Number(r.allocation_pct), 0);
    if (used + pct > 100) fits = false;
  }
  return { fits, conflicts: overlapping };
}

/** Selection-time check for the booking form: same rules the write enforces. */
export async function availability(trx: Trx, actor: EquipmentActor, resourceId: string, start: string, end: string, pct = 100, projectId?: string) {
  if (end < start) fail('End date must be on or after start date', 400);
  const asset = await trx.selectFrom('project_resources').selectAll().where('tenant_id', '=', actor.tenantId).where('id', '=', resourceId).executeTakeFirst();
  if (!asset) fail('Asset not found', 404);
  const powers = await equipmentPowers(trx, actor);
  const elig = (await eligibilityFor(trx, actor.tenantId, [asset], start, end)).get(resourceId)!;
  const cap = await capacityCheck(trx, actor.tenantId, resourceId, start, end, pct);
  const visible = await visibleProjectIds(trx, actor, powers);
  return {
    ok: elig.ok && cap.fits, reasons: elig.reasons, fits: cap.fits,
    conflicts: cap.conflicts.map(c => ({
      ...c, status: c.status.toLowerCase(), allocation_pct: Number(c.allocation_pct),
      project_name: !visible || visible.has(c.project_id) || c.project_id === projectId ? c.project_name : 'Another project',
    })),
  };
}

/** null = every project; otherwise the projects this user owns or belongs to. */
async function visibleProjectIds(trx: Trx, actor: EquipmentActor, powers: Powers): Promise<Set<string> | null> {
  if (powers.manage || ADMIN_ROLES.includes(actor.role)) return null;
  const rows = await trx.selectFrom('projects').select('id').where('tenant_id', '=', actor.tenantId)
    .where(eb => eb.or([eb('owner_id', '=', actor.userId), eb('id', 'in', eb.selectFrom('project_members').select('project_id')
      .where('tenant_id', '=', actor.tenantId).where('user_id', '=', actor.userId))])).execute();
  return new Set(rows.map(r => r.id));
}

// ── Register ─────────────────────────────────────────────────────────────────

export interface AssetInput {
  resource_type?: typeof ASSET_TYPES[number]; name?: string; code?: string | null; category?: string | null;
  manufacturer?: string | null; make_model?: string | null; serial_number?: string | null; registration_number?: string | null;
  year_built?: number | null; ownership?: 'OWNED' | 'RENTED' | 'LEASED'; owner_vendor_id?: string | null;
  rental_reference?: string | null; rental_start?: string | null; rental_end?: string | null;
  home_site?: string | null; current_location?: string | null; custodian_id?: string | null; condition?: typeof CONDITIONS[number];
  capacity_value?: number | null; capacity_unit?: string | null; capacity_rating?: string | null;
  meter_unit?: 'HOURS' | 'KM' | 'MILES' | 'CYCLES' | null; meter_reading?: number | null;
  inspection_interval_days?: number | null; next_inspection_due?: string | null;
  service_interval_days?: number | null; service_interval_meter?: number | null; next_service_due?: string | null; next_service_meter?: number | null;
  fixed_asset_id?: string | null; vehicle_id?: string | null; notes?: string | null;
  cost_rate?: number; billing_rate?: number; rate_unit?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH'; currency?: string;
  /** Legacy fleet form: both rates are kept for the older project view. */
  cost_rate_hourly?: number; cost_rate_daily?: number;
  status?: 'available' | 'maintenance';
}

const COLUMN_FIELDS = ['category', 'manufacturer', 'serial_number', 'registration_number', 'year_built', 'ownership', 'owner_vendor_id',
  'rental_reference', 'rental_start', 'rental_end', 'home_site', 'current_location', 'custodian_id', 'condition',
  'capacity_value', 'capacity_unit', 'meter_unit', 'inspection_interval_days', 'next_inspection_due', 'service_interval_days',
  'service_interval_meter', 'next_service_due', 'next_service_meter', 'fixed_asset_id', 'vehicle_id', 'notes',
  'cost_rate', 'billing_rate', 'rate_unit', 'currency', 'name'] as const;

function legacyMetadata(base: Record<string, any>, d: AssetInput) {
  const m = { ...base };
  for (const k of ['capacity_rating', 'cost_rate_hourly', 'cost_rate_daily'] as const) if (d[k] !== undefined) m[k] = d[k];
  return m;
}

async function validateRefs(trx: Trx, tenantId: string, d: AssetInput) {
  await sameTenant(trx, tenantId, 'users', d.custodian_id, 'Custodian');
  await sameTenant(trx, tenantId, 'suppliers', d.owner_vendor_id, 'Rental supplier');
  await sameTenant(trx, tenantId, 'fixed_assets', d.fixed_asset_id, 'Fixed asset');
  await sameTenant(trx, tenantId, 'vehicles', d.vehicle_id, 'Vehicle');
}

export async function createAsset(trx: Trx, actor: EquipmentActor, d: AssetInput & { name: string; resource_type: typeof ASSET_TYPES[number] }, source = 'REGISTERED') {
  const powers = await requireManage(trx, actor);
  await validateRefs(trx, actor.tenantId, d);
  const code = d.code?.trim() || `RES-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  if (await trx.selectFrom('project_resources').select('id').where('tenant_id', '=', actor.tenantId).where('code', '=', code).executeTakeFirst())
    fail(`Asset code ${code} is already in the register`, 409);
  const values: Record<string, any> = { tenant_id: actor.tenantId, code, resource_type: d.resource_type.toUpperCase(),
    model_or_specs: d.make_model ?? null, status: (d.status ?? 'available').toUpperCase(),
    metadata: legacyMetadata({}, d) };
  for (const k of COLUMN_FIELDS) if (d[k] !== undefined) values[k] = d[k];
  if (d.meter_reading != null) { values.meter_reading = d.meter_reading; values.meter_read_at = new Date(); }
  if (!values.current_location && values.home_site) values.current_location = values.home_site;
  const row = await trx.insertInto('project_resources').values(values as any).returningAll().executeTakeFirstOrThrow()
    .catch((e: any) => (e?.code === '23505' ? fail(`Asset code ${code} is already in the register`, 409) : Promise.reject(e)));
  if (d.meter_reading != null && d.meter_unit)
    await trx.insertInto('project_equipment_readings').values({ tenant_id: actor.tenantId, resource_id: row.id, reading: d.meter_reading, unit: d.meter_unit, source: source === 'IMPORTED' ? 'IMPORT' : 'MANUAL', recorded_by: actor.userId }).execute();
  await logEvent(trx, actor, { resourceId: row.id, type: source, to: row.current_location, details: { code, name: row.name } });
  return assetOut(row, powers);
}

export async function updateAsset(trx: Trx, actor: EquipmentActor, id: string, d: AssetInput, source = 'UPDATED') {
  const powers = await requireManage(trx, actor);
  const existing = await lockAsset(trx, actor.tenantId, id);
  if (existing.status === 'DECOMMISSIONED') fail('A disposed asset cannot be edited', 409);
  await validateRefs(trx, actor.tenantId, d);
  if (d.code && d.code !== existing.code) fail('An asset code cannot be changed once registered', 400);
  const set: Record<string, any> = {};
  for (const k of COLUMN_FIELDS) if (d[k] !== undefined && (existing as any)[k] !== d[k]) set[k] = d[k];
  if (d.make_model !== undefined && d.make_model !== existing.model_or_specs) set.model_or_specs = d.make_model;
  if (d.resource_type && d.resource_type.toUpperCase() !== existing.resource_type) set.resource_type = d.resource_type.toUpperCase();
  if (d.capacity_rating !== undefined || d.cost_rate_hourly !== undefined || d.cost_rate_daily !== undefined) set.metadata = legacyMetadata(existing.metadata, d);
  if (d.status && d.status.toUpperCase() !== existing.status) {
    if (d.status === 'maintenance' && await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', actor.tenantId)
      .where('resource_id', '=', id).where('status', 'in', [...LIVE]).where('end_date', '>=', today()).executeTakeFirst())
      fail('Receive this asset back and move or cancel its current and upcoming bookings before taking it out of service', 409);
    set.status = d.status === 'available' && existing.status === 'ALLOCATED' ? 'ALLOCATED' : d.status.toUpperCase();
  }
  if (!Object.keys(set).length) return assetOut(existing, powers);
  const row = await trx.updateTable('project_resources').set({ ...set, updated_at: new Date() } as any)
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  const changes = Object.fromEntries(Object.keys(set).filter(k => k !== 'metadata').map(k => [k, [(existing as any)[k] ?? null, set[k]]]));
  // Rates are not written into history other users can read.
  for (const k of ['cost_rate', 'billing_rate']) if (changes[k]) changes[k] = ['hidden', 'changed'];
  if ('current_location' in set) await logEvent(trx, actor, { resourceId: id, type: 'LOCATION_CHANGED', from: existing.current_location, to: set.current_location });
  await logEvent(trx, actor, { resourceId: id, type: source, details: { changes } });
  return assetOut(row, powers);
}

export async function disposeAsset(trx: Trx, actor: EquipmentActor, id: string, reason: string) {
  const powers = await requireManage(trx, actor);
  const asset = await lockAsset(trx, actor.tenantId, id);
  if (asset.status === 'DECOMMISSIONED') fail('This asset is already disposed', 409);
  const live = await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', actor.tenantId)
    .where('resource_id', '=', id).where('status', 'in', [...LIVE]).executeTakeFirst();
  if (live) fail('Cancel or close this asset\'s bookings before disposing of it', 409);
  const row = await trx.updateTable('project_resources').set({ status: 'DECOMMISSIONED', disposed_at: new Date(), disposal_reason: reason, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: id, type: 'DISPOSED', from: asset.current_location, details: { reason, fixed_asset_id: asset.fixed_asset_id } });
  return assetOut(row, powers);
}

export interface AssetFilters {
  q?: string; type?: string; status?: string; ownership?: string; availability?: 'available' | 'unavailable' | 'issued';
  site?: string; custodian?: string; due?: boolean; sort?: string; dir?: 'asc' | 'desc'; page?: number; pageSize?: number;
}
const SORTS: Record<string, string> = { name: 'res.name', code: 'res.code', type: 'res.resource_type', status: 'res.status',
  location: 'res.current_location', next_inspection_due: 'res.next_inspection_due', next_service_due: 'res.next_service_due', updated_at: 'res.updated_at' };

function assetQuery(trx: Trx, tenantId: string, f: AssetFilters) {
  const t = today();
  let q = trx.selectFrom('project_resources as res')
    .leftJoin('users as cu', j => j.onRef('cu.id', '=', 'res.custodian_id').on('cu.tenant_id', '=', tenantId))
    .leftJoin('suppliers as sv', j => j.onRef('sv.id', '=', 'res.owner_vendor_id').on('sv.tenant_id', '=', tenantId))
    .where('res.tenant_id', '=', tenantId);
  if (f.q) { const like = `%${f.q.trim()}%`; q = q.where(eb => eb.or(['res.name', 'res.code', 'res.serial_number', 'res.registration_number', 'res.model_or_specs', 'res.category'].map(c => eb(c as any, 'ilike', like)))); }
  if (f.type) q = q.where('res.resource_type', '=', f.type.toUpperCase());
  else q = q.where('res.resource_type', '!=', 'PERSONNEL');
  if (f.status) q = q.where('res.status', '=', f.status.toUpperCase());
  else q = q.where('res.status', '!=', 'DECOMMISSIONED');
  if (f.ownership) q = q.where('res.ownership', '=', f.ownership.toUpperCase());
  if (f.site) q = q.where(eb => eb.or([eb('res.current_location', 'ilike', `%${f.site}%`), eb('res.home_site', 'ilike', `%${f.site}%`)]));
  if (f.custodian) q = q.where('res.custodian_id', '=', f.custodian);
  const blocked = sql<boolean>`(res.status in ('MAINTENANCE','DECOMMISSIONED') or res.condition = 'DAMAGED'
    or (res.next_inspection_due is not null and res.next_inspection_due < ${t}::date)
    or exists (select 1 from project_equipment_certificates c where c.tenant_id = res.tenant_id and c.resource_id = res.id and c.blocks_assignment and c.expires_on < ${t}::date)
    or (select i.result from project_equipment_inspections i where i.tenant_id = res.tenant_id and i.resource_id = res.id order by i.inspected_at desc limit 1) = 'FAIL'
    or (res.ownership <> 'OWNED' and res.rental_end is not null and res.rental_end < ${t}::date))`;
  const issued = sql<boolean>`exists (select 1 from project_resource_allocations a where a.tenant_id = res.tenant_id and a.resource_id = res.id and a.status = 'ISSUED')`;
  if (f.availability === 'unavailable') q = q.where(blocked);
  if (f.availability === 'available') q = q.where(sql<boolean>`not ${blocked} and not ${issued}`);
  if (f.availability === 'issued') q = q.where(issued);
  if (f.due) {
    const soon = addDays(t, 30);
    q = q.where(eb => eb.or([eb('res.next_inspection_due', '<=', soon), eb('res.next_service_due', '<=', soon),
      sql<boolean>`(res.next_service_meter is not null and res.meter_reading >= res.next_service_meter)`,
      sql<boolean>`exists (select 1 from project_equipment_certificates c where c.tenant_id = res.tenant_id and c.resource_id = res.id and c.expires_on <= ${soon}::date)`]));
  }
  return q;
}

export async function listAssets(trx: Trx, actor: EquipmentActor, f: AssetFilters) {
  const powers = await equipmentPowers(trx, actor);
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 25));
  const base = assetQuery(trx, actor.tenantId, f);
  const { total } = await base.select(sql<number>`count(*)::int`.as('total')).executeTakeFirstOrThrow();
  const sortCol = SORTS[f.sort ?? 'name'] ?? 'res.name';
  const rows = await base.selectAll('res').select(['cu.name as custodian_name', 'cu.avatar_url as custodian_avatar_url', 'sv.name as vendor_name'])
    .orderBy(sql.raw(`${sortCol} ${f.dir === 'desc' ? 'desc' : 'asc'} nulls last`)).orderBy('res.id')
    .limit(pageSize).offset((page - 1) * pageSize).execute();
  const elig = await eligibilityFor(trx, actor.tenantId, rows);
  const ids = rows.map(r => r.id);
  const visible = await visibleProjectIds(trx, actor, powers);
  const current = ids.length ? await trx.selectFrom('project_resource_allocations as al')
    .leftJoin('projects as p', j => j.onRef('p.id', '=', 'al.project_id').on('p.tenant_id', '=', actor.tenantId))
    .select(['al.id', 'al.resource_id', 'al.project_id', 'p.name as project_name', 'al.end_date', 'al.status'])
    .where('al.tenant_id', '=', actor.tenantId).where('al.resource_id', 'in', ids).where('al.status', '=', 'ISSUED').execute() : [];
  return {
    data: rows.map(r => {
      const c = current.find(x => x.resource_id === r.id);
      return { ...assetOut(r, powers), eligibility: elig.get(r.id),
        issued_to: c ? { allocation_id: c.id, project_id: c.project_id, project_name: !visible || visible.has(c.project_id) ? c.project_name : 'Another project', end_date: c.end_date, overdue: c.end_date < today() } : null };
    }),
    total, page, pageSize, powers,
  };
}

export async function getAsset(trx: Trx, actor: EquipmentActor, id: string) {
  const powers = await equipmentPowers(trx, actor);
  const row = await assetQuery(trx, actor.tenantId, { status: undefined }).where('res.id', '=', id)
    .selectAll('res').select(['cu.name as custodian_name', 'cu.avatar_url as custodian_avatar_url', 'sv.name as vendor_name']).executeTakeFirst()
    ?? await trx.selectFrom('project_resources as res').selectAll('res').where('res.tenant_id', '=', actor.tenantId).where('res.id', '=', id).executeTakeFirst();
  if (!row) fail('Asset not found', 404);
  const visible = await visibleProjectIds(trx, actor, powers);
  const projName = (pid: string | null, name: string | null) => (!pid ? null : !visible || visible.has(pid) ? name : 'Another project');
  const [allocations, events, readings, inspections, certificates, maintenance, documents] = await Promise.all([
    trx.selectFrom('project_resource_allocations as al')
      .leftJoin('projects as p', j => j.onRef('p.id', '=', 'al.project_id').on('p.tenant_id', '=', actor.tenantId))
      .leftJoin('users as rq', j => j.onRef('rq.id', '=', 'al.requested_by').on('rq.tenant_id', '=', actor.tenantId))
      .leftJoin('users as ht', j => j.onRef('ht.id', '=', 'al.handed_to').on('ht.tenant_id', '=', actor.tenantId))
      .selectAll('al').select(['p.name as project_name', 'rq.name as requested_by_name', 'ht.name as handed_to_name'])
      .where('al.tenant_id', '=', actor.tenantId).where('al.resource_id', '=', id).orderBy('al.start_date', 'desc').limit(100).execute(),
    trx.selectFrom('project_equipment_events as e')
      .leftJoin('users as u', j => j.onRef('u.id', '=', 'e.actor_id').on('u.tenant_id', '=', actor.tenantId))
      .leftJoin('projects as p', j => j.onRef('p.id', '=', 'e.project_id').on('p.tenant_id', '=', actor.tenantId))
      .selectAll('e').select(['u.name as actor_name', 'u.avatar_url as actor_avatar_url', 'p.name as project_name'])
      .where('e.tenant_id', '=', actor.tenantId).where('e.resource_id', '=', id).orderBy('e.created_at', 'desc').limit(200).execute(),
    trx.selectFrom('project_equipment_readings').selectAll().where('tenant_id', '=', actor.tenantId).where('resource_id', '=', id).orderBy('read_at', 'desc').limit(50).execute(),
    trx.selectFrom('project_equipment_inspections as i')
      .leftJoin('users as u', j => j.onRef('u.id', '=', 'i.inspected_by').on('u.tenant_id', '=', actor.tenantId))
      .selectAll('i').select(['u.name as inspected_by_name']).where('i.tenant_id', '=', actor.tenantId).where('i.resource_id', '=', id).orderBy('i.inspected_at', 'desc').limit(50).execute(),
    trx.selectFrom('project_equipment_certificates').selectAll().where('tenant_id', '=', actor.tenantId).where('resource_id', '=', id).orderBy('expires_on', 'asc').execute(),
    trx.selectFrom('project_equipment_maintenance').selectAll().where('tenant_id', '=', actor.tenantId).where('resource_id', '=', id).orderBy('created_at', 'desc').limit(50).execute(),
    trx.selectFrom('cloud_files').select(['id', 'name', 'mime_type', 'size', 'owner_name', 'created_at'])
      .where('tenant_id', '=', actor.tenantId).where('entity_type', '=', 'project_resource').where('entity_id', '=', id).where('is_trash', '=', false).orderBy('created_at', 'desc').execute(),
  ]);
  return {
    asset: { ...assetOut(row, powers), eligibility: (await eligibilityFor(trx, actor.tenantId, [row])).get(id) },
    allocations: allocations.map(a => ({ ...allocationOut(a), project_name: projName(a.project_id, a.project_name) })),
    events: events.map(e => ({ ...e, project_name: projName(e.project_id, e.project_name) })),
    readings: readings.map(r => ({ ...r, reading: Number(r.reading) })), inspections, certificates,
    maintenance: maintenance.map(m => ({ ...m, cost: powers.seeCost ? num(m.cost) : undefined, downtime_hours: num(m.downtime_hours) })),
    documents, powers, can_handle: powers.manage || row!.custodian_id === actor.userId,
  };
}

// ── Allocation lifecycle ─────────────────────────────────────────────────────

export interface RequestInput {
  resource_id: string; start_date: string; end_date: string; allocated_pct?: number; hours_planned?: number;
  work_package_id?: string | null; operator_id?: string | null; notes?: string | null; request_key?: string | null;
}

export async function requestAllocation(trx: Trx, actor: EquipmentActor, projectId: string, d: RequestInput) {
  if (d.end_date < d.start_date) fail('End date must be on or after start date', 400);
  const access = await resolveProjectAccess(trx, actor.tenantId, actor.userId, actor.role, projectId);
  if (!access) fail('Project not found', 404);
  if (!canEditProject(access!.access)) fail('Only people who can edit this project can request equipment for it', 403);
  const asset = await lockAsset(trx, actor.tenantId, d.resource_id);
  if (d.request_key) {
    const prior = await trx.selectFrom('project_resource_allocations').selectAll().where('tenant_id', '=', actor.tenantId).where('request_key', '=', d.request_key).executeTakeFirst();
    if (prior) {
      if (prior.project_id !== projectId || prior.resource_id !== d.resource_id) fail('This request key was already used for a different booking', 409);
      return { ...allocationOut({ ...prior, resource_name: asset.name }), replayed: true };
    }
  }
  if (d.work_package_id && !await trx.selectFrom('project_work_packages').select('id').where('tenant_id', '=', actor.tenantId).where('project_id', '=', projectId).where('id', '=', d.work_package_id).executeTakeFirst()) fail('Work package not found in this project', 404);
  await sameTenant(trx, actor.tenantId, 'users', d.operator_id, 'Operator');
  const elig = (await eligibilityFor(trx, actor.tenantId, [asset], d.start_date, d.end_date)).get(asset.id)!;
  if (!elig.ok) fail(`${asset.name} can't be booked: ${elig.reasons.join('; ')}`, 409, { reasons: elig.reasons });
  const pct = d.allocated_pct ?? 100;
  const cap = await capacityCheck(trx, actor.tenantId, asset.id, d.start_date, d.end_date, pct);
  if (!cap.fits) fail(`${asset.name} is already booked for some of these dates`, 409, { conflicts: cap.conflicts.length });
  const powers = await equipmentPowers(trx, actor);
  const handler = powers.manage || asset.custodian_id === actor.userId;
  const row = await trx.insertInto('project_resource_allocations').values({
    tenant_id: actor.tenantId, project_id: projectId, task_id: null, resource_id: asset.id, start_date: d.start_date, end_date: d.end_date,
    allocation_pct: pct, status: handler ? 'CONFIRMED' : 'REQUESTED', request_key: d.request_key ?? null,
    requested_by: actor.userId, reserved_by: handler ? actor.userId : null, reserved_at: handler ? new Date() : null,
    metadata: { work_package_id: d.work_package_id ?? null, hours_planned: d.hours_planned ?? 0, operator_id: d.operator_id ?? null, notes: d.notes ?? null },
  }).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: row.id, projectId, type: handler ? 'RESERVED' : 'REQUESTED', details: { start_date: d.start_date, end_date: d.end_date } });
  if (!handler) await notifyHandlers(trx, actor, asset, projectId, row.id);
  return allocationOut({ ...row, resource_name: asset.name, resource_type: asset.resource_type });
}

async function notifyHandlers(trx: Trx, actor: EquipmentActor, asset: any, projectId: string, allocationId: string) {
  const project = await trx.selectFrom('projects').select('name').where('tenant_id', '=', actor.tenantId).where('id', '=', projectId).executeTakeFirst();
  const to = asset.custodian_id ? [asset.custodian_id]
    : (await trx.selectFrom('users').select('id').where('tenant_id', '=', actor.tenantId).where('active', '=', true).where('role', 'in', ['TENANT_ADMIN', 'ADMIN'] as any).limit(20).execute()).map(u => u.id);
  for (const userId of to.filter(u => u !== actor.userId)) {
    await NotificationService.createNotificationInTrx(trx, { tenantId: actor.tenantId, userId, app: 'projects', type: 'info',
      title: `Equipment requested: ${asset.name}`, message: `${project?.name ?? 'A project'} asked for ${asset.code}. Reserve or decline it.`,
      link: `/projects/equipment/${asset.id}`, entityType: 'project_resource_allocation', entityId: allocationId });
  }
}

async function loadAllocation(trx: Trx, tenantId: string, id: string) {
  const al = await trx.selectFrom('project_resource_allocations').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
  if (!al) fail('Booking not found', 404);
  return al!;
}

function expect(al: { status: string }, allowed: string[], action: string) {
  if (!allowed.includes(al.status)) fail(`Can't ${action} a booking that is ${al.status.toLowerCase()}`, 409);
}

export async function reserveAllocation(trx: Trx, actor: EquipmentActor, id: string) {
  const first = await loadAllocation(trx, actor.tenantId, id);
  const asset = await lockAsset(trx, actor.tenantId, first.resource_id);
  await requireHandler(trx, actor, asset);
  const al = await loadAllocation(trx, actor.tenantId, id);
  expect(al, ['REQUESTED'], 'reserve');
  const elig = (await eligibilityFor(trx, actor.tenantId, [asset], al.start_date, al.end_date)).get(asset.id)!;
  if (!elig.ok) fail(`${asset.name} can't be reserved: ${elig.reasons.join('; ')}`, 409, { reasons: elig.reasons });
  const row = await trx.updateTable('project_resource_allocations').set({ status: 'CONFIRMED', reserved_by: actor.userId, reserved_at: new Date(), updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: id, projectId: al.project_id, type: 'RESERVED' });
  return allocationOut({ ...row, resource_name: asset.name });
}

async function meterCheck(trx: Trx, actor: EquipmentActor, asset: any, meter: number | null | undefined, allocationId: string, source: 'ISSUE' | 'RETURN') {
  if (meter == null) return;
  if (!asset.meter_unit) fail('This asset has no meter set up', 400);
  if (asset.meter_reading != null && meter < Number(asset.meter_reading)) fail(`Meter reading ${meter} is below the last recorded ${Number(asset.meter_reading)} ${asset.meter_unit.toLowerCase()}`, 400);
  await trx.insertInto('project_equipment_readings').values({ tenant_id: actor.tenantId, resource_id: asset.id, allocation_id: allocationId, reading: meter, unit: asset.meter_unit, source, recorded_by: actor.userId }).execute();
}

export async function issueAllocation(trx: Trx, actor: EquipmentActor, id: string, d: { condition: typeof CONDITIONS[number]; meter?: number | null; handed_to?: string | null; location?: string | null }) {
  const first = await loadAllocation(trx, actor.tenantId, id);
  const asset = await lockAsset(trx, actor.tenantId, first.resource_id);
  await requireHandler(trx, actor, asset);
  const al = await loadAllocation(trx, actor.tenantId, id);
  expect(al, ['CONFIRMED'], 'issue');
  if (d.condition === 'DAMAGED') fail('A damaged asset can\'t be issued; record the repair first', 409);
  const start = al.start_date > today() ? al.start_date : today();
  const elig = (await eligibilityFor(trx, actor.tenantId, [asset], start, al.end_date)).get(asset.id)!;
  if (!elig.ok) fail(`${asset.name} can't be issued: ${elig.reasons.join('; ')}`, 409, { reasons: elig.reasons });
  if (await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', actor.tenantId).where('resource_id', '=', asset.id).where('status', '=', 'ISSUED').where('allocation_pct', '=', 100).executeTakeFirst())
    fail(`${asset.name} is still out on another booking; receive it back first`, 409);
  await sameTenant(trx, actor.tenantId, 'users', d.handed_to, 'Person receiving the asset');
  await meterCheck(trx, actor, asset, d.meter, id, 'ISSUE');
  const project = await trx.selectFrom('projects').select('name').where('tenant_id', '=', actor.tenantId).where('id', '=', al.project_id).executeTakeFirst();
  const to = d.location?.trim() || project?.name || null;
  const row = await trx.updateTable('project_resource_allocations').set({ status: 'ISSUED', issued_by: actor.userId, issued_at: new Date(), handed_to: d.handed_to ?? null, issue_condition: d.condition, issue_meter: d.meter ?? null, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  await trx.updateTable('project_resources').set({ status: 'ALLOCATED', condition: d.condition, current_location: to,
    ...(d.meter != null ? { meter_reading: d.meter, meter_read_at: new Date() } : {}), updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: id, projectId: al.project_id, type: 'ISSUED', from: asset.current_location, to, details: { condition: d.condition, meter: d.meter ?? null, handed_to: d.handed_to ?? null } });
  return allocationOut({ ...row, resource_name: asset.name });
}

export async function returnAllocation(trx: Trx, actor: EquipmentActor, id: string, d: {
  condition: typeof CONDITIONS[number]; meter?: number | null; location?: string | null;
  inspection?: { result: 'PASS' | 'PASS_WITH_DEFECTS' | 'FAIL'; defects?: string | null; next_due?: string | null } | null;
}) {
  const first = await loadAllocation(trx, actor.tenantId, id);
  const asset = await lockAsset(trx, actor.tenantId, first.resource_id);
  await requireHandler(trx, actor, asset);
  const al = await loadAllocation(trx, actor.tenantId, id);
  expect(al, ['ISSUED'], 'receive');
  await meterCheck(trx, actor, asset, d.meter, id, 'RETURN');
  if (d.inspection) {
    if (d.inspection.result === 'FAIL' && !d.inspection.defects?.trim()) fail('Describe the defects found', 400);
    await insertInspection(trx, actor, asset, { inspection_type: 'RETURN', ...d.inspection }, id);
  }
  const row = await trx.updateTable('project_resource_allocations').set({ status: 'COMPLETED', returned_by: actor.userId, returned_at: new Date(), return_condition: d.condition, return_meter: d.meter ?? null, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  const stillOut = await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', actor.tenantId).where('resource_id', '=', asset.id).where('status', '=', 'ISSUED').executeTakeFirst();
  const needsWork = d.condition === 'DAMAGED' || d.inspection?.result === 'FAIL';
  const to = d.location?.trim() || asset.home_site || null;
  await trx.updateTable('project_resources').set({ status: stillOut ? 'ALLOCATED' : needsWork ? 'MAINTENANCE' : 'AVAILABLE', condition: d.condition,
    current_location: stillOut ? asset.current_location : to, ...(d.meter != null ? { meter_reading: d.meter, meter_read_at: new Date() } : {}), updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: id, projectId: al.project_id, type: 'RETURNED', from: asset.current_location, to, details: { condition: d.condition, meter: d.meter ?? null, inspection: d.inspection?.result ?? null, late: al.end_date < today() } });
  return allocationOut({ ...row, resource_name: asset.name });
}

export async function cancelAllocation(trx: Trx, actor: EquipmentActor, id: string, reason: string | null) {
  const first = await loadAllocation(trx, actor.tenantId, id);
  const asset = await lockAsset(trx, actor.tenantId, first.resource_id);
  const al = await loadAllocation(trx, actor.tenantId, id);
  expect(al, ['REQUESTED', 'CONFIRMED'], 'cancel');
  const powers = await equipmentPowers(trx, actor);
  const access = await resolveProjectAccess(trx, actor.tenantId, actor.userId, actor.role, al.project_id);
  const allowed = powers.manage || asset.custodian_id === actor.userId || al.requested_by === actor.userId || (access && ['owner', 'admin'].includes(access.access));
  if (!allowed) fail('Only the requester, the project owner or an equipment manager can cancel this booking', 403);
  const row = await trx.updateTable('project_resource_allocations').set({ status: 'RELEASED', cancelled_by: actor.userId, cancel_reason: reason, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: id, projectId: al.project_id, type: al.status === 'REQUESTED' && al.requested_by !== actor.userId ? 'DECLINED' : 'CANCELLED', details: { reason } });
  return allocationOut({ ...row, resource_name: asset.name });
}

/** Move an asset straight from one project's site to another's, without a trip back to the yard. */
export async function reassignAllocation(trx: Trx, actor: EquipmentActor, id: string, d: { project_id: string; end_date: string; location?: string | null; meter?: number | null }) {
  const first = await loadAllocation(trx, actor.tenantId, id);
  const asset = await lockAsset(trx, actor.tenantId, first.resource_id);
  await requireHandler(trx, actor, asset);
  const al = await loadAllocation(trx, actor.tenantId, id);
  expect(al, ['ISSUED'], 'reassign');
  if (d.project_id === al.project_id) fail('Pick a different project', 400);
  await sameTenant(trx, actor.tenantId, 'projects', d.project_id, 'Project');
  const start = today();
  if (d.end_date < start) fail('The new booking must end today or later', 400);
  const elig = (await eligibilityFor(trx, actor.tenantId, [asset], start, d.end_date)).get(asset.id)!;
  if (!elig.ok) fail(`${asset.name} can't be reassigned: ${elig.reasons.join('; ')}`, 409, { reasons: elig.reasons });
  const cap = await capacityCheck(trx, actor.tenantId, asset.id, start, d.end_date, Number(al.allocation_pct), id);
  if (!cap.fits) fail(`${asset.name} is already booked for some of these dates`, 409);
  await meterCheck(trx, actor, asset, d.meter, id, 'RETURN');
  await trx.updateTable('project_resource_allocations').set({ status: 'COMPLETED', returned_by: actor.userId, returned_at: new Date(), return_condition: asset.condition, return_meter: d.meter ?? null, end_date: al.end_date < start ? al.end_date : start, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', id).execute();
  const target = await trx.selectFrom('projects').select('name').where('tenant_id', '=', actor.tenantId).where('id', '=', d.project_id).executeTakeFirstOrThrow();
  const to = d.location?.trim() || target.name;
  const row = await trx.insertInto('project_resource_allocations').values({
    tenant_id: actor.tenantId, project_id: d.project_id, task_id: null, resource_id: asset.id, start_date: start, end_date: d.end_date,
    allocation_pct: al.allocation_pct, status: 'ISSUED', requested_by: actor.userId, reserved_by: actor.userId, reserved_at: new Date(),
    issued_by: actor.userId, issued_at: new Date(), issue_condition: asset.condition, issue_meter: d.meter ?? null, metadata: { reassigned_from: id },
  }).returningAll().executeTakeFirstOrThrow();
  await trx.updateTable('project_resources').set({ current_location: to, ...(d.meter != null ? { meter_reading: d.meter, meter_read_at: new Date() } : {}), updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId: row.id, projectId: d.project_id, type: 'REASSIGNED', from: asset.current_location, to, details: { from_project_id: al.project_id, from_allocation_id: id } });
  return allocationOut({ ...row, resource_name: asset.name });
}

export async function listAllocations(trx: Trx, actor: EquipmentActor, f: { view?: 'requests' | 'reserved' | 'issued' | 'overdue' | 'history' | 'all'; projectId?: string; resourceId?: string; page?: number; pageSize?: number }) {
  const powers = await equipmentPowers(trx, actor);
  const visible = await visibleProjectIds(trx, actor, powers);
  if (f.projectId && visible && !visible.has(f.projectId)) fail('Project access required', 403);
  const page = Math.max(1, f.page ?? 1); const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 25));
  let q = trx.selectFrom('project_resource_allocations as al')
    .innerJoin('project_resources as res', j => j.onRef('res.id', '=', 'al.resource_id').on('res.tenant_id', '=', actor.tenantId))
    .leftJoin('projects as p', j => j.onRef('p.id', '=', 'al.project_id').on('p.tenant_id', '=', actor.tenantId))
    .leftJoin('users as rq', j => j.onRef('rq.id', '=', 'al.requested_by').on('rq.tenant_id', '=', actor.tenantId))
    .leftJoin('users as ht', j => j.onRef('ht.id', '=', 'al.handed_to').on('ht.tenant_id', '=', actor.tenantId))
    .where('al.tenant_id', '=', actor.tenantId).where('res.resource_type', '!=', 'PERSONNEL');
  if (visible) q = q.where('al.project_id', 'in', visible.size ? [...visible] : ['00000000-0000-0000-0000-000000000000']);
  if (f.projectId) q = q.where('al.project_id', '=', f.projectId);
  if (f.resourceId) q = q.where('al.resource_id', '=', f.resourceId);
  const view = f.view ?? 'all';
  if (view === 'requests') q = q.where('al.status', '=', 'REQUESTED');
  if (view === 'reserved') q = q.where('al.status', '=', 'CONFIRMED');
  if (view === 'issued') q = q.where('al.status', '=', 'ISSUED');
  if (view === 'overdue') q = q.where('al.status', '=', 'ISSUED').where('al.end_date', '<', today());
  if (view === 'history') q = q.where('al.status', 'in', ['COMPLETED', 'RELEASED']);
  const { total } = await q.select(sql<number>`count(*)::int`.as('total')).executeTakeFirstOrThrow();
  const rows = await q.selectAll('al').select(['res.name as resource_name', 'res.code as resource_code', 'res.resource_type', 'res.custodian_id', 'p.name as project_name', 'rq.name as requested_by_name', 'ht.name as handed_to_name'])
    .orderBy(view === 'history' ? 'al.updated_at' : 'al.start_date', view === 'history' ? 'desc' : 'asc').orderBy('al.id').limit(pageSize).offset((page - 1) * pageSize).execute();
  return { data: rows.map(r => ({ ...allocationOut(r), can_handle: powers.manage || r.custodian_id === actor.userId })), total, page, pageSize, powers };
}

// ── Inspections, certificates, readings, maintenance ─────────────────────────

async function insertInspection(trx: Trx, actor: EquipmentActor, asset: any, d: { inspection_type: string; result: string; defects?: string | null; next_due?: string | null }, allocationId: string | null = null) {
  const nextDue = d.next_due ?? (asset.inspection_interval_days ? addDays(today(), asset.inspection_interval_days) : null);
  const row = await trx.insertInto('project_equipment_inspections').values({ tenant_id: actor.tenantId, resource_id: asset.id, allocation_id: allocationId,
    inspection_type: d.inspection_type, result: d.result, defects: d.defects?.trim() || null, next_due: nextDue, inspected_by: actor.userId }).returningAll().executeTakeFirstOrThrow();
  if (nextDue) await trx.updateTable('project_resources').set({ next_inspection_due: nextDue, updated_at: new Date() }).where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, allocationId, type: 'INSPECTED', details: { type: d.inspection_type, result: d.result, next_due: nextDue } });
  return row;
}

export async function addInspection(trx: Trx, actor: EquipmentActor, id: string, d: { inspection_type: string; result: string; defects?: string | null; next_due?: string | null }) {
  const asset = await lockAsset(trx, actor.tenantId, id);
  await requireHandler(trx, actor, asset);
  if (d.result === 'FAIL' && !d.defects?.trim()) fail('Describe the defects found', 400);
  return insertInspection(trx, actor, asset, d);
}

export async function addReading(trx: Trx, actor: EquipmentActor, id: string, reading: number) {
  const asset = await lockAsset(trx, actor.tenantId, id);
  await requireHandler(trx, actor, asset);
  if (!asset.meter_unit) fail('This asset has no meter set up', 400);
  if (asset.meter_reading != null && reading < Number(asset.meter_reading)) fail(`Reading is below the last recorded ${Number(asset.meter_reading)}`, 400);
  const row = await trx.insertInto('project_equipment_readings').values({ tenant_id: actor.tenantId, resource_id: id, reading, unit: asset.meter_unit!, source: 'MANUAL', recorded_by: actor.userId }).returningAll().executeTakeFirstOrThrow();
  await trx.updateTable('project_resources').set({ meter_reading: reading, meter_read_at: new Date(), updated_at: new Date() }).where('tenant_id', '=', actor.tenantId).where('id', '=', id).execute();
  return { ...row, reading: Number(row.reading) };
}

export async function addCertificate(trx: Trx, actor: EquipmentActor, id: string, d: { certificate_type: string; reference?: string | null; issuer?: string | null; issued_on?: string | null; expires_on?: string | null; blocks_assignment?: boolean; file_id?: string | null }) {
  await requireManage(trx, actor);
  await lockAsset(trx, actor.tenantId, id);
  await sameTenant(trx, actor.tenantId, 'cloud_files', d.file_id, 'Document');
  if (d.expires_on && d.issued_on && d.expires_on < d.issued_on) fail('Expiry must be on or after the issue date', 400);
  const row = await trx.insertInto('project_equipment_certificates').values({ tenant_id: actor.tenantId, resource_id: id, certificate_type: d.certificate_type,
    reference: d.reference ?? null, issuer: d.issuer ?? null, issued_on: d.issued_on ?? null, expires_on: d.expires_on ?? null,
    blocks_assignment: d.blocks_assignment ?? true, file_id: d.file_id ?? null, created_by: actor.userId }).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: id, type: 'CERTIFICATE_ADDED', details: { type: d.certificate_type, expires_on: d.expires_on ?? null } });
  return row;
}

export async function scheduleMaintenance(trx: Trx, actor: EquipmentActor, id: string, d: { kind: 'SERVICE' | 'REPAIR' | 'BREAKDOWN'; description: string; scheduled_for?: string | null; vendor_id?: string | null; start_now?: boolean }) {
  const asset = await lockAsset(trx, actor.tenantId, id);
  await requireHandler(trx, actor, asset);
  await sameTenant(trx, actor.tenantId, 'suppliers', d.vendor_id, 'Service provider');
  const row = await trx.insertInto('project_equipment_maintenance').values({ tenant_id: actor.tenantId, resource_id: id, kind: d.kind, description: d.description,
    scheduled_for: d.scheduled_for ?? null, vendor_id: d.vendor_id ?? null, created_by: actor.userId, currency: asset.currency }).returningAll().executeTakeFirstOrThrow();
  await logEvent(trx, actor, { resourceId: id, type: 'MAINTENANCE_SCHEDULED', details: { kind: d.kind, description: d.description, scheduled_for: d.scheduled_for ?? null } });
  return d.start_now ? startMaintenance(trx, actor, row.id) : row;
}

export async function startMaintenance(trx: Trx, actor: EquipmentActor, maintenanceId: string) {
  const m = await trx.selectFrom('project_equipment_maintenance').selectAll().where('tenant_id', '=', actor.tenantId).where('id', '=', maintenanceId).executeTakeFirst();
  if (!m) fail('Maintenance record not found', 404);
  const asset = await lockAsset(trx, actor.tenantId, m!.resource_id);
  await requireHandler(trx, actor, asset);
  if (m!.status !== 'SCHEDULED') fail(`This work is already ${m!.status.toLowerCase().replace('_', ' ')}`, 409);
  if (await trx.selectFrom('project_equipment_maintenance').select('id').where('tenant_id', '=', actor.tenantId).where('resource_id', '=', asset.id).where('status', '=', 'IN_PROGRESS').executeTakeFirst())
    fail('Other work on this asset is still in progress', 409);
  const row = await trx.updateTable('project_equipment_maintenance').set({ status: 'IN_PROGRESS', started_at: new Date(), updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', maintenanceId).returningAll().executeTakeFirstOrThrow();
  await trx.updateTable('project_resources').set({ status: 'MAINTENANCE', updated_at: new Date() }).where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, type: 'MAINTENANCE_STARTED', details: { kind: m!.kind, maintenance_id: maintenanceId } });
  return row;
}

export async function completeMaintenance(trx: Trx, actor: EquipmentActor, maintenanceId: string, d: { downtime_hours?: number | null; cost?: number | null; meter_at_service?: number | null; condition?: typeof CONDITIONS[number]; cancel?: boolean }) {
  const m = await trx.selectFrom('project_equipment_maintenance').selectAll().where('tenant_id', '=', actor.tenantId).where('id', '=', maintenanceId).executeTakeFirst();
  if (!m) fail('Maintenance record not found', 404);
  const asset = await lockAsset(trx, actor.tenantId, m!.resource_id);
  const powers = await requireHandler(trx, actor, asset);
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(m!.status)) fail('This work is already closed', 409);
  if (d.cost != null && !powers.seeCost) fail('Only people who can see equipment costs can record them', 403);
  if (d.meter_at_service != null) await meterCheck(trx, actor, asset, d.meter_at_service, null as any, 'RETURN');
  const status = d.cancel ? 'CANCELLED' : 'COMPLETED';
  const row = await trx.updateTable('project_equipment_maintenance').set({ status, completed_at: new Date(), completed_by: actor.userId,
    downtime_hours: d.downtime_hours ?? (m!.started_at ? Math.round((Date.now() - new Date(m!.started_at).getTime()) / 36e5 * 10) / 10 : null),
    cost: d.cost ?? null, meter_at_service: d.meter_at_service ?? null, updated_at: new Date() })
    .where('tenant_id', '=', actor.tenantId).where('id', '=', maintenanceId).returningAll().executeTakeFirstOrThrow();
  const stillOut = await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', actor.tenantId).where('resource_id', '=', asset.id).where('status', '=', 'ISSUED').executeTakeFirst();
  const set: Record<string, any> = { updated_at: new Date() };
  if (m!.status === 'IN_PROGRESS' || asset.status === 'MAINTENANCE') set.status = stillOut ? 'ALLOCATED' : 'AVAILABLE';
  if (!d.cancel && d.condition) set.condition = d.condition;
  else if (!d.cancel && asset.condition === 'DAMAGED') set.condition = 'GOOD';
  if (!d.cancel && m!.kind === 'SERVICE') {
    if (asset.service_interval_days) set.next_service_due = addDays(today(), asset.service_interval_days);
    const meter = d.meter_at_service ?? num(asset.meter_reading);
    if (asset.service_interval_meter && meter != null) set.next_service_meter = meter + Number(asset.service_interval_meter);
  }
  if (d.meter_at_service != null) { set.meter_reading = d.meter_at_service; set.meter_read_at = new Date(); }
  await trx.updateTable('project_resources').set(set).where('tenant_id', '=', actor.tenantId).where('id', '=', asset.id).execute();
  await logEvent(trx, actor, { resourceId: asset.id, type: d.cancel ? 'MAINTENANCE_CANCELLED' : 'MAINTENANCE_COMPLETED', details: { kind: m!.kind, maintenance_id: maintenanceId, downtime_hours: row.downtime_hours } });
  return { ...row, cost: powers.seeCost ? num(row.cost) : undefined };
}

// ── Due list, utilisation, reminders ─────────────────────────────────────────

export async function dueSummary(trx: Trx, actor: EquipmentActor) {
  const powers = await equipmentPowers(trx, actor);
  const t = today(); const soon = addDays(t, 30);
  const assets = await trx.selectFrom('project_resources as res')
    .leftJoin('users as cu', j => j.onRef('cu.id', '=', 'res.custodian_id').on('cu.tenant_id', '=', actor.tenantId))
    .select(['res.id', 'res.code', 'res.name', 'res.resource_type', 'res.next_inspection_due', 'res.next_service_due', 'res.next_service_meter', 'res.meter_reading', 'res.meter_unit', 'res.custodian_id', 'cu.name as custodian_name'])
    .where('res.tenant_id', '=', actor.tenantId).where('res.status', '!=', 'DECOMMISSIONED').where('res.resource_type', '!=', 'PERSONNEL')
    .where(eb => eb.or([eb('res.next_inspection_due', '<=', soon), eb('res.next_service_due', '<=', soon), sql<boolean>`(res.next_service_meter is not null and res.meter_reading >= res.next_service_meter)`]))
    .execute();
  const certs = await trx.selectFrom('project_equipment_certificates as c')
    .innerJoin('project_resources as res', j => j.onRef('res.id', '=', 'c.resource_id').on('res.tenant_id', '=', actor.tenantId))
    .select(['c.id', 'c.resource_id', 'c.certificate_type', 'c.expires_on', 'c.blocks_assignment', 'res.code', 'res.name'])
    .where('c.tenant_id', '=', actor.tenantId).where('res.status', '!=', 'DECOMMISSIONED').where('c.expires_on', '<=', soon).orderBy('c.expires_on').execute();
  const overdue = await listAllocations(trx, actor, { view: 'overdue', pageSize: 200 });
  const requests = await listAllocations(trx, actor, { view: 'requests', pageSize: 200 });
  return {
    inspections: assets.filter(a => a.next_inspection_due && a.next_inspection_due <= soon).map(a => ({ ...a, due: a.next_inspection_due, overdue: a.next_inspection_due! < t })).sort((a, b) => a.due!.localeCompare(b.due!)),
    services: assets.filter(a => (a.next_service_due && a.next_service_due <= soon) || (a.next_service_meter != null && a.meter_reading != null && Number(a.meter_reading) >= Number(a.next_service_meter)))
      .map(a => ({ ...a, due: a.next_service_due, overdue: (a.next_service_due ? a.next_service_due < t : false) || (a.next_service_meter != null && Number(a.meter_reading) >= Number(a.next_service_meter)) })),
    certificates: certs.map(c => ({ ...c, overdue: c.expires_on! < t })),
    overdue_returns: overdue.data, requests: requests.data, powers,
  };
}

export async function utilisation(trx: Trx, actor: EquipmentActor, from: string, to: string) {
  if (to < from) fail('End date must be on or after start date', 400);
  const powers = await equipmentPowers(trx, actor);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  if (days > 366) fail('Pick a window of a year or less', 400);
  const rows = await trx.selectFrom('project_resources as res')
    .select(['res.id', 'res.code', 'res.name', 'res.resource_type', 'res.ownership', 'res.cost_rate', 'res.rate_unit', 'res.currency',
      sql<number>`coalesce((select sum(least(a.end_date, ${to}::date) - greatest(a.start_date, ${from}::date) + 1)
        from project_resource_allocations a where a.tenant_id = res.tenant_id and a.resource_id = res.id
        and a.status in ('ISSUED','COMPLETED') and a.start_date <= ${to}::date and a.end_date >= ${from}::date), 0)::int`.as('used_days'),
      sql<number>`coalesce((select sum(m.downtime_hours) from project_equipment_maintenance m where m.tenant_id = res.tenant_id and m.resource_id = res.id
        and m.status = 'COMPLETED' and m.completed_at::date between ${from}::date and ${to}::date), 0)::float`.as('downtime_hours'),
      sql<number>`coalesce((select sum(m.cost) from project_equipment_maintenance m where m.tenant_id = res.tenant_id and m.resource_id = res.id
        and m.status = 'COMPLETED' and m.completed_at::date between ${from}::date and ${to}::date), 0)::float`.as('maintenance_cost')])
    .where('res.tenant_id', '=', actor.tenantId).where('res.status', '!=', 'DECOMMISSIONED').where('res.resource_type', '!=', 'PERSONNEL')
    .orderBy('res.name').execute();
  return {
    from, to, days, powers,
    data: rows.map(r => {
      const used = Math.min(days, Number(r.used_days));
      const out: Record<string, any> = { id: r.id, code: r.code, name: r.name, resource_type: r.resource_type.toLowerCase(), ownership: r.ownership,
        used_days: used, utilisation_pct: Math.round(used / days * 1000) / 10, downtime_hours: Number(r.downtime_hours) };
      // Hire cost is only derivable for day rates; other units would need logged hours.
      if (powers.seeCost) { out.currency = r.currency; out.maintenance_cost = Number(r.maintenance_cost); out.hire_cost = r.rate_unit === 'DAY' ? used * Number(r.cost_rate) : null; }
      return out;
    }),
  };
}

/** Daily: tell custodians (or tenant admins) about certificates and inspections running out, and late returns. */
export async function sendEquipmentReminders(trx: Trx, tenantId: string) {
  const t = today(); const soon = addDays(t, 14);
  const items = await sql<{ resource_id: string; code: string; name: string; custodian_id: string | null; kind: string; due: string }>`
    select r.id as resource_id, r.code, r.name, r.custodian_id, 'certificate:' || c.certificate_type as kind, c.expires_on::text as due
      from project_equipment_certificates c join project_resources r on r.id = c.resource_id and r.tenant_id = c.tenant_id
     where c.tenant_id = ${tenantId} and r.status <> 'DECOMMISSIONED' and c.expires_on <= ${soon}::date and c.expires_on >= ${t}::date - 1
    union all
    select r.id, r.code, r.name, r.custodian_id, 'inspection', r.next_inspection_due::text
      from project_resources r where r.tenant_id = ${tenantId} and r.status <> 'DECOMMISSIONED' and r.next_inspection_due <= ${soon}::date and r.next_inspection_due >= ${t}::date - 1
    union all
    select r.id, r.code, r.name, r.custodian_id, 'return', a.end_date::text
      from project_resource_allocations a join project_resources r on r.id = a.resource_id and r.tenant_id = a.tenant_id
     where a.tenant_id = ${tenantId} and a.status = 'ISSUED' and a.end_date = ${t}::date - 1`.execute(trx);
  if (!items.rows.length) return 0;
  const admins = (await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('active', '=', true).where('role', 'in', ['TENANT_ADMIN', 'ADMIN'] as any).limit(10).execute()).map(u => u.id);
  let sent = 0;
  for (const it of items.rows) {
    const entityId = it.resource_id;
    const entityLabel = `${it.kind}:${it.due}`;
    for (const userId of it.custodian_id ? [it.custodian_id] : admins) {
      // One reminder per asset, subject and due date — the job runs daily.
      const already = await trx.selectFrom('notifications').select('id').where('tenant_id', '=', tenantId).where('user_id', '=', userId)
        .where('entity_type', '=', 'project_resource_reminder').where('entity_id', '=', entityId).where('entity_label', '=', entityLabel).executeTakeFirst();
      if (already) continue;
      const what = it.kind === 'return' ? `was due back on ${it.due}` : it.kind === 'inspection' ? `inspection is due on ${it.due}` : `${it.kind.slice(12)} expires on ${it.due}`;
      await NotificationService.createNotificationInTrx(trx, { tenantId, userId, app: 'projects', type: 'warning', title: `${it.code} ${it.name}`,
        message: `${it.name} ${what}.`, link: `/projects/equipment/${it.resource_id}`, entityType: 'project_resource_reminder', entityId, entityLabel });
      sent++;
    }
  }
  return sent;
}
