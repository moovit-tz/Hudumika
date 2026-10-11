import { randomUUID } from 'node:crypto';
import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type { ProjectResourceType, ProjectResourceStatus } from '@hudumika/types';

const fail = (message: string, statusCode: number) => { throw Object.assign(new Error(message), { statusCode }); };
const dateOnly = (date: string | Date) => date instanceof Date ? date.toISOString().slice(0, 10) : date.slice(0, 10);

export class ProjectResourcesService {
  static resourceResponse(row: any) {
    const metadata = row.metadata ?? {};
    return { ...row, resource_type: row.resource_type.toLowerCase(), status: row.status.toLowerCase(),
      make_model: row.model_or_specs, cost_rate: Number(row.cost_rate), billing_rate: Number(row.billing_rate),
      cost_rate_hourly: metadata.cost_rate_hourly ?? (row.rate_unit === 'HOUR' ? Number(row.cost_rate) : 0),
      cost_rate_daily: metadata.cost_rate_daily ?? (row.rate_unit === 'DAY' ? Number(row.cost_rate) : 0),
      ...Object.fromEntries(['capacity_rating', 'user_id', 'license_plate', 'telemetry_id', 'last_maintenance_date', 'next_maintenance_date', 'location'].map(key => [key, metadata[key] ?? null])) };
  }

  static async listResources(trx: Transaction<Database>, tenantId: string, resourceType?: ProjectResourceType) {
    let query = trx.selectFrom('project_resources').where('tenant_id', '=', tenantId);
    if (resourceType) query = query.where('resource_type', '=', resourceType.toUpperCase());
    return (await query.selectAll().orderBy('name', 'asc').execute()).map(this.resourceResponse);
  }

