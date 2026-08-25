import type { FastifyInstance } from 'fastify';
import { getLatestFxRate } from '../services/fx-rate.service.js';

export async function fxRateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/fx-rates/latest?base=USD&quote=TZS — the frontend's "today's
  // rate: X — use this" prefill button reads this; it never auto-fills
  // silently (see editable_rates_mark_provenance precedent).
  fastify.get('/latest', async (request, reply) => {
    const { base, quote } = request.query as { base?: string; quote?: string };
    if (!base || !quote) return reply.status(400).send({ error: 'base and quote currency codes are required' });
    const result = await getLatestFxRate(base.toUpperCase(), quote.toUpperCase());
    if (!result) return reply.status(404).send({ error: `No published rate found for ${base}/${quote}.` });
    return result;
  });
}
