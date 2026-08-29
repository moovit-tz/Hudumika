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

export async function trustRoutes(app: FastifyInstance) {

  /**
   * GET /trust/score
   * Returns the current user's real trust score, tier, and signal breakdown.
   */
  app.get('/score', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const [profile, signals] = await Promise.all([
      app.prisma.trustProfile.findUnique({ where: { userId } }),
      app.prisma.trustSignal.findMany({ where: { userId }, orderBy: { timestamp: 'desc' }, take: 10 }),
    ]);

    return reply.send({
      score: profile?.currentScore ?? 300,
      trustTier: profile?.trustTier ?? 'LOW',
      breakdown: signals.map(s => ({
        label: s.type,
        score: Math.min(Math.round(s.value), 100),
        max: 100,
        description: `Reported by ${s.source}`,
      })),
    });
  });

  /**
   * GET /trust/history
   * Chronological score changes (oldest first) for the mobile app's trust-
   * velocity chart. Populated by the trust engine (recalculateTrust) every
   * time the score actually changes — a brand-new or rarely-recalculated
   * account may have few or zero points, which the client should render as
   * an honest "not enough history yet" state rather than padding with
   * fabricated data.
   */
  app.get('/history', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const limit = Math.min(Number(req.query?.limit) || 12, 50);

    const history = await app.prisma.scoreHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return reply.send({
      history: history.reverse().map(h => ({
        score: h.score,
        reason: h.reason,
        timestamp: h.timestamp,
      })),
    });
  });
}
