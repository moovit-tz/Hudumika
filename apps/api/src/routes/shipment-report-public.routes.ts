/**
 * Public, unauthenticated shipment-report share page — what the WhatsApp
 * link from the daily automation (daily-shipment-report.job.ts) points at.
 *
 * Registered as its own plugin at the same `/v1/shipments` prefix as the
 * authenticated shipmentRoutes, exactly like trackerPublicRoutes sits
 * alongside trackerRoutes at `/v1/tracker` — shipmentRoutes applies
 * fastify.authenticate to every route in its own plugin, so a public route
 * cannot live there.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPublicSharedReport } from '../services/shipment-report.service.js';

export async function shipmentReportPublicRoutes(fastify: FastifyInstance) {
  // GET /v1/shipments/shared/:token
  fastify.get('/shared/:token', async (req: FastifyRequest, reply) => {
    const { token } = req.params as { token: string };
    const data = await getPublicSharedReport(token);
    if (!data) return reply.status(404).send({ error: 'This report link is not valid.' });
    return data;
  });
}
