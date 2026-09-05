import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { dbPlatform } from '../db/client.js';
import { getDeviceProvider } from '../lib/device-providers/index.js';
import { recordDevicePunches } from '../services/attendance-device.service.js';

/**
 * Device-facing ADMS endpoints — genuinely unauthenticated in the JWT sense,
 * because a biometric terminal has no user session and no notion of
 * "tenant." A real ZKTeco device configured in Cloud/ADMS mode is hardcoded
 * by its own firmware to call `<Server URL>/iclock/...`, so this is
 * registered at the bare `/iclock` prefix (index.ts), not under `/v1/...`.
 *
 * Instead of a JWT, a device authenticates with the two things it's given
 * once at registration time (attendance-devices.routes.ts's POST /devices):
 * its own `serial_number` (query param SN — how the device identifies
 * itself, and the only way this endpoint can resolve which tenant a push
 * belongs to) and a `push_token` shared secret (query param `token`), so a
 * guessed/reused serial number alone can't spoof another tenant's device.
 * Looking the device up by serial via `dbPlatform` before any tenant is
 * known is exactly the narrow, audited cross-tenant case CLAUDE.md's
 * tenant-isolation rule carves out — every write after that happens inside
 * `withTenant()` (see attendance-device.service.ts).
 */
export async function deviceIngestRoutes(fastify: FastifyInstance) {
  // Real devices vary on what Content-Type they send the ATTLOG push with
  // (text/plain, application/octet-stream, or nothing) — scoped to this
  // plugin instance only, which exists solely for device traffic.
  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  async function resolveDevice(sn: string | undefined, token: string | undefined) {
    if (!sn || !token) return null;
    const device = await dbPlatform.selectFrom('attendance_devices').selectAll()
      .where('serial_number', '=', sn).executeTakeFirst();
    if (!device || !device.push_token) return null;
    // Constant-time compare — a plain !== leaks how many leading bytes of
    // the real token a guess matched via response-time, the same class of
    // bug password/API-key comparisons in this codebase are already careful
    // about. Buffers of different length can never be equal, checked first
    // since timingSafeEqual throws rather than returning false for that case.
    const a = Buffer.from(device.push_token);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return device;
  }

  // Handshake / config request.
  fastify.get('/cdata', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const device = await resolveDevice(q.SN, q.token);
    if (!device) return reply.status(403).send('unregistered device');
    const provider = getDeviceProvider(device.provider);
    if (!provider) return reply.status(500).send('unsupported provider');

    await dbPlatform.updateTable('attendance_devices')
      .set({ last_heartbeat_at: new Date(), status: device.status === 'unregistered' ? 'online' : device.status, updated_at: new Date() })
      .where('id', '=', device.id).execute();

    reply.type('text/plain');
    return provider.handshakeReply();
  });

  // Command poll — always empty (no remote-command queue this phase).
  fastify.get('/getrequest', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const device = await resolveDevice(q.SN, q.token);
    if (!device) return reply.status(403).send('unregistered device');
    const provider = getDeviceProvider(device.provider);
    reply.type('text/plain');
    return provider ? provider.emptyCommandReply() : 'OK';
  });

  // The actual attendance push.
  fastify.post('/cdata', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const device = await resolveDevice(q.SN, q.token);
    if (!device) return reply.status(403).send('unregistered device');
    if ((q.table || '').toUpperCase() !== 'ATTLOG') {
      // OPERLOG/other tables — handshake advertises we don't want them
      // (OPERLOG=0), but ack politely if one arrives anyway.
      reply.type('text/plain');
      return 'OK';
    }
    const provider = getDeviceProvider(device.provider);
    if (!provider) return reply.status(500).send('unsupported provider');

    const startedAt = new Date();
    const body = typeof request.body === 'string' ? request.body : '';
    const punches = provider.parsePunchBatch(body);

    const log = await dbPlatform.insertInto('attendance_device_sync_logs').values({
      tenant_id: device.tenant_id, device_id: device.id, started_at: startedAt,
      records_received: punches.length, records_matched: 0, status: 'ok',
    }).returningAll().executeTakeFirstOrThrow();

    try {
      const { received, matched } = await recordDevicePunches(device.tenant_id, device.id, punches);
      await dbPlatform.updateTable('attendance_device_sync_logs')
        .set({ finished_at: new Date(), records_received: received, records_matched: matched, status: 'ok' })
        .where('id', '=', log.id).execute();
    } catch (err: any) {
      await dbPlatform.updateTable('attendance_device_sync_logs')
        .set({ finished_at: new Date(), status: 'error', error: String(err?.message ?? err) })
        .where('id', '=', log.id).execute();
      // Still ack OK — a device that gets an error response will keep
      // retrying the same failed batch forever instead of moving on.
    }

    reply.type('text/plain');
    return provider.ackReply();
  });
}
