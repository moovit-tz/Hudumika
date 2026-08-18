import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import { requireRole } from '../middleware/rbac.js';
import { withTenant } from '../db/client.js';

const PROVIDERS = ['XERO', 'SAGE', 'QUICKBOOKS', 'TALLY'] as const;
// Per-provider connection config (client_id/secret, org id, base_url, ...) —
// genuinely dynamic per provider and stored as opaque JSON by the service,
// so this is a shape-guard only, matching the pattern used for the other
// dynamic settings blobs in platform.routes.ts/settings.routes.ts.
const connectConfigSchema = z.record(z.string(), z.any());
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

  // POST /v1/accounting-integrations/:provider/connect
  fastify.post('/:provider/connect', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    const config = connectConfigSchema.parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.connect(tenantId, upperProvider as typeof PROVIDERS[number], config);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
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
      const result = await AccountingIntegrationService.disconnect(tenantId, upperProvider as typeof PROVIDERS[number]);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/:provider/sync
  fastify.post('/:provider/sync', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    const { provider } = request.params as { provider: string };
    const upperProvider = provider.toUpperCase();
    if (!(PROVIDERS as readonly string[]).includes(upperProvider)) {
      return reply.status(400).send({ error: `Unknown provider "${provider}"` });
    }
    try {
      const tenantId = request.user.tenant_id;
      const result = await AccountingIntegrationService.syncCOA(tenantId, upperProvider as typeof PROVIDERS[number]);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /v1/accounting-integrations/marketplace/:providerId/request
  // No real integration exists for any of these providers (Wave, FreshBooks,
  // Zoho, NetSuite, MYOB, Odoo, Stripe, Square, Flutterwave, M-Pesa, PayPal,
  // Airtel) — this just records the interest so a real person can follow up,
  // instead of a button that faked success with nothing persisted anywhere.
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

  // GET /v1/accounting-integrations/oauth-callback
  fastify.get('/oauth-callback', async (request: any, reply) => {
    // Simulated OAuth callback handler
    return reply.send({ success: true, message: 'OAuth Authorization Successful!' });
  });
}
