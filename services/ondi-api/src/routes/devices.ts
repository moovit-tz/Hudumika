import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';
import { createEphemeralStore } from '../lib/ephemeral-store.js';

async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

// Transient QR/code device-pairing sessions — Redis-backed (5-min TTL),
// survives restarts and works across multiple instances.
const PAIRING_TTL_SECONDS = 5 * 60;

interface PairingSession {
  pairingId: string;
  pairingCode: string;
  userId: string;
  status: 'pending' | 'approved';
  pairedDeviceId?: string;
}

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function deviceRoutes(app: FastifyInstance) {
  const pairingStore = createEphemeralStore<PairingSession>(app, 'pairing');

  /**
   * GET /devices
   * List all registered devices for the authenticated user.
   */
  app.get('/', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const devices = await app.prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });

    return reply.send({
      devices: devices.map(d => ({
        id:          d.id,
        deviceId:    d.deviceId,
        deviceName:  d.deviceName,
        userAgent:   d.userAgent,
        ipAddress:   d.ipAddress,
        location:    d.location,
        isTrusted:   d.isTrusted,
        isLocked:    (d as any).isLocked ?? false,
        lastUsedAt:  d.lastUsedAt,
        createdAt:   d.createdAt,
      })),
    });
  });

  /**
   * PATCH /devices/:deviceId/trust
   * Trust or untrust a device.
   * Body: { trusted: boolean }
   */
  app.patch('/:deviceId/trust', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { deviceId } = req.params as { deviceId: string };
    const { trusted } = req.body as { trusted?: boolean };
    if (typeof trusted !== 'boolean')
      return reply.code(400).send({ error: 'trusted_boolean_required' });

    const device = await app.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    await app.prisma.device.update({ where: { id: deviceId }, data: { isTrusted: trusted } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       trusted ? 'DEVICE_TRUSTED' : 'DEVICE_REMOVED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { deviceId, trusted },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ updated: true, isTrusted: trusted });
  });

  /**
   * PATCH /devices/:deviceId/name
   * Rename a device (e.g. "Ibrahim's iPhone 15").
   * Body: { name: string }
   */
  app.patch('/:deviceId/name', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { deviceId } = req.params as { deviceId: string };
    const { name } = req.body as { name?: string };
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });

    const device = await app.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    await app.prisma.device.update({ where: { id: deviceId }, data: { deviceName: name.trim() } });
    return reply.send({ updated: true, deviceName: name.trim() });
  });

  /**
   * POST /devices/:deviceId/lock
   * Lock a device — revokes all its sessions and blocks future auth from it.
   */
  app.post('/:deviceId/lock', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { deviceId } = req.params as { deviceId: string };
    const device = await app.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });
    if ((device as any).isLocked) return reply.send({ locked: true, alreadyLocked: true });

    await Promise.all([
      app.prisma.device.update({ where: { id: deviceId }, data: { isLocked: true } as any }),
      app.prisma.authSession.deleteMany({ where: { userId, deviceId } }),
    ]);

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'DEVICE_LOCKED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { deviceId: device.deviceId, deviceName: device.deviceName },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send({ locked: true });
  });

  /**
   * POST /devices/:deviceId/unlock
   * Unlock a previously locked device.
   */
  app.post('/:deviceId/unlock', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { deviceId } = req.params as { deviceId: string };
    const device = await app.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    await app.prisma.device.update({ where: { id: deviceId }, data: { isLocked: false } as any });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'DEVICE_UNLOCKED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { deviceId: device.deviceId },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ unlocked: true });
  });

  /**
   * DELETE /devices/:deviceId
   * Remove a device and revoke all its sessions.
   */
  app.delete('/:deviceId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { deviceId } = req.params as { deviceId: string };
    const device = await app.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) return reply.code(404).send({ error: 'device_not_found' });

    await app.prisma.authSession.deleteMany({ where: { deviceId } });
    await app.prisma.device.delete({ where: { id: deviceId } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'DEVICE_REMOVED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { deviceId: device.deviceId, deviceName: device.deviceName },
      severity:     'WARNING',
      isRegulatory: true,
    });

    return reply.send({ removed: true });
  });

  /**
   * POST /devices/pairing/initiate
   * Called by the already-logged-in web session to start a QR/code pairing.
   * Returns a pairingId (for status polling) and a short human-typeable
   * pairingCode (QR payload + no-camera fallback).
   */
  app.post('/pairing/initiate', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const pairingId = crypto.randomUUID();
    const pairingCode = generatePairingCode();
    await pairingStore.set(pairingId, { pairingId, pairingCode, userId, status: 'pending' }, PAIRING_TTL_SECONDS);
    await pairingStore.index.add(pairingCode, pairingId, PAIRING_TTL_SECONDS);

    return reply.send({ pairingId, pairingCode, expiresIn: PAIRING_TTL_SECONDS });
  });

  /**
   * GET /devices/pairing/:pairingId/status
   * Polled by the web client until the mobile app approves the pairing.
   */
  app.get('/pairing/:pairingId/status', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { pairingId } = req.params as { pairingId: string };
    const session = await pairingStore.get(pairingId);
    if (!session || session.userId !== userId)
      return reply.code(404).send({ error: 'pairing_not_found' });

    return reply.send({ status: session.status, pairedDeviceId: session.pairedDeviceId ?? null });
  });

  /**
   * POST /devices/pairing/:pairingCode/approve
   * Called by the mobile app (already authenticated as the same user) once
   * the user scans the QR code or types the fallback code. Upserts a Device
   * row for the mobile app's fingerprint, tied to the caller's own userId —
   * a user can only pair devices onto their own account, never someone else's.
   */
  app.post('/pairing/:pairingCode/approve', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { pairingCode } = req.params as { pairingCode: string };
    const { deviceFingerprint, deviceName } = req.body as { deviceFingerprint?: string; deviceName?: string };
    if (!deviceFingerprint) return reply.code(400).send({ error: 'device_fingerprint_required' });

    const candidateIds = await pairingStore.index.members(pairingCode.toUpperCase());
    const candidates = await Promise.all(candidateIds.map(id => pairingStore.get(id)));
    const pairingId = candidateIds.find((id, i) => candidates[i]?.status === 'pending');
    const session = pairingId ? candidates[candidateIds.indexOf(pairingId)] : null;
    if (!pairingId || !session) return reply.code(404).send({ error: 'pairing_code_invalid_or_expired' });

    if (session.userId !== userId)
      return reply.code(403).send({ error: 'pairing_belongs_to_different_user' });

    const device = await app.prisma.device.upsert({
      where:  { deviceId: deviceFingerprint },
      create: { userId, deviceId: deviceFingerprint, deviceName: deviceName ?? 'Ondi Mobile' },
      update: { lastUsedAt: new Date(), deviceName: deviceName ?? undefined },
    });

    session.status = 'approved';
    session.pairedDeviceId = device.id;
    await pairingStore.set(pairingId, session, PAIRING_TTL_SECONDS);

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'DEVICE_PAIRED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { deviceId: deviceFingerprint, deviceName: device.deviceName },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ approved: true, deviceId: device.id });
  });
}
