import type { FastifyInstance } from 'fastify';
import { requireEntitlement } from '../middleware/entitlement.js';
import { cargoAnalyticsService } from '../services/cargoAnalytics.service.js';
import { demurrageService } from '../services/demurrage.service.js';

/**
 * Analytics layer that merges CargoTracker (tracking_snapshots) and
 * Demurrage (container_tracking) into one dashboard. The cargotracker-gated
 * endpoints below are safe for any tenant with tracking enabled; the
 * demurrage-gated ones are a separate entitlement (see requireEntitlement),
 * so the frontend must handle a 403 on those gracefully rather than
 * crashing the whole dashboard.
 */
export async function cargoDashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  const cargoGate = requireEntitlement('cargotracker');
  const demurrageGate = requireEntitlement('demurrage');

  fastify.get('/summary', { preHandler: cargoGate }, async (request) => {
    return cargoAnalyticsService.getSummary(request.user.tenant_id);
  });

  fastify.get('/carrier-analysis', { preHandler: cargoGate }, async (request) => {
    return cargoAnalyticsService.getCarrierAnalysis(request.user.tenant_id);
  });

  fastify.get('/lane-analysis', { preHandler: cargoGate }, async (request) => {
    return cargoAnalyticsService.getLaneAnalysis(request.user.tenant_id);
  });

  fastify.get('/regional-analysis', { preHandler: cargoGate }, async (request) => {
    return cargoAnalyticsService.getRegionalAnalysis(request.user.tenant_id);
  });

  fastify.get('/demurrage-analysis', { preHandler: demurrageGate }, async (request) => {
    const [summary, trend] = await Promise.all([
      demurrageService.getSummary(request.user.tenant_id),
      cargoAnalyticsService.getDemurrageTrend(request.user.tenant_id),
    ]);
    return { ...summary, monthly_trend: trend };
  });

  fastify.get('/shipment/:shipmentId/containers', { preHandler: demurrageGate }, async (request) => {
    const { shipmentId } = request.params as { shipmentId: string };
    return demurrageService.listContainers(request.user.tenant_id, { shipment_id: shipmentId });
  });
}
