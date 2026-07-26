import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import { db } from './db/client.js';
import { authPlugin } from './middleware/auth.js';
import { bootstrapJobs } from './jobs/index.js';
import { bootstrapSubscribers } from './subscribers/index.js';
import { initAisTracker, stopAisTracker } from './jobs/ais-tracker.js';

import { authRoutes } from './routes/auth.routes.js';
import { tenantRoutes } from './routes/tenant.routes.js';
import { shipmentRoutes } from './routes/shipments.routes.js';
import { customerRoutes } from './routes/customers.routes.js';
import { leadsRoutes } from './routes/leads.routes.js';
import { workflowRoutes } from './routes/workflows.routes.js';
import { documentRoutes } from './routes/documents.routes.js';
import { financeRoutes } from './routes/finance.routes.js';
import { financeExpensesRoutes } from './routes/financeExpenses.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { notificationRoutes } from './routes/notifications.routes.js';
import { webhookRoutes } from './routes/webhooks.routes.js';
import { declarationRoutes } from './routes/declarations.routes.js';
import { referenceRoutes } from './routes/reference.routes.js';
import { demurrageRoutes } from './routes/demurrage.routes.js';
import { quotationRoutes } from './routes/quotations.routes.js';
import { freightBookingRoutes } from './routes/freight-booking.routes.js';
import { consignmentRoutes } from './routes/consignments.routes.js';
import { ocrRoutes } from './routes/ocr.routes.js';
import { hrRoutes } from './routes/hr.routes.js';
import { orgChartRoutes }   from './routes/org-chart.routes.js';
import { permissionsRoutes } from './routes/permissions.routes.js';
import { invoiceRoutes }  from './routes/invoices.routes.js';
import { paymentRoutes }  from './routes/payments.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { productRoutes }  from './routes/products.routes.js';
import { oneidRoutes }    from './routes/oneid.routes.js';
import { trackingRoutes } from './routes/tracking.routes.js';
import { fleetOpsRoutes } from './routes/fleetOps.routes.js';
import { fleetComplianceRoutes } from './routes/fleetCompliance.routes.js';
import { fleetCommsRoutes } from './routes/fleetComms.routes.js';
import { fleetAnalyticsRoutes } from './routes/fleetAnalytics.routes.js';
import { warehouseRoutes } from './routes/warehouse.routes.js';
import { cargoLoadingRoutes } from './routes/cargoLoading.routes.js';
import { vehicleDetailRoutes } from './routes/vehicleDetail.routes.js';
import { billRoutes }     from './routes/bills.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { trackerRoutes, trackerPublicRoutes } from './routes/tracker.routes.js';
import { cargoDashboardRoutes } from './routes/cargo-dashboard.routes.js';
import { glRoutes } from './routes/gl.routes.js';
import { purchaseOrderRoutes } from './routes/purchase-orders.routes.js';
import { supplierRoutes } from './routes/suppliers.routes.js';
import { deliveryNoteRoutes } from './routes/delivery-notes.routes.js';
import { accountingIntegrationRoutes } from './routes/accounting-integration.routes.js';
import { nexusHRRoutes } from './routes/nexushr.routes.js';
import { contactsRoutes } from './routes/contacts.routes.js';
import { emailRoutes } from './routes/email.routes.js';
import { complyRoutes } from './routes/comply.routes.js';
import { sealRoutes } from './routes/seal.routes.js';
import { sealDocumentRoutes } from './routes/seal-documents.routes.js';
import { sealExaminationRoutes } from './routes/seal-examinations.routes.js';
import { sealStockAccountRoutes } from './routes/seal-stock-account.routes.js';
import { sealWarehouseOpsRoutes } from './routes/seal-warehouse-ops.routes.js';
import { sealDeclarationRoutes } from './routes/seal-declarations.routes.js';
import { sealBillingRoutes } from './routes/seal-billing.routes.js';
import { sealCrmLinkRoutes } from './routes/seal-crm-link.routes.js';
import { sealTasksRoutes } from './routes/seal-tasks.routes.js';
import { sealEquipmentRoutes } from './routes/seal-equipment.routes.js';
import { sealSensorsRoutes } from './routes/seal-sensors.routes.js';
import { sealAutomationRoutes } from './routes/seal-automation.routes.js';
import { sealFulfillmentRoutes } from './routes/seal-fulfillment.routes.js';
import { sealLedgerAnchorRoutes } from './routes/seal-ledger-anchor.routes.js';
import { declarationLedgerAnchorRoutes } from './routes/declaration-ledger-anchor.routes.js';
import { inventoryCatalogRoutes } from './routes/inventory-catalog.routes.js';
import { inventoryStockRoutes } from './routes/inventory-stock.routes.js';
import { inventoryCountsRoutes } from './routes/inventory-counts.routes.js';
import { inventoryTasksRoutes } from './routes/inventory-tasks.routes.js';
import { cmsRoutes } from './routes/cms.routes.js';
import { complyOcrRoutes } from './routes/comply-ocr.routes.js';
import { complyLegalRoutes } from './routes/comply-legal.routes.js';
import { superAdminRoutes } from './routes/superadmin.routes.js';
import { superAdminReportsRoutes } from './routes/superadmin-reports.routes.js';
import { superAdminTradeWizardRoutes } from './routes/superadmin-trade-wizard.routes.js';
import { queryBuilderRoutes } from './routes/query-builder.routes.js';
import { onboardingRoutes } from './routes/onboarding.routes.js';
import { packagesRoutes } from './routes/packages.routes.js';
import { traRoutes } from './routes/tra.routes.js';
import { customsRoutes } from './routes/customs.routes.js';
import { tradeWizardRoutes } from './routes/trade-wizard.routes.js';
import { filesRoutes, filesPublicRoutes } from './routes/files.routes.js';
import { drivesRoutes } from './routes/drives.routes.js';
import supportRoutes from './routes/support.routes.js';
import { platformRoutes } from './routes/platform.routes.js';
import { entitlementsRoutes } from './routes/entitlements.routes.js';
import { apiKeysRoutes } from './routes/api-keys.routes.js';
import { storeRoutes } from './routes/store.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { tasksRoutes } from './routes/tasks.routes.js';
import { isMeteredPath, incrementUsage } from './lib/usage.js';

