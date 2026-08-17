import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { gpswoxService } from '../services/gpswox.service.js';
import { toDateParam } from '../utils/dates.js';
import { pick } from '../lib/pick.js';

const FLEET_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR'] as const;

const vehicleFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  plate_number: z.string().max(30).optional(),
  type: z.string().max(30).optional(),
  driver_name: z.string().max(200).optional(),
  driver_phone: z.string().max(30).optional(),
  device_id: z.string().max(100),
  fuel_type: z.string().max(30).optional(),
  group_name: z.string().max(100).optional(),
  vin: z.string().max(50).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  trim: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  ownership: z.string().max(30).optional(),
  mileage_km: z.number().min(0).optional(),
  photo_url: z.string().max(1000).optional(),
  purchase_vendor: z.string().max(200).optional(),
  purchase_date: z.string().max(30).optional(),
  purchase_price: z.number().min(0).optional(),
  initial_odometer: z.number().min(0).optional(),
  financing_type: z.string().max(30).optional(),
  in_service_date: z.string().max(30).optional(),
  in_service_odometer: z.number().min(0).optional(),
  est_life_months: z.number().min(0).optional(),
  est_life_meter: z.number().min(0).optional(),
  est_resale_value: z.number().min(0).optional(),
  out_of_service_date: z.string().max(30).optional(),
  out_of_service_odometer: z.number().min(0).optional(),
  lifecycle_notes: z.string().max(2000).optional(),
  status: z.string().max(30).optional(),
});
const vehiclePatchSchema = vehicleFieldsSchema.partial();

const geofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  center_lat: z.number().min(-90).max(90),
  center_lon: z.number().min(-180).max(180),
  radius_km: z.number().positive(),
  zone_type: z.string().max(30).optional(),
});
const geofencePatchSchema = geofenceCreateSchema.partial().extend({ active: z.boolean().optional() });

// Simple in-memory cache for NHTSA vPIC lookups (apps/api/src/routes/tracking.routes.ts
// getVehicleMakes/getVehicleModels) — make/model reference data is effectively
// static, so there's no reason to hit the external API on every keystroke.
const VPIC_CACHE = new Map<string, { data: any; expiresAt: number }>();
const VPIC_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchVpicCached(url: string): Promise<any> {
  const cached = VPIC_CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`vPIC request failed: ${res.status}`);
  const data = await res.json();
  VPIC_CACHE.set(url, { data, expiresAt: Date.now() + VPIC_TTL_MS });
  return data;
}

// Postgres NUMERIC columns come back from node-postgres as strings (to avoid
// float precision loss), including through raw sql`` queries — coerce them
// to real numbers before they reach the frontend, or arithmetic like
// `.toFixed()`/`total += x` silently does string concatenation and crashes
// or corrupts downstream data. Same convention as gl.service.ts/bills.routes.ts.
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

// Haversine distance in km between two lat/lng points.
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simple radius-based geofence ENTER/EXIT check against active zones, shared by
 * every position-ingestion path (manual device POST, GPSWOX sync) so the logic
 * can't drift between them.
 */
export async function checkGeofenceTransitions(
  trx: any, tenantId: string, vehicleId: string, lat: number, lng: number
): Promise<void> {
  const zones = await trx.selectFrom('geofences').selectAll()
    .where('tenant_id', '=', tenantId).where('active', '=', true).execute();

  for (const zone of zones) {
    const inside = distanceKm(lat, lng, Number(zone.center_lat), Number(zone.center_lon)) <= Number(zone.radius_km);
    const lastEvent = await trx.selectFrom('vehicle_geofence_events').selectAll()
      .where('vehicle_id', '=', vehicleId).where('geofence_id', '=', zone.id)
      .orderBy('occurred_at', 'desc').limit(1).executeTakeFirst();
    const currentlyInside = lastEvent?.event_type === 'ENTER';

    if (inside && !currentlyInside) {
      await trx.insertInto('vehicle_geofence_events').values({
        geofence_id: zone.id, vehicle_id: vehicleId, tenant_id: tenantId,
        event_type: 'ENTER', latitude: lat, longitude: lng,
      } as any).execute();
    } else if (!inside && currentlyInside) {
      await trx.insertInto('vehicle_geofence_events').values({
        geofence_id: zone.id, vehicle_id: vehicleId, tenant_id: tenantId,
        event_type: 'EXIT', latitude: lat, longitude: lng,
      } as any).execute();
    }
  }
}

