import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';

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

export async function sessionRoutes(app: FastifyInstance) {

  /**
   * GET /sessions
   * List all active sessions for the authenticated user.
   */
  app.get('/', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const sessions = await app.prisma.authSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      include: { device: { select: { deviceId: true, deviceName: true, userAgent: true, location: true } } },
      orderBy: { lastActivityAt: 'desc' },
    });

    return reply.send({
      sessions: sessions.map(s => ({
        id:             s.id,
        device:         s.device,
        riskScore:      s.riskScore,
        decision:       s.decision,
        lastActivityAt: (s as any).lastActivityAt,
        expiresAt:      s.expiresAt,
        createdAt:      s.createdAt,
      })),
    });
  });

  /**
   * POST /sessions/ping
   * Update lastActivityAt for a session (keep-alive).
   * Body: { sessionId }
   */
  app.post('/ping', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) return reply.code(400).send({ error: 'session_id_required' });

    const session = await app.prisma.authSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) return reply.code(404).send({ error: 'session_not_found' });
    if (session.expiresAt < new Date()) return reply.code(401).send({ error: 'session_expired' });

    await app.prisma.authSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: new Date() } as any,
    });

    return reply.send({ ok: true });
  });

  /**
   * DELETE /sessions/:sessionId
   * Revoke a specific session.
   */
  app.delete('/:sessionId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { sessionId } = req.params as { sessionId: string };
    const session = await app.prisma.authSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) return reply.code(404).send({ error: 'session_not_found' });

    await app.prisma.authSession.delete({ where: { id: sessionId } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'SESSION_REVOKED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { sessionId },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ revoked: true });
  });

  /**
   * DELETE /sessions
   * Global logout — revoke ALL sessions for this user.
   */
  app.delete('/', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { count } = await app.prisma.authSession.deleteMany({ where: { userId } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'SESSION_REVOKED',
      category:     'AUTH',
      performedBy:  userId,
      metadata:     { reason: 'global_logout', sessionsRevoked: count },
      severity:     'INFO',
      isRegulatory: true,
    });

    return reply.send({ revoked: true, count });
  });
}