const server = fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
  // Default (1 MiB) is too small for base64-encoded image payloads (branding
  // logos/favicons, etc.) sent as plain JSON rather than multipart uploads.
  bodyLimit: 15 * 1024 * 1024, // 15 MiB
});

// Bootstrap fastify server setup
async function main() {
  try {
    // 1. Plugins
    await server.register(cors, {
      origin: env.CORS_ORIGINS.split(','),
      credentials: true,
    });

    await server.register(jwt, {
      secret: env.JWT_SECRET,
    });

    await server.register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    });

    await server.register(websocket);

    // Public/partner API layer — schema-driven docs + per-key/per-IP rate limiting.
    await server.register(swagger, {
      openapi: {
        info: { title: 'Hudumika API', version: '1.0.0', description: 'Internal + partner API for the Hudumika platform.' },
        servers: [{ url: `http://localhost:${env.APP_PORT}` }],
        components: {
          securitySchemes: {
            apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' },
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      },
    });
    await server.register(swaggerUi, {
      routePrefix: '/docs',
    });

    await server.register(rateLimit, {
      global: true,
      max: async (request: any) => (request.apiKeyScopes ? 300 : 1200), // partner API keys: 300/min; internal app sessions: 1200/min
      timeWindow: '1 minute',
      keyGenerator: (request: any) => request.headers['x-api-key'] || request.ip,
    });

    // 2. Decorators & Middlewares
    await server.register(authPlugin);

    // Usage tracking — every request that authenticated (session or API key) gets
    // one row here; feeds GET /v1/api-keys/usage and any future admin dashboard.
    server.addHook('onResponse', async (request, reply) => {
      const user = (request as any).user;
      if (!user?.tenant_id) return;
      const apiKeyId = user.sub?.startsWith('apikey:') ? user.sub.slice('apikey:'.length) : null;
      db.insertInto('api_usage_events').values({
        tenant_id: user.tenant_id,
        api_key_id: apiKeyId,
        method: request.method,
        path: request.routeOptions?.url || request.url,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime ?? 0),
      }).execute().catch(() => {});
    });

    // Monthly plan usage metering — counts successful item-creating POSTs
    // against the tenant's package cap. Enforcement (402 when over the cap)
    // happens earlier, in authenticate() (middleware/auth.ts), since that's
    // the one preHandler every route already runs; this just records the
    // count once we know the request actually succeeded.
    server.addHook('onResponse', async (request, reply) => {
      const user = (request as any).user;
      if (!user?.tenant_id) return;
      if (request.method !== 'POST') return;
      if (reply.statusCode < 200 || reply.statusCode >= 300) return;
      if (!isMeteredPath(request.routeOptions?.url || request.url)) return;
      incrementUsage(user.tenant_id).catch(() => {});
    });

    // 3. WebSocket handler
    server.get('/ws', { websocket: true }, (socket, req) => {
      server.log.info('🔌 WebSocket client connected');
      socket.on('message', (message: any) => {
        server.log.debug(`WebSocket message received: ${message}`);
      });
      socket.on('close', () => {
        server.log.info('🔌 WebSocket client disconnected');
      });
    });

    // 4. REST Routes
    await server.register(authRoutes, { prefix: '/auth' });
    await server.register(shipmentRoutes, { prefix: '/v1/shipments' });
    await server.register(customerRoutes, { prefix: '/v1/customers' });
    await server.register(leadsRoutes, { prefix: '/v1/leads' });
    await server.register(workflowRoutes, { prefix: '/v1/workflows' });
    await server.register(documentRoutes, { prefix: '/v1/documents' });
    await server.register(documentRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/documents/...
    await server.register(financeRoutes, { prefix: '/v1/finance' });
    await server.register(financeRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/expenses etc.
    await server.register(financeExpensesRoutes, { prefix: '/v1/finance' });
    await server.register(analyticsRoutes, { prefix: '/v1/analytics' });
    await server.register(notificationRoutes, { prefix: '/v1/notifications' });
    await server.register(webhookRoutes, { prefix: '/v1/webhooks' });
    await server.register(declarationRoutes, { prefix: '/v1/declarations' });
    await server.register(declarationLedgerAnchorRoutes, { prefix: '/v1/declarations' });
    await server.register(referenceRoutes, { prefix: '/v1/reference' });
    await server.register(demurrageRoutes, { prefix: '/v1/demurrage' });
    await server.register(quotationRoutes, { prefix: '/v1/quotations' });
    await server.register(freightBookingRoutes, { prefix: '/v1/freight-booking' });
    await server.register(consignmentRoutes, { prefix: '/v1/consignments' });
    await server.register(tenantRoutes, { prefix: '/v1/tenants' });
    await server.register(superAdminRoutes, { prefix: '/v1/superadmin' });
    await server.register(superAdminReportsRoutes, { prefix: '/v1/superadmin/reports' });
    await server.register(superAdminTradeWizardRoutes, { prefix: '/v1/superadmin/trade-wizard' });
    await server.register(queryBuilderRoutes, { prefix: '/v1/superadmin/query-builder' });
    await server.register(ocrRoutes, { prefix: '/v1/ocr' });
    await server.register(hrRoutes, { prefix: '/v1/hr' });
    await server.register(orgChartRoutes,   { prefix: '/v1/org-chart' });
    await server.register(permissionsRoutes, { prefix: '/v1/permissions' });
    await server.register(invoiceRoutes,  { prefix: '/v1/invoices' });
    await server.register(paymentRoutes,  { prefix: '/v1/payments' });
    await server.register(chatRoutes, { prefix: '/v1/chat' });
    await server.register(productRoutes,  { prefix: '/v1/products' });
    await server.register(oneidRoutes,    { prefix: '/v1/oneid' });
    await server.register(trackingRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetOpsRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetComplianceRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetCommsRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetAnalyticsRoutes, { prefix: '/v1/tracking' });
    await server.register(warehouseRoutes, { prefix: '/v1/tracking' });
    await server.register(cargoLoadingRoutes, { prefix: '/v1/tracking' });
    await server.register(vehicleDetailRoutes, { prefix: '/v1/tracking' });
    await server.register(billRoutes,     { prefix: '/v1/bills' });
    await server.register(settingsRoutes, { prefix: '/v1/settings' });
    await server.register(reportsRoutes, { prefix: '/v1/reports' });
    await server.register(aiRoutes, { prefix: '/v1/ai' });
    await server.register(trackerRoutes, { prefix: '/v1/tracker' });
    await server.register(trackerPublicRoutes, { prefix: '/v1/tracker' });
    await server.register(cargoDashboardRoutes, { prefix: '/v1/cargotracker/dashboard' });
    await server.register(glRoutes, { prefix: '/v1/finance' });
    await server.register(purchaseOrderRoutes, { prefix: '/v1/purchase-orders' });
    await server.register(supplierRoutes, { prefix: '/v1/suppliers' });
    await server.register(deliveryNoteRoutes, { prefix: '/v1/delivery-notes' });
    await server.register(accountingIntegrationRoutes, { prefix: '/v1/accounting-integrations' });
    await server.register(nexusHRRoutes, { prefix: '/v1/hr' });
    await server.register(contactsRoutes, { prefix: '/v1/contacts' });
    await server.register(emailRoutes, { prefix: '/v1/email' });
    await server.register(complyRoutes, { prefix: '/v1/comply' });
    await server.register(sealRoutes, { prefix: '/v1/seal' });
    await server.register(sealDocumentRoutes, { prefix: '/v1/seal' });
    await server.register(sealExaminationRoutes, { prefix: '/v1/seal' });
    await server.register(sealStockAccountRoutes, { prefix: '/v1/seal' });
    await server.register(sealWarehouseOpsRoutes, { prefix: '/v1/seal' });
    await server.register(sealDeclarationRoutes, { prefix: '/v1/seal' });
    await server.register(sealBillingRoutes, { prefix: '/v1/seal' });
    await server.register(sealCrmLinkRoutes, { prefix: '/v1/seal' });
    await server.register(sealTasksRoutes, { prefix: '/v1/seal' });
    await server.register(sealEquipmentRoutes, { prefix: '/v1/seal' });
    await server.register(sealSensorsRoutes, { prefix: '/v1/seal' });
    await server.register(sealAutomationRoutes, { prefix: '/v1/seal' });
    await server.register(sealFulfillmentRoutes, { prefix: '/v1/seal' });
    await server.register(sealLedgerAnchorRoutes, { prefix: '/v1/seal' });
    await server.register(inventoryCatalogRoutes, { prefix: '/v1/inventory' });
    await server.register(inventoryStockRoutes, { prefix: '/v1/inventory' });
    await server.register(inventoryCountsRoutes, { prefix: '/v1/inventory' });
    await server.register(inventoryTasksRoutes, { prefix: '/v1/inventory' });
    await server.register(cmsRoutes, { prefix: '/v1/cms' });
    await server.register(complyOcrRoutes, { prefix: '/v1/comply/ocr' });
    await server.register(complyLegalRoutes, { prefix: '/v1/comply/legal' });
    await server.register(onboardingRoutes, { prefix: '/v1/onboarding' });
    await server.register(packagesRoutes, { prefix: '/v1/packages' });
    await server.register(traRoutes, { prefix: '/v1/tra' });
    await server.register(customsRoutes, { prefix: '/v1/customs' });
    await server.register(tradeWizardRoutes, { prefix: '/v1/customs/trade-wizard' });
    await server.register(filesRoutes, { prefix: '/v1/files' });
    await server.register(filesPublicRoutes, { prefix: '/v1/files-public' });
    await server.register(drivesRoutes, { prefix: '/v1/drives' });
    await server.register(supportRoutes, { prefix: '/v1/support' });
    await server.register(platformRoutes, { prefix: '/v1/platform' });
    await server.register(entitlementsRoutes, { prefix: '/v1/entitlements' });
    await server.register(apiKeysRoutes, { prefix: '/v1/api-keys' });
    await server.register(storeRoutes, { prefix: '/v1/store' });
    await server.register(searchRoutes, { prefix: '/v1/search' });
    await server.register(tasksRoutes, { prefix: '/v1/tasks' });

    // Health check
    server.get('/health', async () => {
      return { status: 'healthy', timestamp: new Date().toISOString() };
    });

    // 5. Start jobs scheduler
    bootstrapSubscribers();
    await bootstrapJobs();
    await initAisTracker();

    // 6. Listen
    const port = env.APP_PORT;
    const address = await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`🚀 Hudumika API Server running on ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful Shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    server.log.info(`🛑 Received ${signal}, starting graceful shutdown...`);
    try {
      await server.close();
      await db.destroy();
      stopAisTracker();
      server.log.info('👋 Graceful shutdown complete.');
      process.exit(0);
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  });
}

main();
export { server };
