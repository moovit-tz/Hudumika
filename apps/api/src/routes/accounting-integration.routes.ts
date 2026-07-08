import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import { requireRole } from '../middleware/rbac.js';

export async function accountingIntegrationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('finops'));

  // GET /v1/accounting-integrations
  fastify.get('/', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const status = await AccountingIntegrationService.getIntegrations(tenantId);
      return status;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/connect
  fastify.post('/:provider/connect', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { provider } = request.params as { provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY' };
      const config = request.body;

      const upperProvider = provider.toUpperCase() as 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY';
      const result = await AccountingIntegrationService.connect(tenantId, upperProvider, config);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/disconnect
  fastify.post('/:provider/disconnect', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { provider } = request.params as { provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY' };

      const upperProvider = provider.toUpperCase() as 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY';
      const result = await AccountingIntegrationService.disconnect(tenantId, upperProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/sync
  fastify.post('/:provider/sync', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { provider } = request.params as { provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY' };

      const upperProvider = provider.toUpperCase() as 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY';
      const result = await AccountingIntegrationService.syncCOA(tenantId, upperProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /v1/accounting-integrations/oauth-callback
  fastify.get('/oauth-callback', async (request: any, reply) => {
    // Simulated OAuth callback handler
    return reply.send({ success: true, message: 'OAuth Authorization Successful!' });
  });
}
