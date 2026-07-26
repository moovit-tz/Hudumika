import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// Reefer monitoring + yard slotting (spec, deferred from Increment 2).
// Dangerous-goods segregation itself lives in seal.service.ts
// (checkDgSegregation, called from receiveLot/recordMovement) since it has
// to run inside the same transaction as the lot placement it's guarding —
// this file only exposes the reefer log and the yard-slot directory/assignment.

const REEFER_TOLERANCE_C = 2; // ± setpoint, a simple fixed band rather than a per-commodity table

export async function sealWarehouseOpsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  // ── Reefer readings ──────────────────────────────────────────────────
  fastify.get('/lots/:id/reefer-readings', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_reefer_readings').selectAll()
          .where('lot_id', '=', request.params.id).orderBy('recorded_at', 'desc').execute()
      );
      return rows.map(r => ({
        id: r.id, lotId: r.lot_id, recordedAt: r.recorded_at, temperatureC: Number(r.temperature_c),
        withinRange: r.within_range, note: r.note,
      }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/lots/:id/reefer-readings', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (b.temperatureC == null) return reply.status(400).send({ error: 'temperatureC is required' });
      const lot = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_lots').select(['id', 'reefer_setpoint_c']).where('id', '=', request.params.id).executeTakeFirst()
      );
      if (!lot) return reply.status(404).send({ error: 'Lot not found' });
      const setpoint = lot.reefer_setpoint_c != null ? Number(lot.reefer_setpoint_c) : null;
      const withinRange = setpoint == null ? true : Math.abs(Number(b.temperatureC) - setpoint) <= REEFER_TOLERANCE_C;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_reefer_readings').values({
          tenant_id: request.user.tenant_id, lot_id: request.params.id,
          temperature_c: String(b.temperatureC), within_range: withinRange,
          recorded_by: request.user.sub, note: b.note ?? null,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return { id: row.id, lotId: row.lot_id, recordedAt: row.recorded_at, temperatureC: Number(row.temperature_c), withinRange: row.within_range, note: row.note };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Yard slots ────────────────────────────────────────────────────────
  fastify.get('/yard-slots', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      const rows = await withTenant(request.user.tenant_id, trx => {
        let q = trx.selectFrom('seal_yard_slots')
          .leftJoin('seal_containers', 'seal_containers.yard_slot_id', 'seal_yard_slots.id')
          .select(({ fn }) => [
            'seal_yard_slots.id', 'seal_yard_slots.compartment_id', 'seal_yard_slots.code',
            'seal_yard_slots.capacity_teu', 'seal_yard_slots.active',
            fn.count<number>('seal_containers.id').as('occupied_count'),
          ])
          .where('seal_yard_slots.active', '=', true)
          .groupBy(['seal_yard_slots.id']);
        if (compartment_id) q = q.where('seal_yard_slots.compartment_id', '=', compartment_id);
        return q.orderBy('seal_yard_slots.code').execute();
      });
      return rows.map(r => ({
        id: r.id, compartmentId: r.compartment_id, code: r.code, capacityTeu: r.capacity_teu,
        active: r.active, occupiedCount: Number(r.occupied_count),
      }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/yard-slots', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.code) return reply.status(400).send({ error: 'compartmentId and code are required' });
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_yard_slots').values({
          tenant_id: request.user.tenant_id, compartment_id: b.compartmentId,
          code: b.code, capacity_teu: b.capacityTeu ?? 1,
        }).returningAll().executeTakeFirstOrThrow()
      );
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/containers/:id/yard-slot', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_containers').set({ yard_slot_id: b.yardSlotId ?? null })
          .where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── HuduFreight (Tracking app) vehicle link ─────────────────────────────
  // Minimal, read-only pick list against the shared `vehicles` table —
  // deliberately not a proxy to Tracking's own GET /v1/tracking/vehicles
  // (which requires the separate 'tracking' entitlement); this is SEAL's
  // own gate-in/dispatch context reading the same underlying fleet data.
  fastify.get('/vehicles-for-assignment', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('vehicles').select(['id', 'name', 'plate_number', 'driver_name', 'status'])
          .where('status', '=', 'ACTIVE').orderBy('name').execute()
      );
      return rows.map(r => ({ id: r.id, name: r.name, plateNumber: r.plate_number, driverName: r.driver_name, status: r.status }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/containers/:id/vehicle', async (request: any, reply) => {
    try {
      const b = request.body as any;
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.updateTable('seal_containers').set({ vehicle_id: b.vehicleId ?? null })
          .where('id', '=', request.params.id).returningAll().executeTakeFirstOrThrow()
      );
      return row;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
