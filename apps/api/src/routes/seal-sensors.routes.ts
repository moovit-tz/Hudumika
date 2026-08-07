import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

// Zone-occupancy sensor/camera registry + ingestion — mirrors
// POST /v1/tracking/positions/ingest's exact pattern (device_id ->
// tenant-scoped lookup -> insert reading -> websocket broadcast), just for
// a fixed warehouse sensor instead of a moving vehicle. This is a real,
// independently-testable contract: no physical sensor is wired up yet, but
// the endpoint, storage, and broadcast are all real — the same honesty
// standard as the manual customs adapter and GPSWOX integrations already
// in this codebase. No fabricated occupancy numbers are ever synthesized
// here; if no device has reported, the zone simply has no reading.

function mapDevice(row: any) {
  return {
    id: row.id, compartmentId: row.compartment_id, zoneId: row.zone_id, locationId: row.location_id,
    deviceId: row.device_id, deviceType: row.device_type, name: row.name, active: row.active,
    createdAt: row.created_at,
    zoneName: row.zone_name ?? undefined,
    latestReading: row.latest_value != null ? { value: Number(row.latest_value), type: row.latest_type, recordedAt: row.latest_recorded_at } : null,
  };
}

export async function sealSensorsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('seal'));

  fastify.get('/sensors', async (request: any, reply) => {
    try {
      const { compartment_id } = request.query as { compartment_id?: string };
      const rows = await withTenant(request.user.tenant_id, async trx => {
        let q = trx.selectFrom('seal_sensor_devices')
          .leftJoin('seal_zones', 'seal_zones.id', 'seal_sensor_devices.zone_id')
          .select([
            'seal_sensor_devices.id', 'seal_sensor_devices.compartment_id', 'seal_sensor_devices.zone_id',
            'seal_sensor_devices.location_id', 'seal_sensor_devices.device_id', 'seal_sensor_devices.device_type',
            'seal_sensor_devices.name', 'seal_sensor_devices.active', 'seal_sensor_devices.created_at',
            'seal_zones.name as zone_name',
          ])
          .where('seal_sensor_devices.tenant_id', '=', request.user.tenant_id)
          .orderBy('seal_sensor_devices.name');
        if (compartment_id) q = q.where('seal_sensor_devices.compartment_id', '=', compartment_id);
        const devices = await q.execute();

        const deviceIds = devices.map(d => d.id);
        if (deviceIds.length === 0) return devices.map(d => ({ ...d, latest_value: null, latest_type: null, latest_recorded_at: null }));

        // Latest reading per device — a real DISTINCT ON over the readings
        // ledger, same technique the vehicle-position "current location"
        // view already uses, not a separately maintained "current state" row.
        const latest = await trx.selectFrom('seal_sensor_readings')
          .distinctOn('device_id')
          .select(['device_id', 'value', 'reading_type', 'recorded_at'])
          .where('device_id', 'in', deviceIds)
          .orderBy('device_id').orderBy('recorded_at', 'desc')
          .execute();
        const latestByDevice = new Map(latest.map(l => [l.device_id, l]));

        return devices.map(d => {
          const l = latestByDevice.get(d.id);
          return { ...d, latest_value: l?.value ?? null, latest_type: l?.reading_type ?? null, latest_recorded_at: l?.recorded_at ?? null };
        });
      });
      return rows.map(mapDevice);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/sensors', async (request: any, reply) => {
    try {
      const b = request.body as any;
      if (!b.compartmentId || !b.deviceId?.trim() || !b.deviceType || !b.name?.trim()) {
        return reply.status(400).send({ error: 'compartmentId, deviceId, deviceType and name are required' });
      }
      const row = await withTenant(request.user.tenant_id, trx =>
        trx.insertInto('seal_sensor_devices').values({
          tenant_id: request.user.tenant_id,
          compartment_id: b.compartmentId,
          zone_id: b.zoneId ?? null,
          location_id: b.locationId ?? null,
          device_id: b.deviceId.trim(),
          device_type: b.deviceType,
          name: b.name.trim(),
        }).returningAll().executeTakeFirstOrThrow()
      );
      return mapDevice(row);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/sensors/:id/readings', async (request: any, reply) => {
    try {
      const rows = await withTenant(request.user.tenant_id, trx =>
        trx.selectFrom('seal_sensor_readings').selectAll()
          .where('device_id', '=', request.params.id).orderBy('recorded_at', 'desc').limit(100).execute()
      );
      return rows.map(r => ({ id: r.id, readingType: r.reading_type, value: Number(r.value), recordedAt: r.recorded_at }));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Ingestion (sensor/camera POSTs here) ──────────────────────────────
  // Authenticated the same way as /positions/ingest — a valid tenant session
  // token, with the specific device identified by device_id rather than a
  // separate device-auth scheme.
  fastify.post('/sensors/ingest', async (request: any, reply) => {
    try {
      const b = request.body as { device_id: string; reading_type: string; value: number; recorded_at?: string };
      if (!b.device_id || !b.reading_type || typeof b.value !== 'number') {
        return reply.status(400).send({ error: 'device_id, reading_type and value are required' });
      }
      const result = await withTenant(request.user.tenant_id, async trx => {
        const device = await trx.selectFrom('seal_sensor_devices').selectAll()
          .where('device_id', '=', b.device_id).where('tenant_id', '=', request.user.tenant_id)
          .executeTakeFirst();
        if (!device) return null;

        const recordedAt = b.recorded_at ? new Date(b.recorded_at) : new Date();
        const reading = await trx.insertInto('seal_sensor_readings').values({
          tenant_id: request.user.tenant_id, device_id: device.id,
          reading_type: b.reading_type, value: String(b.value), recorded_at: recordedAt,
        }).returningAll().executeTakeFirstOrThrow();
        return { device, reading };
      });
      if (!result) return reply.status(404).send({ error: 'Unknown device_id for this tenant' });

      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(JSON.stringify({
          type: 'seal.sensor_reading', deviceId: result.device.id, compartmentId: result.device.compartment_id,
          readingType: b.reading_type, value: b.value,
        }));
      });

      return { ok: true, device_id: result.device.id };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
