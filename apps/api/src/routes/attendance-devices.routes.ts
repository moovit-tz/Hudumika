import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { recordDevicePunches } from '../services/attendance-device.service.js';
import { getDeviceProvider, DEVICE_PROVIDERS } from '../lib/device-providers/index.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const deviceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.enum(Object.keys(DEVICE_PROVIDERS) as [string, ...string[]]).default('zkteco'),
  location: z.string().trim().max(200).optional(),
});
const enrollmentCreateSchema = z.object({
  userId: z.string().uuid(),
  externalPin: z.string().trim().min(1).max(50),
  method: z.enum(['fingerprint', 'face', 'card', 'pin']).default('fingerprint'),
});

async function logDeviceActivity(trx: any, tenantId: string, userId: string, action: string) {
  await trx.insertInto('hr_activity_log').values({ tenant_id: tenantId, user_id: userId, action, module: 'Attendance' }).execute();
}

/**
 * Device Management — the authenticated, tenant-scoped half (registry CRUD,
 * enrollment, event review, sync history). The unauthenticated device-facing
 * push endpoints live separately in device-ingest.routes.ts, since a
 * biometric terminal can't carry a JWT.
 */
export async function attendanceDevicesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  fastify.get('/', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('attendance_devices').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('created_at', 'desc').execute()
    );
  });

  fastify.post('/', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const body = deviceCreateSchema.parse(req.body);
    const serial = `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const pushToken = crypto.randomBytes(24).toString('hex');

    const device = await withTenant(user.tenant_id, (trx) =>
      trx.insertInto('attendance_devices').values({
        tenant_id: user.tenant_id, provider: body.provider, name: body.name,
        serial_number: serial, push_token: pushToken, location: body.location ?? null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow()
        .then(async (d: any) => { await logDeviceActivity(trx, user.tenant_id, user.sub, `Registered device "${body.name}"`); return d; })
    );

    reply.status(201);
    // pushToken/serverUrl returned once, for the tenant to punch into the
    // physical unit's own "Server URL" menu — not retrievable again after this.
    return { ...device, serverUrl: `${req.protocol}://${req.hostname}/iclock` };
  });

  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ name: z.string().trim().min(1).max(200).optional(), location: z.string().trim().max(200).nullable().optional() }).parse(req.body);
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.location !== undefined) updates.location = body.location;

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.updateTable('attendance_devices').set(updates)
        .where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Device not found' });
      return row;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('attendance_devices')
        .where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Device not found' });
      await logDeviceActivity(trx, user.tenant_id, user.sub, `Removed device "${row.name}"`);
      reply.status(204);
      return null;
    });
  });

  // ── Enrollments ───────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id/enrollments', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('attendance_device_enrollments as e')
        .innerJoin('users as u', 'u.id', 'e.user_id')
        .select(['e.id', 'e.external_pin', 'e.method', 'e.created_at', 'e.user_id', 'u.name as user_name'])
        .where('e.tenant_id', '=', user.tenant_id).where('e.device_id', '=', req.params.id)
        .orderBy('e.created_at', 'desc').execute()
    );
  });

  fastify.post<{ Params: { id: string } }>('/:id/enrollments', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const body = enrollmentCreateSchema.parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const device = await trx.selectFrom('attendance_devices').select('name').where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!device) return reply.status(404).send({ error: 'Device not found' });

      const row = await trx.insertInto('attendance_device_enrollments').values({
        tenant_id: user.tenant_id, device_id: req.params.id, user_id: body.userId,
        external_pin: body.externalPin, method: body.method, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await logDeviceActivity(trx, user.tenant_id, user.sub, `Enrolled a user on device "${device.name}" (PIN ${body.externalPin})`);
      reply.status(201);
      return row;
    });
  });

  fastify.delete<{ Params: { id: string; enrollmentId: string } }>('/:id/enrollments/:enrollmentId', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.deleteFrom('attendance_device_enrollments')
        .where('id', '=', req.params.enrollmentId).where('device_id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Enrollment not found' });
      reply.status(204);
      return null;
    });
  });

  // ── Events (raw punch log — includes unmatched/orphan punches) ──

  fastify.get<{ Params: { id: string } }>('/:id/events', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('attendance_device_events as e')
        .leftJoin('users as u', 'u.id', 'e.user_id')
        .select(['e.id', 'e.external_pin', 'e.user_id', 'u.name as user_name', 'e.punched_at', 'e.raw_status', 'e.processed'])
        .where('e.tenant_id', '=', user.tenant_id).where('e.device_id', '=', req.params.id)
        .orderBy('e.punched_at', 'desc').limit(200).execute()
    );
  });

  /** An orphan punch (no enrollment matched its PIN) — HR assigns it to a
   *  real employee, which both creates the enrollment for future punches and
   *  reprocesses this one. */
  fastify.patch<{ Params: { id: string; eventId: string } }>(
    '/:id/events/:eventId/assign',
    { preHandler: requireRole(...MGMT) },
    async (req, reply) => {
      const user = req.user;
      const body = z.object({ userId: z.string().uuid() }).parse(req.body);
      return withTenant(user.tenant_id, async (trx) => {
        const event = await trx.selectFrom('attendance_device_events').selectAll()
          .where('id', '=', req.params.eventId).where('device_id', '=', req.params.id).where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (!event) return reply.status(404).send({ error: 'Event not found' });

        const existingEnrollment = await trx.selectFrom('attendance_device_enrollments').select('id')
          .where('device_id', '=', req.params.id).where('external_pin', '=', event.external_pin).executeTakeFirst();
        if (!existingEnrollment) {
          await trx.insertInto('attendance_device_enrollments').values({
            tenant_id: user.tenant_id, device_id: req.params.id, user_id: body.userId,
            external_pin: event.external_pin, method: 'pin', created_by: user.sub,
          }).execute();
        }

        await trx.updateTable('attendance_device_events').set({ user_id: body.userId })
          .where('tenant_id', '=', user.tenant_id).where('device_id', '=', req.params.id).where('external_pin', '=', event.external_pin)
          .execute();

        const { reconcileDevicePunchesForUserDate } = await import('../services/attendance-device.service.js');
        const dateStr = new Date(event.punched_at).toISOString().slice(0, 10);
        await reconcileDevicePunchesForUserDate(trx, user.tenant_id, req.params.id, body.userId, dateStr);
        await logDeviceActivity(trx, user.tenant_id, user.sub, `Assigned an orphan punch (PIN ${event.external_pin}) to an employee`);

        return { ok: true };
      });
    }
  );

  // ── Sync logs ─────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id/sync-logs', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('attendance_device_sync_logs').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('device_id', '=', req.params.id)
        .orderBy('started_at', 'desc').limit(50).execute()
    );
  });

  /**
   * No physical device is reachable to test against — this drives one real
   * synthetic punch through the exact same recordDevicePunches() pipeline a
   * genuine device push uses, rather than a separate fake demo path.
   */
  fastify.post<{ Params: { id: string } }>('/:id/simulate-punch', { preHandler: requireRole(...MGMT) }, async (req, reply) => {
    const user = req.user;
    const body = z.object({ externalPin: z.string().trim().min(1).max(50) }).parse(req.body);
    const device = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('attendance_devices').select(['id', 'provider']).where('id', '=', req.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
    );
    if (!device) return reply.status(404).send({ error: 'Device not found' });
    if (!getDeviceProvider(device.provider)) return reply.status(500).send({ error: 'Unsupported provider' });

    const { received, matched } = await recordDevicePunches(user.tenant_id, device.id, [
      { externalPin: body.externalPin, punchedAt: new Date(), rawStatus: null },
    ]);
    await withTenant(user.tenant_id, (trx) => logDeviceActivity(trx, user.tenant_id, user.sub, `Simulated a punch on device (PIN ${body.externalPin})`));

    return { ok: true, received, matched };
  });
}