  static async createResource(trx: Transaction<Database>, tenantId: string, data: {
    resource_type: ProjectResourceType; name: string; code?: string | null; make_model?: string | null;
    serial_number?: string | null; license_plate?: string | null; capacity_rating?: string | null;
    user_id?: string | null; cost_rate_hourly?: number; cost_rate_daily?: number; currency?: string;
    telemetry_id?: string | null; last_maintenance_date?: string | null; next_maintenance_date?: string | null;
    status?: ProjectResourceStatus; location?: string | null;
  }) {
    await trx.selectFrom('tenants').select('id').where('id', '=', tenantId).forUpdate().executeTakeFirstOrThrow();
    if (data.user_id && !await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', data.user_id).executeTakeFirst()) fail('Resource person not found', 404);
    const code = data.code?.trim() || `RES-${randomUUID()}`;
    if (await trx.selectFrom('project_resources').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst()) fail('Resource code already exists', 409);
    const { name, resource_type, code: unusedCode, make_model, serial_number, currency, status, ...metadata } = data;
    const rateUnit = data.cost_rate_hourly !== undefined ? 'HOUR' : 'DAY';
    const row = await trx.insertInto('project_resources').values({ tenant_id: tenantId, name, code,
      category: null, owner_vendor_id: null, resource_type: resource_type.toUpperCase(), model_or_specs: make_model ?? null, serial_number: serial_number ?? null,
      cost_rate: rateUnit === 'HOUR' ? data.cost_rate_hourly ?? 0 : data.cost_rate_daily ?? 0,
      rate_unit: rateUnit, currency: currency ?? 'TZS', status: (status ?? 'available').toUpperCase(), metadata,
    }).returningAll().executeTakeFirstOrThrow();
    return this.resourceResponse(row);
  }

  static allocationResponse(row: any) {
    return { ...row, start_date: dateOnly(row.start_date), end_date: dateOnly(row.end_date),
      allocated_pct: Number(row.allocation_pct), allocated_cost: Number(row.allocated_cost),
      work_package_id: row.metadata?.work_package_id ?? null, hours_planned: row.metadata?.hours_planned ?? 0,
      hours_actual: row.metadata?.hours_actual ?? 0, operator_id: row.metadata?.operator_id ?? null,
      notes: row.metadata?.notes ?? null, resource_type: row.resource_type?.toLowerCase() };
  }

  static async updateResource(trx: Transaction<Database>, tenantId: string, id: string, data: {
    name?: string; make_model?: string | null; capacity_rating?: string | null;
    cost_rate_hourly?: number; cost_rate_daily?: number; status?: ProjectResourceStatus;
  }) {
    const existing = await trx.selectFrom('project_resources').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
    if (!existing) return fail('Resource not found', 404);
    if (data.status && ['maintenance', 'decommissioned'].includes(data.status)) {
      const active = await trx.selectFrom('project_resource_allocations').select('id').where('tenant_id', '=', tenantId).where('resource_id', '=', id).where('status', 'in', ['REQUESTED', 'CONFIRMED']).where('end_date', '>=', new Date().toISOString().slice(0, 10)).executeTakeFirst();
      if (active) fail('Release current and future allocations before making this asset unavailable', 409);
    }
    const metadata = { ...existing.metadata };
    for (const key of ['capacity_rating', 'cost_rate_hourly', 'cost_rate_daily'] as const) if (data[key] !== undefined) metadata[key] = data[key];
    const row = await trx.updateTable('project_resources').set({
      name: data.name ?? existing.name, model_or_specs: data.make_model !== undefined ? data.make_model : existing.model_or_specs,
      status: data.status?.toUpperCase() ?? existing.status, metadata,
      cost_rate: existing.rate_unit === 'HOUR' ? data.cost_rate_hourly ?? existing.cost_rate : data.cost_rate_daily ?? existing.cost_rate,
      updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    return this.resourceResponse(row);
  }

  static async releaseAllocation(trx: Transaction<Database>, tenantId: string, projectId: string, id: string) {
    const allocation = await trx.selectFrom('project_resource_allocations').selectAll().where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', id).executeTakeFirst();
    if (!allocation) return fail('Allocation not found', 404);
    await trx.selectFrom('project_resources').select('id').where('tenant_id', '=', tenantId).where('id', '=', allocation.resource_id).forUpdate().executeTakeFirstOrThrow();
    const row = await trx.updateTable('project_resource_allocations').set({ status: 'RELEASED', updated_at: new Date() }).where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    return this.allocationResponse(row);
  }

  static async listAllocations(trx: Transaction<Database>, tenantId: string, projectId: string) {
    const rows = await trx.selectFrom('project_resource_allocations as al')
      .leftJoin('project_resources as res', join => join.onRef('res.id', '=', 'al.resource_id').on('res.tenant_id', '=', tenantId))
      .where('al.tenant_id', '=', tenantId).where('al.project_id', '=', projectId)
      .selectAll('al').select(['res.name as resource_name', 'res.resource_type', 'res.currency'])
      .orderBy('al.start_date', 'asc').execute();
    return rows.map(this.allocationResponse);
  }

  static async createAllocation(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    work_package_id?: string | null; resource_id: string; start_date: string; end_date: string;
    allocated_pct?: number; hours_planned?: number; operator_id?: string | null; notes?: string | null;
  }) {
    if (data.end_date < data.start_date) fail('End date must be on or after start date', 400);
    if (!await trx.selectFrom('projects').select('id').where('tenant_id', '=', tenantId).where('id', '=', projectId).executeTakeFirst()) fail('Project not found', 404);
    const resource = await trx.selectFrom('project_resources').selectAll().where('tenant_id', '=', tenantId).where('id', '=', data.resource_id).forUpdate().executeTakeFirst();
    if (!resource) return fail('Resource not found', 404);
    if (!['AVAILABLE', 'ALLOCATED'].includes(resource.status)) fail('Resource is unavailable for allocation', 409);
    if (data.work_package_id && !await trx.selectFrom('project_work_packages').select('id').where('tenant_id', '=', tenantId).where('project_id', '=', projectId).where('id', '=', data.work_package_id).executeTakeFirst()) fail('Work package not found in this project', 404);
    if (data.operator_id && !await trx.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('id', '=', data.operator_id).executeTakeFirst()) fail('Operator not found', 404);
    const overlapping = await trx.selectFrom('project_resource_allocations').select(['start_date', 'end_date', 'allocation_pct'])
      .where('tenant_id', '=', tenantId).where('resource_id', '=', data.resource_id).where('status', 'in', ['REQUESTED', 'CONFIRMED'])
      .where('start_date', '<=', data.end_date).where('end_date', '>=', data.start_date).execute();
    // Check every capacity change within the requested inclusive window, rather than summing disjoint bookings.
    const points = new Set([data.start_date, ...overlapping.map(row => dateOnly(row.start_date)).filter(date => date >= data.start_date)]);
    for (const point of points) {
      const used = overlapping.filter(row => dateOnly(row.start_date) <= point && dateOnly(row.end_date) >= point).reduce((total, row) => total + Number(row.allocation_pct), 0);
      if (used + (data.allocated_pct ?? 100) > 100) fail('Allocation exceeds available capacity for these dates', 409);
    }
    const row = await trx.insertInto('project_resource_allocations').values({ tenant_id: tenantId, project_id: projectId,
      task_id: null, resource_id: data.resource_id, start_date: data.start_date, end_date: data.end_date,
      allocation_pct: data.allocated_pct ?? 100, status: 'CONFIRMED', metadata: {
        work_package_id: data.work_package_id ?? null, hours_planned: data.hours_planned ?? 0,
        operator_id: data.operator_id ?? null, notes: data.notes ?? null,
      } }).returningAll().executeTakeFirstOrThrow();
    return this.allocationResponse({ ...row, resource_name: resource.name, resource_type: resource.resource_type });
  }
}
