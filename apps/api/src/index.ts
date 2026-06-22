import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';

import { env } from './config/env.js';
import { db } from './db/client.js';
import { authPlugin } from './middleware/auth.js';
import { bootstrapJobs } from './jobs/index.js';

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

const server = fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
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
    await server.register(ocrRoutes, { prefix: '/v1/ocr' });
    await server.register(hrRoutes, { prefix: '/v1/hr' });
    await server.register(orgChartRoutes,   { prefix: '/v1/org-chart' });
    await server.register(permissionsRoutes, { prefix: '/v1/permissions' });
    await server.register(invoiceRoutes,  { prefix: '/v1/invoices' });
    await server.register(billRoutes,     { prefix: '/v1/bills' });
    await server.register(settingsRoutes, { prefix: '/v1/settings' });
    await server.register(reportsRoutes, { prefix: '/v1/reports' });

    // Health check
    server.get('/health', async () => {
      return { status: 'healthy', timestamp: new Date().toISOString() };
    });

    // 5. Start jobs scheduler
    await bootstrapJobs();

    // 6. Listen
    const port = env.APP_PORT;
    const address = await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`🚀 ClearOS API Server running on ${address}`);
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
