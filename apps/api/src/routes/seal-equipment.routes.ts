import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// Warehouse equipment/tools maintenance tracking — forklifts, scanners,
// racking hardware, reefer/HVAC plant. Deliberately distinct from Tracking/
// Fleet's `vehicles` and its unrelated `warehouse_locations`/`parts_stock`
// (spare-parts-for-trucks system, no relation to bonded-warehouse assets).
// "Due for service" / "overdue" is computed here from next_service_due_date,
// never stored as a separate flag that could drift stale.

const DUE_SOON_DAYS = 14;

function mapEquipment(row: any) {
  const now = Date.now();
  const dueDate = row.next_service_due_date ? new Date(row.next_service_due_date).getTime() : null;
  const daysUntilDue = dueDate != null ? Math.ceil((dueDate - now) / 86400000) : null;
  return {
    id: row.id, compartmentId: row.compartment_id, equipmentType: row.equipment_type,
    assetTag: row.asset_tag, name: row.name, status: row.status, condition: row.condition,
    lastServiceDate: row.last_service_date, nextServiceDueDate: row.next_service_due_date,
    notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
    compartmentName: row.compartment_name ?? undefined,
    daysUntilServiceDue: daysUntilDue,
    alert: row.status === 'out_of_service'
      ? 'out_of_service'
      : daysUntilDue != null && daysUntilDue < 0
        ? 'overdue'
        : daysUntilDue != null && daysUntilDue <= DUE_SOON_DAYS
          ? 'due_soon'
          : null,
  };
}

function mapMaintenanceRecord(row: any) {
  return {
    id: row.id, equipmentId: row.equipment_id, maintenanceType: row.maintenance_type,
    performedAt: row.performed_at, performedBy: row.performed_by, description: row.description,
    cost: row.cost != null ? Number(row.cost) : null, nextDueDate: row.next_due_date, createdAt: row.created_at,
  };
}

export async function sealEquipmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  fastify.get('/equipment', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_equipment')
          .leftJoin('seal_compartments', 'seal_compartments.id', 'seal_equipment.compartment_id')
          .select([
            'seal_equipment.id', 'seal_equipment.compartment_id', 'seal_equipment.equipment_type',
            'seal_equipment.asset_tag', 'seal_equipment.name', 'seal_equipment.status', 'seal_equipment.condition',
            'seal_equipment.last_service_date', 'seal_equipment.next_service_due_date', 'seal_equipment.notes',
            'seal_equipment.created_at', 'seal_equipment.updated_at', 'seal_compartments.name as compartment_name',
          ])
          .where('seal_equipment.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_equipment.next_service_due_date', 'asc');
        if (compartment_id) q = q.where('seal_equipment.compartment_id', '=', compartment_id);
        return q.execute();
      });
      return rows.map(mapEquipment);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/equipment', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.equipmentType || !b.assetTag?.trim() || !b.name?.trim()) {
        return reply.status(400).send({ error: 'compartmentId, equipmentType, assetTag and name are required' });
      }
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_equipment').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId,
          equipment_type: b.equipmentType,
          asset_tag: b.assetTag.trim(),
          name: b.name.trim(),
          status: b.status ?? 'operational',
          condition: b.condition ?? 'good',
          last_service_date: b.lastServiceDate ? new Date(b.lastServiceDate) : null,
          next_service_due_date: b.nextServiceDueDate ? new Date(b.nextServiceDueDate) : null,
          notes: b.notes ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapEquipment(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/equipment/:id', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const patch: any = { updated_at: new Date() };
      if (b.status !== undefined) patch.status = b.status;
      if (b.condition !== undefined) patch.condition = b.condition;
      if (b.lastServiceDate !== undefined) patch.last_service_date = b.lastServiceDate ? new Date(b.lastServiceDate) : null;
      if (b.nextServiceDueDate !== undefined) patch.next_service_due_date = b.nextServiceDueDate ? new Date(b.nextServiceDueDate) : null;
      if (b.notes !== undefined) patch.notes = b.notes;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_equipment').set(patch).where('id', '=', request.params.id)
          .where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow()
      );
      return mapEquipment(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Maintenance history ──────────────────────────────────────────────
  fastify.get('/equipment/:id/maintenance', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_equipment_maintenance_records').selectAll()
          .where('equipment_id', '=', request.params.id).orderBy('performed_at', 'desc').execute()
      );
      return rows.map(mapMaintenanceRecord);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Logs a maintenance event and, in the same transaction, updates the
  // equipment's own last/next-service watermarks and condition — the record
  // is the source of truth; the parent row's fields are a cached projection
  // of "the latest one," same relationship seal_lots.storage_billed_through
  // has to its own invoice history.
  fastify.post('/equipment/:id/maintenance', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.maintenanceType) return reply.status(400).send({ error: 'maintenanceType is required' });
      const result = await withTenant(request.user.tenant_id, async trx => {
        const record = await trx.insertInto('seal_equipment_maintenance_records').values({
          tenant_id: request.user.tenant_id,
          equipment_id: request.params.id,
          maintenance_type: b.maintenanceType,
          performed_at: b.performedAt ? new Date(b.performedAt) : new Date(),
          performed_by: b.performedBy ?? null,
          description: b.description ?? null,
          cost: b.cost != null ? String(b.cost) : null,
          next_due_date: b.nextDueDate ? new Date(b.nextDueDate) : null,
        }).returningAll().executeTakeFirstOrThrow();

        const patch: any = {
          last_service_date: record.performed_at, updated_at: new Date(),
        };
        if (b.nextDueDate !== undefined) patch.next_service_due_date = b.nextDueDate ? new Date(b.nextDueDate) : null;
        if (b.condition !== undefined) patch.condition = b.condition;
        if (b.resultingStatus !== undefined) patch.status = b.resultingStatus;
        const equipment = await trx.updateTable('seal_equipment').set(patch)
          .where('id', '=', request.params.id).where('tenant_id', '=', request.user.tenant_id).returningAll().executeTakeFirstOrThrow();

        return { record, equipment };
      });
      return { record: mapMaintenanceRecord(result.record), equipment: mapEquipment(result.equipment) };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
