import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';

import { env } from './config/env.js';
import { db } from './db/client.js';
import { authPlugin } from './middleware/auth.js';
import { bootstrapJobs } from './jobs/index.js';
import { initAisTracker, stopAisTracker } from './jobs/ais-tracker.js';

import { authRoutes } from './routes/auth.routes.js';
import { tenantRoutes } from './routes/tenant.routes.js';
import { shipmentRoutes } from './routes/shipments.routes.js';
import { customerRoutes } from './routes/customers.routes.js';
import { documentRoutes } from './routes/documents.routes.js';
import { financeRoutes } from './routes/finance.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { notificationRoutes } from './routes/notifications.routes.js';
import { webhookRoutes } from './routes/webhooks.routes.js';
import { declarationRoutes } from './routes/declarations.routes.js';
import { demurrageRoutes } from './routes/demurrage.routes.js';
import { quotationRoutes } from './routes/quotations.routes.js';
import { consignmentRoutes } from './routes/consignments.routes.js';
import { ocrRoutes } from './routes/ocr.routes.js';
import { hrRoutes } from './routes/hr.routes.js';
import { orgChartRoutes }   from './routes/org-chart.routes.js';
import { permissionsRoutes } from './routes/permissions.routes.js';
import { invoiceRoutes }  from './routes/invoices.routes.js';
import { billRoutes }     from './routes/bills.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { trackerRoutes, trackerPublicRoutes } from './routes/tracker.routes.js';
import { glRoutes } from './routes/gl.routes.js';
import { purchaseOrderRoutes } from './routes/purchase-orders.routes.js';
import { supplierRoutes } from './routes/suppliers.routes.js';
import { deliveryNoteRoutes } from './routes/delivery-notes.routes.js';
import { accountingIntegrationRoutes } from './routes/accounting-integration.routes.js';
import { nexusHRRoutes } from './routes/nexushr.routes.js';
import { contactsRoutes } from './routes/contacts.routes.js';
import { emailRoutes } from './routes/email.routes.js';
import { complyRoutes } from './routes/comply.routes.js';
import { superAdminRoutes } from './routes/superadmin.routes.js';
import { onboardingRoutes } from './routes/onboarding.routes.js';
import { packagesRoutes } from './routes/packages.routes.js';
import { traRoutes } from './routes/tra.routes.js';
import { customsRoutes } from './routes/customs.routes.js';
import { filesRoutes } from './routes/files.routes.js';
import { drivesRoutes } from './routes/drives.routes.js';
import supportRoutes from './routes/support.routes.js';
import { platformRoutes } from './routes/platform.routes.js';

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

    // 2. Decorators & Middlewares
    await server.register(authPlugin);

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
    await server.register(documentRoutes, { prefix: '/v1/documents' });
    await server.register(documentRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/documents/...
    await server.register(financeRoutes, { prefix: '/v1/finance' });
    await server.register(financeRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/expenses etc.
    await server.register(analyticsRoutes, { prefix: '/v1/analytics' });
    await server.register(notificationRoutes, { prefix: '/v1/notifications' });
    await server.register(webhookRoutes, { prefix: '/v1/webhooks' });
    await server.register(declarationRoutes, { prefix: '/v1/declarations' });
    await server.register(demurrageRoutes, { prefix: '/v1/demurrage' });
    await server.register(quotationRoutes, { prefix: '/v1/quotations' });
    await server.register(consignmentRoutes, { prefix: '/v1/consignments' });
    await server.register(tenantRoutes, { prefix: '/v1/tenants' });
    await server.register(superAdminRoutes, { prefix: '/v1/superadmin' });
    await server.register(ocrRoutes, { prefix: '/v1/ocr' });
    await server.register(hrRoutes, { prefix: '/v1/hr' });
    await server.register(orgChartRoutes,   { prefix: '/v1/org-chart' });
    await server.register(permissionsRoutes, { prefix: '/v1/permissions' });
    await server.register(invoiceRoutes,  { prefix: '/v1/invoices' });
    await server.register(billRoutes,     { prefix: '/v1/bills' });
    await server.register(settingsRoutes, { prefix: '/v1/settings' });
    await server.register(reportsRoutes, { prefix: '/v1/reports' });
    await server.register(aiRoutes, { prefix: '/v1/ai' });
    await server.register(trackerRoutes, { prefix: '/v1/tracker' });
    await server.register(trackerPublicRoutes, { prefix: '/v1/tracker' });
    await server.register(glRoutes, { prefix: '/v1/finance' });
    await server.register(purchaseOrderRoutes, { prefix: '/v1/purchase-orders' });
    await server.register(supplierRoutes, { prefix: '/v1/suppliers' });
    await server.register(deliveryNoteRoutes, { prefix: '/v1/delivery-notes' });
    await server.register(accountingIntegrationRoutes, { prefix: '/v1/accounting-integrations' });
    await server.register(nexusHRRoutes, { prefix: '/v1/hr' });
    await server.register(contactsRoutes, { prefix: '/v1/contacts' });
    await server.register(emailRoutes, { prefix: '/v1/email' });
    await server.register(complyRoutes, { prefix: '/v1/comply' });
    await server.register(onboardingRoutes, { prefix: '/v1/onboarding' });
    await server.register(packagesRoutes, { prefix: '/v1/packages' });
    await server.register(traRoutes, { prefix: '/v1/tra' });
    await server.register(customsRoutes, { prefix: '/v1/customs' });
    await server.register(filesRoutes, { prefix: '/v1/files' });
    await server.register(drivesRoutes, { prefix: '/v1/drives' });
    await server.register(supportRoutes, { prefix: '/v1/support' });
    await server.register(platformRoutes, { prefix: '/v1/platform' });

    // Health check
    server.get('/health', async () => {
      return { status: 'healthy', timestamp: new Date().toISOString() };
    });

    // 5. Start jobs scheduler
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
