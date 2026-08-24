import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccountingIntegrationService, type AccountingProvider } from '../services/accounting-integration.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';

const PROVIDERS: AccountingProvider[] = ['QUICKBOOKS', 'XERO'];
const marketplaceRequestSchema = z.object({ providerName: z.string().trim().min(1).max(200) });

export async function accountingIntegrationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

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

  // POST /v1/accounting-integrations/:provider/disconnect
  fastify.post('/:provider/disconnect', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.disconnect(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/test-connection — a real
  // call to the provider's own company-info/organisation endpoint, proving
  // the stored token actually works. Replaces the old Connect flow, which
  // validated nothing at all (it just stored whatever JSON was posted).
  fastify.post('/:provider/test-connection', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.testConnection(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/sync — pulls the provider's
  // REAL chart of accounts as a read-only mirror. No longer writes
  // anything into the tenant's own chart_of_accounts.
  fastify.post('/:provider/sync', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.syncCOA(tenantId, upperProvider as AccountingProvider);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/marketplace/:providerId/request
  // No real integration exists for any of these providers (Wave, FreshBooks,
  // Zoho, NetSuite, MYOB, Odoo, Stripe, Square, Flutterwave, M-Pesa, PayPal,
  // Airtel, and now also Sage/Tally — downgraded here from a fake connect
  // flow that never called anything real) — this just records the interest
  // so a real person can follow up.
  fastify.post('/marketplace/:providerId/request', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { providerId } = request.params as { providerId: string };
    const { providerName } = marketplaceRequestSchema.parse(request.body);

    const row = await withTenant(tenantId, trx => trx.insertInto('accounting_marketplace_requests').values({
      tenant_id: tenantId,
      provider_id: providerId,
      provider_name: providerName,
      requested_by: request.user.sub,
    }).returningAll().executeTakeFirstOrThrow());
    reply.status(201);
    return row;
  });
}
