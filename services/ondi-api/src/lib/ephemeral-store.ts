import type { FastifyInstance } from 'fastify';

/**
 * Redis-backed replacement for the in-process Map-based session/challenge
 * stores that used to live in route closures (PKCE, push-approval, step-up,
 * MFA challenge, device pairing). Those Maps didn't survive a restart and
 * silently diverged across instances under horizontal scaling. JSON-serializes
 * values and uses native Redis TTL instead of manual timestamp bookkeeping —
 * an expired entry simply isn't there anymore, no pruning function needed.
 *
 * `index` is an optional secondary lookup (e.g. pairing code → pairing id,
 * phone number → session ids) backed by a Redis SET per index value.
 */
export function createEphemeralStore<T>(app: FastifyInstance, prefix: string) {
  const key = (id: string) => `ephemeral:${prefix}:${id}`;
  const indexKey = (indexValue: string) => `ephemeral:${prefix}:by:${indexValue}`;

  return {
    async set(id: string, value: T, ttlSeconds: number): Promise<void> {
      await app.redis.set(key(id), JSON.stringify(value), 'EX', ttlSeconds);
    },
    async get(id: string): Promise<T | null> {
      const raw = await app.redis.get(key(id));
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async delete(id: string): Promise<void> {
      await app.redis.del(key(id));
    },
    /** Seconds until expiry, or -2 if the entry doesn't exist / already expired. */
    async ttl(id: string): Promise<number> {
      return app.redis.ttl(key(id));
    },
    index: {
      async add(indexValue: string, id: string, ttlSeconds: number): Promise<void> {
        const ik = indexKey(indexValue);
        await app.redis.sadd(ik, id);
        await app.redis.expire(ik, ttlSeconds);
      },
      async members(indexValue: string): Promise<string[]> {
        return app.redis.smembers(indexKey(indexValue));
      },
    },
  };
}
