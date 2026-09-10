import { type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import type {
  ProjectResource,
  ProjectResourceAllocation,
  ProjectResourceType,
  ProjectResourceStatus,
} from '@hudumika/types';

export class ProjectResourcesService {
  // ─── Resources & Heavy Fleet Inventory ────────────────────────────

  static async listResources(trx: Transaction<Database>, tenantId: string, resourceType?: ProjectResourceType) {
    let query = trx
      .selectFrom('project_resources')
      .leftJoin('users', 'users.id', 'project_resources.user_id')
      .where('project_resources.tenant_id', '=', tenantId);

    if (resourceType) {
      query = query.where('project_resources.resource_type', '=', resourceType);
    }

    return await query
      .select([
        'project_resources.id',
        'project_resources.tenant_id',
        'project_resources.resource_type',
        'project_resources.name',
        'project_resources.code',
        'project_resources.make_model',
        'project_resources.serial_number',
        'project_resources.license_plate',
        'project_resources.capacity_rating',
        'project_resources.user_id',
        'project_resources.cost_rate_hourly',
        'project_resources.cost_rate_daily',
        'project_resources.currency',
        'project_resources.telemetry_id',
        'project_resources.last_maintenance_date',
        'project_resources.next_maintenance_date',
        'project_resources.status',
        'project_resources.location',
        'project_resources.metadata',
        'project_resources.created_at',
        'project_resources.updated_at',
        'users.name as user_name',
      ])
      .orderBy('project_resources.name', 'asc')
      .execute();
  }

  static async createResource(trx: Transaction<Database>, tenantId: string, data: {
    resource_type: ProjectResourceType;
    name: string;
    code?: string | null;
    make_model?: string | null;
    serial_number?: string | null;
    license_plate?: string | null;
    capacity_rating?: string | null;
    user_id?: string | null;
    cost_rate_hourly?: number;
    cost_rate_daily?: number;
    currency?: string;
    telemetry_id?: string | null;
    last_maintenance_date?: string | null;
    next_maintenance_date?: string | null;
    status?: ProjectResourceStatus;
    location?: string | null;
  }) {
    return await trx
      .insertInto('project_resources')
      .values({
        tenant_id: tenantId,
        resource_type: data.resource_type,
        name: data.name,
        code: data.code ?? null,
        make_model: data.make_model ?? null,
        serial_number: data.serial_number ?? null,
        license_plate: data.license_plate ?? null,
        capacity_rating: data.capacity_rating ?? null,
        user_id: data.user_id ?? null,
        cost_rate_hourly: data.cost_rate_hourly ?? 0,
        cost_rate_daily: data.cost_rate_daily ?? 0,
        currency: data.currency ?? 'USD',
        telemetry_id: data.telemetry_id ?? null,
        last_maintenance_date: data.last_maintenance_date ?? null,
        next_maintenance_date: data.next_maintenance_date ?? null,
        status: data.status ?? 'available',
        location: data.location ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // ─── Allocations ──────────────────────────────────────────────────

  static async listAllocations(trx: Transaction<Database>, tenantId: string, projectId: string) {
    return await trx
      .selectFrom('project_resource_allocations')
      .leftJoin('project_resources', 'project_resources.id', 'project_resource_allocations.resource_id')
      .leftJoin('project_work_packages', 'project_work_packages.id', 'project_resource_allocations.work_package_id')
      .leftJoin('users as op', 'op.id', 'project_resource_allocations.operator_id')
      .where('project_resource_allocations.tenant_id', '=', tenantId)
      .where('project_resource_allocations.project_id', '=', projectId)
      .select([
        'project_resource_allocations.id',
        'project_resource_allocations.tenant_id',
        'project_resource_allocations.project_id',
        'project_resource_allocations.work_package_id',
        'project_resource_allocations.resource_id',
        'project_resource_allocations.start_date',
        'project_resource_allocations.end_date',
        'project_resource_allocations.allocated_pct',
        'project_resource_allocations.hours_planned',
        'project_resource_allocations.hours_actual',
        'project_resource_allocations.operator_id',
        'project_resource_allocations.notes',
        'project_resource_allocations.created_at',
        'project_resource_allocations.updated_at',
        'project_resources.name as resource_name',
        'project_resources.resource_type',
        'project_resources.make_model',
        'project_resources.cost_rate_hourly',
        'project_work_packages.name as work_package_name',
        'op.name as operator_name',
      ])
      .orderBy('project_resource_allocations.start_date', 'asc')
      .execute();
  }

  static async createAllocation(trx: Transaction<Database>, tenantId: string, projectId: string, data: {
    work_package_id?: string | null;
    resource_id: string;
    start_date: string;
    end_date: string;
    allocated_pct?: number;
    hours_planned?: number;
    operator_id?: string | null;
    notes?: string | null;
  }) {
    const alloc = await trx
      .insertInto('project_resource_allocations')
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        work_package_id: data.work_package_id ?? null,
        resource_id: data.resource_id,
        start_date: data.start_date,
        end_date: data.end_date,
        allocated_pct: data.allocated_pct ?? 100,
        hours_planned: data.hours_planned ?? 40,
        hours_actual: 0,
        operator_id: data.operator_id ?? null,
        notes: data.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update resource status to allocated
    await trx
      .updateTable('project_resources')
      .set({ status: 'allocated', updated_at: new Date() })
      .where('id', '=', data.resource_id)
      .where('tenant_id', '=', tenantId)
      .execute();

    return alloc;
  }
}
