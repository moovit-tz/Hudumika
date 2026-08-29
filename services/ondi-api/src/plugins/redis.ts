import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

/**
 * Shared Redis connection — backs the ephemeral session/challenge stores
 * (PKCE, push-approval, step-up, MFA challenge, device pairing) that used to
 * live in per-process Map objects. Those Maps didn't survive a restart and
 * blocked horizontal scaling (a challenge created on instance A was invisible
 * to instance B). Redis fixes both.
 */
export const redisPlugin = fp(async (app) => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  redis.on('error', (err: Error) => app.log.error(err, 'Redis connection error'));

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}
