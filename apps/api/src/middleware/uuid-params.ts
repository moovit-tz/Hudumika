import type { FastifyInstance } from 'fastify';

// Any hex 8-4-4-4-12 value — exactly what Postgres' uuid type accepts, so a
// value that passes here can never trigger "invalid input syntax for type uuid".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_PARAM_RE = /^(id|[a-z]+Id)$/;

/**
 * Rejects a non-UUID value in any `:id` / `:somethingId` URL param with a 400
 * before the handler runs. Without it a malformed id goes straight into a
 * `.where('id', '=', id)` and Postgres throws — an opaque 500 at best, and the
 * raw driver text ("invalid input syntax for type uuid") in any file whose own
 * catch forwards `err.message`.
 *
 * Register it right after the plugin's `authenticate` hook, so an
 * unauthenticated caller still gets 401 rather than a 400. Only for plugins
 * whose `id`-style params are all UUIDs; params like `:type` are untouched.
 */
export function requireUuidParams(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request, reply) => {
    const params = request.params as Record<string, unknown> | undefined;
    if (!params) return;
    const bad = Object.entries(params).filter(
      ([name, value]) => ID_PARAM_RE.test(name) && (typeof value !== 'string' || !UUID_RE.test(value)),
    );
    if (bad.length === 0) return;
    return reply.status(400).send({
      error: 'Validation failed',
      details: bad.map(([field]) => ({ field, message: 'Invalid uuid' })),
    });
  });
}
