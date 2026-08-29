import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';

export async function scoreRoutes(app: FastifyInstance) {
  app.get('/:userId', async (req: any, reply) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer '))
      return reply.code(401).send({ error: 'missing_token' });

    let payload: any;
    try {
      payload = jwt.verify(
        authHeader.slice(7),
        JWT_SECRET,
        { issuer: JWT_ISSUER },
      );
    } catch {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    const { userId } = req.params;
    if (payload.sub !== userId)
      return reply.code(403).send({ error: 'forbidden' });

    const score = await app.prisma.scoreHistory.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' }
    });
    return score || { personalScore: 0 };
  });
}