export async function trackingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('tracking'));

  // ── Dashboard ─────────────────────────────────────────────────

  fastify.get('/dashboard', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const { count: activeFleet } = await trx.selectFrom('vehicles')
        .select(trx.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirstOrThrow();

      // Mocked KPI stats for now since shipments might not be fully linked yet
      return {
        total_shipments: 38420,
        shipments_trend: 7.8,
        active_fleet: Number(activeFleet),
        fleet_trend: 4.3,
        avg_delivery_time: '4h 05m',
        delivery_trend: -15, // minutes improvement
        on_time_performance: 97.9,
        performance_trend: -0.5,
      };
    });
  });

  // ── GPSWOX device integration ────────────────────────────────

  fastify.post('/gpswox/test', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    return gpswoxService.testConnection(user.tenant_id);
  });

  fastify.post('/gpswox/sync-now', { preHandler: requireRole(...FLEET_ROLES) }, async (req, reply) => {
    const user = req.user;
    try {
      return await gpswoxService.syncPositions(user.tenant_id, (vehicleId, lat, lng) => {
        fastify.websocketServer?.clients.forEach((client: any) => {
          client.send(JSON.stringify({ type: 'vehicle.position_updated', vehicleId, latitude: lat, longitude: lng }));
        });
      });
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  fastify.get('/gpswox/status', async (req) => {
    const user = req.user;
    return gpswoxService.getStatus(user.tenant_id);
  });

  // ── Vehicle reference data (NHTSA vPIC — free, no key) ────────
  // Used to populate Make/Model pickers on the vehicle form. vPIC is a US
  // regulatory database, so coverage of non-US commercial truck brands
  // (Isuzu, Fuso, Hino, Scania, MAN, Howo, etc.) is incomplete — this seeds
  // the picker, it doesn't replace free-text entry for makes/models it
  // doesn't know.

  fastify.get('/vehicle-makes', async (req) => {
    const { type } = req.query as { type?: string };
    try {
      const data = await fetchVpicCached(`https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/${encodeURIComponent(type || 'truck')}?format=json`);
      const results = (data.Results ?? []) as { MakeId: number; MakeName: string }[];
      const names = [...new Set(results.map(r => r.MakeName))].sort();
      return names.map(name => ({ name }));
    } catch {
      return [];
    }
  });

  fastify.get('/vehicle-models', async (req, reply) => {
    const { make } = req.query as { make?: string };
    if (!make?.trim()) return reply.status(400).send({ error: 'make is required' });
    try {
      const data = await fetchVpicCached(`https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/${encodeURIComponent(make.trim())}?format=json`);
      const results = (data.Results ?? []) as { Model_Name: string }[];
      const names = [...new Set(results.map(r => r.Model_Name))].sort();
      return names.map(name => ({ name }));
    } catch {
      return [];
    }
  });

  // ── Vehicles ─────────────────────────────────────────────────

  fastify.get('/vehicles', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const vehicles = await trx.selectFrom('vehicles')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('name')
        .execute();

      if (vehicles.length === 0) return [];

      const latest = await sql<{
        vehicle_id: string; latitude: number; longitude: number;
        speed: number | null; heading: number | null; battery_pct: number | null;
        ignition: string | null; recorded_at: Date;
      }>`
        SELECT DISTINCT ON (vehicle_id) vehicle_id, latitude, longitude, speed, heading, battery_pct, ignition, recorded_at
        FROM vehicle_positions
        WHERE tenant_id = ${user.tenant_id}
        ORDER BY vehicle_id, recorded_at DESC
      `.execute(trx);

      const drivers = await trx.selectFrom('drivers')
        .select(['assigned_vehicle_id', 'avatar_url', 'photo_url'])
        .where('tenant_id', '=', user.tenant_id)
        .where('assigned_vehicle_id', 'is not', null)
        .execute();

      const driverByVehicle = new Map(drivers.map(d => [d.assigned_vehicle_id, d.avatar_url || d.photo_url]));

      const posByVehicle = new Map(latest.rows.map(r => [r.vehicle_id, {
        ...r,
        latitude: Number(r.latitude), longitude: Number(r.longitude),
        speed: numOrNull(r.speed), heading: numOrNull(r.heading), battery_pct: numOrNull(r.battery_pct),
      }]));
      return vehicles.map(v => ({
        ...v, 
        mileage_km: numOrNull(v.mileage_km),
        driver_avatar: driverByVehicle.get(v.id) ?? null,
        last_position: posByVehicle.get(v.id) ?? null,
      }));
    });
  });

  fastify.post('/vehicles', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = vehicleFieldsSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('vehicles').values({
        tenant_id: user.tenant_id,
        name: body.name,
        plate_number: body.plate_number ?? null,
        type: body.type ?? 'TRUCK',
        driver_name: body.driver_name ?? null,
        driver_phone: body.driver_phone ?? null,
        device_id: body.device_id,
        fuel_type: body.fuel_type ?? null,
        group_name: body.group_name ?? null,
        vin: body.vin ?? null,
        year: body.year ?? null,
        make: body.make ?? null,
        model: body.model ?? null,
        trim: body.trim ?? null,
        color: body.color ?? null,
        ownership: body.ownership ?? 'OWNED',
        mileage_km: body.mileage_km ?? null,
        purchase_vendor: body.purchase_vendor ?? null,
        purchase_date: body.purchase_date ?? null,
        purchase_price: body.purchase_price ?? null,
        initial_odometer: body.initial_odometer ?? null,
        financing_type: body.financing_type ?? 'NONE',
        in_service_date: body.in_service_date ?? null,
        in_service_odometer: body.in_service_odometer ?? null,
        est_life_months: body.est_life_months ?? null,
        est_life_meter: body.est_life_meter ?? null,
        est_resale_value: body.est_resale_value ?? null,
        out_of_service_date: body.out_of_service_date ?? null,
        out_of_service_odometer: body.out_of_service_odometer ?? null,
        lifecycle_notes: body.lifecycle_notes ?? null,
        status: body.status ?? 'ACTIVE',
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/vehicles/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = vehiclePatchSchema.parse(req.body);
    const patch = pick(body, [
      'name', 'plate_number', 'type', 'driver_name', 'driver_phone', 'status',
      'vin', 'year', 'make', 'model', 'trim', 'color', 'ownership', 'mileage_km', 'photo_url',
      'fuel_type', 'group_name', 'purchase_vendor', 'purchase_date', 'purchase_price',
      'initial_odometer', 'financing_type', 'in_service_date', 'in_service_odometer',
      'est_life_months', 'est_life_meter', 'est_resale_value', 'out_of_service_date',
      'out_of_service_odometer', 'lifecycle_notes',
    ]);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('vehicles').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.get('/vehicles/:id/history', async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const { from, to } = req.query as { from?: string; to?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('vehicle_positions')
        .selectAll()
        .where('vehicle_id', '=', id)
        .where('tenant_id', '=', user.tenant_id);
      if (from) q = q.where('recorded_at', '>=', new Date(from));
      if (to) q = q.where('recorded_at', '<=', new Date(to));
      const rows = await q.orderBy('recorded_at', 'asc').limit(2000).execute();
      return rows.map(r => ({
        ...r,
        latitude: Number(r.latitude), longitude: Number(r.longitude),
        speed: numOrNull(r.speed), heading: numOrNull(r.heading), battery_pct: numOrNull(r.battery_pct),
      }));
    });
  });

  // ── Position ingestion (device/simulator POSTs here) ────────────
  // Not authenticated the same way as the rest of the app — a real device
  // reports via its own device_id, not a user session. Kept inside this
  // same route file (still gated by requireEntitlement above, which only
  // needs a valid user token) rather than adding a separate device-auth
  // scheme; a per-device shared secret is a reasonable follow-on if this
  // needs to be reachable by real hardware outside an authenticated session.

  fastify.post('/positions/ingest', async (req, reply) => {
    const user = req.user;
    const body = z.object({
      device_id: z.string().min(1).max(100),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      speed: z.number().min(0).optional(),
      heading: z.number().min(0).max(360).optional(),
      timestamp: z.string().optional(),
      battery_pct: z.number().min(0).max(100).optional(),
      ignition: z.enum(['ON', 'OFF']).optional(),
    }).parse(req.body);

    return withTenant(user.tenant_id, async (trx) => {
      const vehicle = await trx.selectFrom('vehicles').selectAll()
        .where('device_id', '=', body.device_id).where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!vehicle) return reply.status(404).send({ error: 'Unknown device_id for this tenant' });

      const recordedAt = body.timestamp ? new Date(body.timestamp) : new Date();
      await trx.insertInto('vehicle_positions').values({
        vehicle_id: vehicle.id,
        tenant_id: user.tenant_id,
        latitude: body.lat,
        longitude: body.lng,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        battery_pct: body.battery_pct ?? null,
        ignition: body.ignition ?? null,
        recorded_at: recordedAt,
      } as any).execute();

      await checkGeofenceTransitions(trx, user.tenant_id, vehicle.id, body.lat, body.lng);

      fastify.websocketServer?.clients.forEach((client: any) => {
        client.send(JSON.stringify({
          type: 'vehicle.position_updated',
          vehicleId: vehicle.id,
          latitude: body.lat,
          longitude: body.lng,
        }));
      });

      return { ok: true, vehicle_id: vehicle.id };
    });
  });

  // ── Geofences (shared table with the AIS/customs feature) ──────

  fastify.get('/geofences', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('geofences').selectAll()
        .where('tenant_id', '=', user.tenant_id).orderBy('name').execute();
      return rows.map(r => ({
        ...r, center_lat: Number(r.center_lat), center_lon: Number(r.center_lon), radius_km: Number(r.radius_km),
      }));
    });
  });

  fastify.post('/geofences', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = geofenceCreateSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('geofences').values({
        tenant_id: user.tenant_id, name: body.name,
        center_lat: body.center_lat, center_lon: body.center_lon, radius_km: body.radius_km,
        zone_type: body.zone_type ?? 'CUSTOM', created_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/geofences/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = geofencePatchSchema.parse(req.body);
    const patch = pick(body, ['name', 'center_lat', 'center_lon', 'radius_km', 'zone_type', 'active']);
    return withTenant(user.tenant_id, async (trx) =>
      trx.updateTable('geofences').set({ ...patch, updated_at: new Date() } as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow()
    );
  });

  fastify.delete('/geofences/:id', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    await withTenant(user.tenant_id, async (trx) =>
      trx.deleteFrom('geofences').where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute()
    );
    return { ok: true };
  });

  // ── Dashboard summary ────────────────────────────────────────

  fastify.get('/dashboard-summary', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const vehicles = await trx.selectFrom('vehicles').select(['id', 'status'])
        .where('tenant_id', '=', user.tenant_id).execute();

      const latest = await sql<{ vehicle_id: string; speed: number | null; recorded_at: Date }>`
        SELECT DISTINCT ON (vehicle_id) vehicle_id, speed, recorded_at
        FROM vehicle_positions
        WHERE tenant_id = ${user.tenant_id}
        ORDER BY vehicle_id, recorded_at DESC
      `.execute(trx);
      const posByVehicle = new Map(latest.rows.map(r => [r.vehicle_id, r]));

      let moving = 0, stopped = 0, offline = 0;
      for (const v of vehicles) {
        const pos = posByVehicle.get(v.id);
        if (!pos) { offline++; continue; }
        const ageMs = Date.now() - new Date(pos.recorded_at).getTime();
        if (ageMs > 1000 * 60 * 60 * 2) offline++;
        else if ((pos.speed ?? 0) > 3) moving++;
        else stopped++;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86_400_000);

      const tripsToday = await trx.selectFrom('trips')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('tenant_id', '=', user.tenant_id)
        .where('scheduled_start', '>=', todayStart)
        .where('scheduled_start', '<', todayEnd)
        .executeTakeFirst();

      const horizon = new Date(Date.now() + 30 * 86_400_000);
      const expiringDocs = await trx.selectFrom('vehicle_documents')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('tenant_id', '=', user.tenant_id)
        .where('expiry_date', 'is not', null)
        .where('expiry_date', '<=', toDateParam(horizon))
        .executeTakeFirst();

      const pendingReminders = await trx.selectFrom('fleet_reminders')
        .select(({ fn }) => [fn.count<number>('id').as('count')])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'PENDING')
        .where('due_date', '<=', toDateParam(horizon))
        .executeTakeFirst();

      const recentAlerts = await trx.selectFrom('fleet_alerts').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('acknowledged', '=', false)
        .orderBy('created_at', 'desc').limit(10).execute();

      const tripsCompletedToday = await trx.selectFrom('trips')
        .select(['scheduled_end', 'actual_end'])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'COMPLETED')
        .where('actual_end', '>=', todayStart).where('actual_end', '<', todayEnd)
        .execute();
      let onTime = 0;
      let totalDurationMin = 0, durationCount = 0;
      for (const t of tripsCompletedToday) {
        if (t.scheduled_end && t.actual_end && new Date(t.actual_end) <= new Date(t.scheduled_end)) onTime++;
      }
      const inProgressToday = await trx.selectFrom('trips')
        .select(['actual_start', 'actual_end'])
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'COMPLETED')
        .where('actual_start', 'is not', null).where('actual_end', 'is not', null)
        .where('actual_end', '>=', todayStart).where('actual_end', '<', todayEnd)
        .execute();
      for (const t of inProgressToday) {
        if (t.actual_start && t.actual_end) {
          totalDurationMin += (new Date(t.actual_end).getTime() - new Date(t.actual_start).getTime()) / 60000;
          durationCount++;
        }
      }

      const inMaintenanceVehicles = await trx.selectFrom('maintenance_records')
        .select('vehicle_id').distinct()
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'SCHEDULED')
        .execute();

      const since30 = new Date(Date.now() - 30 * 86_400_000);
      const fuelCost30d = await trx.selectFrom('fuel_logs')
        .select(({ fn }) => [fn.sum<number>('cost').as('total')])
        .where('tenant_id', '=', user.tenant_id).where('logged_at', '>=', since30)
        .executeTakeFirst();
      const maintenanceCost30d = await trx.selectFrom('maintenance_records')
        .select(({ fn }) => [fn.sum<number>('cost').as('total')])
        .where('tenant_id', '=', user.tenant_id).where('service_date', '>=', toDateParam(since30))
        .executeTakeFirst();

      const totalCost30d = Number(fuelCost30d?.total ?? 0) + Number(maintenanceCost30d?.total ?? 0);

      return {
        vehicles: {
          total: vehicles.length, moving, stopped, offline,
          in_maintenance: inMaintenanceVehicles.length,
        },
        trips_today: Number(tripsToday?.count ?? 0),
        trips_completed_today: tripsCompletedToday.length,
        on_time_pct_today: tripsCompletedToday.length > 0 ? Math.round((onTime / tripsCompletedToday.length) * 100) : null,
        avg_delivery_minutes_today: durationCount > 0 ? Math.round(totalDurationMin / durationCount) : null,
        expiring_documents: Number(expiringDocs?.count ?? 0),
        pending_reminders: Number(pendingReminders?.count ?? 0),
        recent_alerts: recentAlerts,
        costs_30d: {
          fuel: Number(fuelCost30d?.total ?? 0),
          maintenance: Number(maintenanceCost30d?.total ?? 0),
          total: totalCost30d,
          per_vehicle: vehicles.length > 0 ? Math.round((totalCost30d / vehicles.length) * 100) / 100 : 0,
        },
      };
    });
  });

  // --- Assignments ---
  fastify.get('/assignments', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('vehicle_assignments as va')
        .innerJoin('vehicles as v', 'v.id', 'va.vehicle_id')
        .innerJoin('drivers as d', 'd.id', 'va.driver_id')
        .select(['va.id', 'va.vehicle_id', 'va.driver_id', 'va.start_time', 'va.end_time', 'va.labels', 'va.comment', 'v.name as vehicle_name', 'v.plate_number as vehicle_plate', 'v.photo_url as vehicle_photo_url', 'd.name as driver_name', 'd.avatar_url as driver_avatar_url'])
        .where('va.tenant_id', '=', user.tenant_id)
        .orderBy('va.start_time', 'desc')
        .limit(500)
        .execute();
    });
  });

  fastify.post('/assignments', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const body = req.body as { vehicle_id: string; driver_id: string; start_time: string; end_time?: string; labels?: string; comment?: string; };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('vehicle_assignments').values({
        tenant_id: user.tenant_id,
        vehicle_id: body.vehicle_id,
        driver_id: body.driver_id,
        start_time: body.start_time,
        end_time: body.end_time ?? null,
        labels: body.labels ?? null,
        comment: body.comment ?? null,
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });

  // --- Sensor Snapshots ---
  fastify.get('/vehicles/:id/sensor_snapshots', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('vehicle_sensor_snapshots')
        .selectAll()
        .where('vehicle_id', '=', id).where('tenant_id', '=', user.tenant_id)
        .orderBy('recorded_at', 'desc')
        .limit(100)
        .execute();
    });
  });

  fastify.post('/vehicles/:id/sensor_snapshots', { preHandler: requireRole(...FLEET_ROLES) }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { snapshot_type: string; payload: any; recorded_at?: string; };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('vehicle_sensor_snapshots').values({
        tenant_id: user.tenant_id,
        vehicle_id: id,
        snapshot_type: body.snapshot_type,
        payload: JSON.stringify(body.payload),
        recorded_at: body.recorded_at ?? new Date().toISOString(),
      } as any).returningAll().executeTakeFirstOrThrow();
    });
  });
}
