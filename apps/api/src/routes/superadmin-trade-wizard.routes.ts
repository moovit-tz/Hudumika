import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { tradeWizardAnalyticsService } from '../services/tradeWizardAnalytics.service.js';
import type { AnalyticsFilters } from '../services/tradeWizardAnalytics.service.js';

export async function superAdminTradeWizardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  function parseFilters(query: Record<string, any>): AnalyticsFilters {
    return { date_from: query.date_from, date_to: query.date_to, tenant_id: query.tenant_id };
  }

  fastify.get('/summary', async (request) => {
    return tradeWizardAnalyticsService.getSummary(parseFilters(request.query as any));
  });

  fastify.get('/top-search-terms', async (request) => {
    return tradeWizardAnalyticsService.getTopSearchTerms(parseFilters(request.query as any));
  });

  fastify.get('/top-procedures', async (request) => {
    return tradeWizardAnalyticsService.getTopProcedures(parseFilters(request.query as any));
  });

  fastify.get('/searches-by-kind', async (request) => {
    return tradeWizardAnalyticsService.getSearchesByKind(parseFilters(request.query as any));
  });

  fastify.get('/daily-trend', async (request) => {
    return tradeWizardAnalyticsService.getDailyTrend(parseFilters(request.query as any));
  });

  fastify.get('/by-tenant', async (request) => {
    return tradeWizardAnalyticsService.getByTenant(parseFilters(request.query as any));
  });

  fastify.get('/no-result-searches', async (request) => {
    return tradeWizardAnalyticsService.getNoResultSearches(parseFilters(request.query as any));
  });
}
