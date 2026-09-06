import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import { checkGeofenceTransitions } from './tracking.routes.js';

/**
 * Real GPS device ingestion — no user session at all, by design: a physical
 * tracker (or a per-tenant simulator standing in for one) has no login, so
 * this used to be reached with any authenticated tenant user's token
 * instead (any role, meant for anyone with the 'tracking' entitlement),
 * which is not device authentication, just a workaround.
 *
 * Registered as its own plugin (not inside trackingRoutes) specifically so
 * fastify.authenticate/requireEntitlement — hooks scoped to that plugin —
 * never apply here. Each vehicle carries its own device_secret (migration
 * 396, generated once at creation, shown once, regenerable) instead of one
 * shared platform-wide key, so a single compromised device can't be used to
 * spoof another tenant's fleet or another vehicle in the same fleet.
 *
 * device_id is globally unique across tenants (vehicles_device_id_unique,
 * migration 054), so the device is looked up via the cross-tenant
 * dbPlatform connection — there is no tenant context to scope by until
 * after the secret proves which vehicle (and therefore which tenant) is
 * reporting.
 */
export async function trackingDeviceRoutes(fastify: FastifyInstance) {
  fastify.post('/positions/ingest', async (req, reply) => {
    const body = z.object({
      device_id: z.string().min(1).max(100),
      device_secret: z.string().min(1).max(128),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      speed: z.number().min(0).optional(),
      heading: z.number().min(0).max(360).optional(),
      timestamp: z.string().optional(),
      battery_pct: z.number().min(0).max(100).optional(),
      ignition: z.enum(['ON', 'OFF']).optional(),
    }).parse(req.body);

    const vehicle = await dbPlatform.selectFrom('vehicles')
      .select(['id', 'tenant_id', 'device_secret'])
      .where('device_id', '=', body.device_id)
      .executeTakeFirst();
    // A vehicle registered before migration 396 has no device_secret yet
    // (null) — treated the same as "not found" rather than letting a device
    // in with no credential check at all.
    if (!vehicle || !vehicle.device_secret) {
      return reply.status(404).send({ error: 'Unknown device' });
    }

    const provided = Buffer.from(body.device_secret);
    const expected = Buffer.from(vehicle.device_secret);
    const valid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid device credentials' });
    }

    return withTenant(vehicle.tenant_id, async (trx) => {
      const recordedAt = body.timestamp ? new Date(body.timestamp) : new Date();
      await trx.insertInto('vehicle_positions').values({
        vehicle_id: vehicle.id,
        tenant_id: vehicle.tenant_id,
        latitude: body.lat,
        longitude: body.lng,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        battery_pct: body.battery_pct ?? null,
        ignition: body.ignition ?? null,
        recorded_at: recordedAt,
      } as any).execute();

      await checkGeofenceTransitions(trx, vehicle.tenant_id, vehicle.id, body.lat, body.lng);

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
}
