import fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import { db } from './db/client.js';
import { authPlugin } from './middleware/auth.js';
import { extractToken } from './lib/cookies.js';
import { bootstrapJobs } from './jobs/index.js';
import { bootstrapSubscribers } from './subscribers/index.js';
import { workflowEngineRoutes } from './routes/workflow-engine.routes.js';
import { registerBuiltInEntityProviders } from './services/entity-providers.js';
import { initAisTracker, stopAisTracker } from './jobs/ais-tracker.js';

import { authRoutes } from './routes/auth.routes.js';
import { tenantRoutes } from './routes/tenant.routes.js';
import { shipmentRoutes } from './routes/shipments.routes.js';
import { customerRoutes } from './routes/customers.routes.js';
import { leadsRoutes } from './routes/leads.routes.js';
import { crmSearchRoutes } from './routes/crm-search.routes.js';
import { workflowRoutes } from './routes/workflows.routes.js';
import { workflowTemplateRoutes } from './routes/workflow-templates.routes.js';
import { documentRoutes } from './routes/documents.routes.js';
import { financeRoutes } from './routes/finance.routes.js';
import { financeExpensesRoutes } from './routes/financeExpenses.routes.js';
import { pettiRoutes } from './routes/petti.routes.js';
import { notesRoutes } from './routes/notes.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { notificationRoutes } from './routes/notifications.routes.js';
import { webhookRoutes } from './routes/webhooks.routes.js';
import { declarationRoutes } from './routes/declarations.routes.js';
import { referenceRoutes } from './routes/reference.routes.js';
import { sanctionsRoutes } from './routes/sanctions.routes.js';
import { dangerousGoodsRoutes } from './routes/dangerous-goods.routes.js';
import { deliveryDocumentsRoutes } from './routes/delivery-documents.routes.js';
import { depotRoutes } from './routes/depot.routes.js';
import { demurrageRoutes } from './routes/demurrage.routes.js';
import { quotationRoutes } from './routes/quotations.routes.js';
import { freightBookingRoutes } from './routes/freight-booking.routes.js';
import { rateCardRoutes } from './routes/rate-card.routes.js';
import { consignmentRoutes } from './routes/consignments.routes.js';
import { ocrRoutes } from './routes/ocr.routes.js';
import { hrRoutes } from './routes/hr.routes.js';
import { attendanceDevicesRoutes } from './routes/attendance-devices.routes.js';
import { deviceIngestRoutes } from './routes/device-ingest.routes.js';
import { presenceRoutes } from './routes/presence.routes.js';
import { callsRoutes, callsPublicRoutes } from './routes/calls.routes.js';
import { payrollRoutes } from './routes/payroll.routes.js';
import { identityRoutes } from './routes/identity.routes.js';
import { calendarRoutes } from './routes/calendar.routes.js';
import { leaveRoutes } from './routes/leave.routes.js';
import { overtimeRoutes } from './routes/overtime.routes.js';
import { activityRoutes } from './routes/activity.routes.js';
import { activityMonitorRoutes } from './routes/activity-monitor.routes.js';
import { orgChartRoutes }   from './routes/org-chart.routes.js';
import { permissionsRoutes } from './routes/permissions.routes.js';
import { invoiceRoutes }  from './routes/invoices.routes.js';
import { creditNoteRoutes } from './routes/credit-notes.routes.js';
import { fixedAssetRoutes } from './routes/fixed-assets.routes.js';
import { budgetRoutes } from './routes/budgets.routes.js';
import { bankReconciliationRoutes } from './routes/bank-reconciliation.routes.js';
import { fxRateRoutes } from './routes/fx-rates.routes.js';
import { glPeriodRoutes } from './routes/gl-periods.routes.js';
import { paymentRoutes }  from './routes/payments.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { productRoutes }  from './routes/products.routes.js';
import { taxCodeRoutes }  from './routes/tax-codes.routes.js';
import { vatPeriodRoutes } from './routes/vat-periods.routes.js';
import { lensRoutes } from './routes/lens.routes.js';
import { oneidRoutes }    from './routes/oneid.routes.js';
import { ondiAuthRoutes } from './routes/ondi-auth.routes.js';
import { ondiSamlRoutes } from './routes/ondi-saml.routes.js';
import { ondiOauthRoutes } from './routes/ondi-oauth.routes.js';
import { oidcDiscoveryRoutes } from './routes/oidc-discovery.routes.js';
import { trackingRoutes } from './routes/tracking.routes.js';
import { fleetOpsRoutes } from './routes/fleetOps.routes.js';
import { fleetComplianceRoutes } from './routes/fleetCompliance.routes.js';
import { fleetCommsRoutes } from './routes/fleetComms.routes.js';
import { fleetAnalyticsRoutes } from './routes/fleetAnalytics.routes.js';
import { warehouseRoutes } from './routes/warehouse.routes.js';
import { cargoLoadingRoutes } from './routes/cargoLoading.routes.js';
import { vehicleDetailRoutes } from './routes/vehicleDetail.routes.js';
import { billRoutes }     from './routes/bills.routes.js';
import { whtRoutes }      from './routes/wht.routes.js';
import { citRoutes }      from './routes/cit.routes.js';
import { deferredTaxRoutes } from './routes/deferred-tax.routes.js';
import { dividendRoutes } from './routes/dividends.routes.js';
import { fxRevaluationRoutes } from './routes/fx-revaluation.routes.js';
import { apApprovalWorkflowRoutes } from './routes/ap-approval-workflows.routes.js';
import { customerCreditRoutes } from './routes/customer-credits.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { mailOAuthRoutes } from './routes/mail-oauth.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { trackerRoutes, trackerPublicRoutes } from './routes/tracker.routes.js';
import { cargoDashboardRoutes } from './routes/cargo-dashboard.routes.js';
import { glRoutes } from './routes/gl.routes.js';
import { purchaseOrderRoutes } from './routes/purchase-orders.routes.js';
import { supplierRoutes } from './routes/suppliers.routes.js';
import { accountingIntegrationRoutes } from './routes/accounting-integration.routes.js';
import { accountingOAuthRoutes } from './routes/accounting-oauth.routes.js';
import { nexusHRRoutes } from './routes/nexushr.routes.js';
import { contactsRoutes } from './routes/contacts.routes.js';
import { contactsSyncRoutes } from './routes/contacts-sync.routes.js';
import { emailRoutes, emailSendRoutes } from './routes/email.routes.js';
import { emailTemplatesRoutes } from './routes/email-templates.routes.js';
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
import { hudubiRoutes } from './routes/hudubi.routes.js';
import { cmsRoutes } from './routes/cms.routes.js';
import { complyOcrRoutes } from './routes/comply-ocr.routes.js';
import { complyLegalRoutes } from './routes/comply-legal.routes.js';
import { superAdminRoutes } from './routes/superadmin.routes.js';
import { superAdminSigningCertRoutes } from './routes/superadmin-signing-cert.routes.js';
import { superAdminReportsRoutes } from './routes/superadmin-reports.routes.js';
import { superAdminTradeWizardRoutes } from './routes/superadmin-trade-wizard.routes.js';
import { superAdminIssuesRoutes } from './routes/superadmin-issues.routes.js';
import { superAdminKybRoutes } from './routes/superadmin-kyb.routes.js';
import { superAdminReferralsRoutes } from './routes/superadmin-referrals.routes.js';
import { referralsRoutes } from './routes/referrals.routes.js';
import { announcementRoutes, superAdminAnnouncementRoutes, tenantAnnouncementRoutes } from './routes/announcements.routes.js';
import { intelligenceRoutes } from './routes/intelligence.routes.js';
import { queryBuilderRoutes } from './routes/query-builder.routes.js';
import { onboardingRoutes } from './routes/onboarding.routes.js';
import { packagesRoutes } from './routes/packages.routes.js';
import { addonsRoutes } from './routes/addons.routes.js';
import { traRoutes } from './routes/tra.routes.js';
import { customsRoutes } from './routes/customs.routes.js';
import { advancedCalculatorRoutes } from './routes/advanced-calculators.routes.js';
import { tradeWizardRoutes } from './routes/trade-wizard.routes.js';
import { filesRoutes, filesPublicRoutes } from './routes/files.routes.js';
import { drivesRoutes } from './routes/drives.routes.js';
import { orgRoutes } from './routes/org.routes.js';
import { organizationsRoutes } from './routes/organizations.routes.js';
import supportRoutes from './routes/support.routes.js';
import { platformRoutes } from './routes/platform.routes.js';
import { landedCostShareRoutes } from './routes/landed-cost-share.routes.js';
import { shipmentReportPublicRoutes } from './routes/shipment-report-public.routes.js';
import { entitlementsRoutes } from './routes/entitlements.routes.js';
import { apiKeysRoutes } from './routes/api-keys.routes.js';
import { storeRoutes } from './routes/store.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { workspaceCockpitRoutes } from './routes/workspace-cockpit.routes.js';
import { tasksRoutes } from './routes/tasks.routes.js';
import { taskProjectsRoutes } from './routes/task-projects.routes.js';
import { contractsRoutes } from './routes/contracts.routes.js';
import securityRoutes from './routes/security.routes.js';
import billingRoutes from './routes/billing.routes.js';
import platformSupportRoutes from './routes/platform-support.routes.js';
import publicSupportRoutes from './routes/public-support.routes.js';
import { workflowStudioRoutes } from './routes/workflow-studio.routes.js';
import { onsiteRoutes } from './routes/onsite.routes.js';
import { onsiteAgencyRoutes } from './routes/onsite-agency.routes.js';
import { onsiteAgencyManageRoutes } from './routes/onsite-agency-manage.routes.js';
import { onsitePlanRoutes } from './routes/onsite-plan.routes.js';
import { onsiteAgencyClientRoutes } from './routes/onsite-agency-client.routes.js';
import { onsiteAgencyDirectoryPublicRoutes, onsiteAgencyDirectoryManageRoutes } from './routes/onsite-agency-directory.routes.js';
import { onsiteBackupsRoutes } from './routes/onsite-backups.routes.js';
import { isMeteredPath, incrementUsage, incrementAppUsage } from './lib/usage.js';
import { signRoutes, signPublicRoutes } from './routes/sign.routes.js';
import { signStampsRoutes } from './routes/sign-stamps.routes.js';
import { signVersionsRoutes } from './routes/sign-versions.routes.js';
import { signPdfToolsRoutes } from './routes/sign-pdf-tools.routes.js';
import { bookingPublicRoutes } from './routes/booking.routes.js';
import { calendarSyncRoutes } from './routes/calendar-sync.routes.js';
import { smsRoutes, smsWebhookRoutes } from './routes/sms.routes.js';
import { setupGuideRoutes } from './routes/setup-guide.routes.js';

const server = fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
  // Default (1 MiB) is too small for base64-encoded image payloads (branding
  // logos/favicons, etc.) sent as plain JSON rather than multipart uploads.
  bodyLimit: 15 * 1024 * 1024, // 15 MiB
  // Deployment is a single VPS with nginx terminating TLS and reverse-proxying
  // to this app on localhost — so the peer address Node sees on every request
  // is nginx's own loopback address, never the visitor's. Without this, every
  // request looks like it came from 127.0.0.1: the per-IP rate limits below
  // (login, forgot-password, etc.) would either lump every real visitor into
  // one shared bucket or, worse, be trivially bypassable by whoever's first.
  // 'loopback' (127.0.0.1/8, ::1/128) means X-Forwarded-For is only honoured
  // when the immediate connection is from localhost — i.e. only when it
  // actually came through nginx — so it can't be spoofed by a request that
  // reaches the app directly from the public internet.
  trustProxy: 'loopback',
});

// Bootstrap fastify server setup
async function main() {
  try {
    // 1. Plugins

    // Security headers on every response. CSP is left off for now rather than
    // guessed at — this server also hosts Swagger UI at /docs (inline
    // scripts/styles), and a wrong CSP would silently break the docs page
    // with no error anywhere but the browser console. nosniff/frameguard/HSTS
    // carry real value with zero compatibility risk; CSP is a follow-up once
    // it's been tuned against /docs specifically.
    await server.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // the SPA on a different origin fetches this API directly
    });

    await server.register(cors, {
      origin: env.CORS_ORIGINS.split(','),
      credentials: true,
    });

    // Registered before `jwt` so `request.cookies` is populated by the time
    // any custom JWT extractor reads it. Unsigned: the JWT payload itself is
    // already signed/tamper-evident, no need for a second cookie-signing secret.
    await server.register(cookie);

    await server.register(jwt, {
      secret: env.JWT_SECRET,
      verify: { extractToken },
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

    // A route validating its body/params with a zod schema throws ZodError on
    // bad input — without this handler Fastify's default catch-all treats it
    // as an unhandled 500 (wrong status code, and in dev mode leaks the raw
    // Zod issue structure/stack). One handler here means every route that
    // adopts zod gets a clean 400 for free, rather than each call site
    // needing its own try/catch around .parse().
    server.setErrorHandler((error, request, reply) => {
      if (error.name === 'ZodError') {
        const zodError = error as unknown as { issues: { path: (string | number)[]; message: string }[] };
        return reply.status(400).send({
          error: 'Validation failed',
          details: zodError.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
        });
      }
      return reply.send(error);
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
    // count once we know the request actually succeeded. The per-app counter
    // (request.meteredAppId, stashed by requireEntitlement()'s checkEntitlement
    // in middleware/entitlement.ts) only exists for requests that passed
    // through an entitlement check — most of the platform, but not every
    // unguarded route — same enforcement point as the per-app quota itself.
    server.addHook('onResponse', async (request, reply) => {
      const user = (request as any).user;
      if (!user?.tenant_id) return;
      if (request.method !== 'POST') return;
      if (reply.statusCode < 200 || reply.statusCode >= 300) return;
      if (!isMeteredPath(request.routeOptions?.url || request.url)) return;
      incrementUsage(user.tenant_id).catch(() => {});
      const appId = request.meteredAppId;
      if (appId) incrementAppUsage(user.tenant_id, appId).catch(() => {});
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
    await server.register(authRoutes, { prefix: '/v1/auth' });
    await server.register(shipmentRoutes, { prefix: '/v1/shipments' });
    await server.register(shipmentReportPublicRoutes, { prefix: '/v1/shipments' });
    await server.register(customerRoutes, { prefix: '/v1/customers' });
    await server.register(leadsRoutes, { prefix: '/v1/leads' });
    await server.register(crmSearchRoutes, { prefix: '/v1/crm' });
    await server.register(workflowRoutes, { prefix: '/v1/workflows' });
    await server.register(documentRoutes, { prefix: '/v1/documents' });
    await server.register(documentRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/documents/...
    await server.register(financeRoutes, { prefix: '/v1/finance' });
    await server.register(financeRoutes, { prefix: '/v1/shipments' }); // alias: frontend uses /v1/shipments/:id/expenses etc.
    await server.register(financeExpensesRoutes, { prefix: '/v1/finance' });
    await server.register(pettiRoutes, { prefix: '/v1/petti' });
    await server.register(notesRoutes, { prefix: '/v1/notes' });
    await server.register(analyticsRoutes, { prefix: '/v1/analytics' });
    await server.register(notificationRoutes, { prefix: '/v1/notifications' });
    await server.register(webhookRoutes, { prefix: '/v1/webhooks' });
    await server.register(declarationRoutes, { prefix: '/v1/declarations' });
    await server.register(declarationLedgerAnchorRoutes, { prefix: '/v1/declarations' });
    await server.register(referenceRoutes, { prefix: '/v1/reference' });
    await server.register(sanctionsRoutes, { prefix: '/v1/sanctions' });
    await server.register(dangerousGoodsRoutes, { prefix: '/v1/dangerous-goods' });
    await server.register(deliveryDocumentsRoutes, { prefix: '/v1/delivery-documents' });
    await server.register(depotRoutes, { prefix: '/v1/depot' });
    await server.register(demurrageRoutes, { prefix: '/v1/demurrage' });
    await server.register(quotationRoutes, { prefix: '/v1/quotations' });
    await server.register(freightBookingRoutes, { prefix: '/v1/freight-booking' });
    await server.register(rateCardRoutes, { prefix: '/v1/rate-card' });
    await server.register(landedCostShareRoutes, { prefix: '/v1/landed-cost-shares' });
    await server.register(consignmentRoutes, { prefix: '/v1/consignments' });
    await server.register(tenantRoutes, { prefix: '/v1/tenants' });
    await server.register(superAdminRoutes, { prefix: '/v1/superadmin' });
    await server.register(superAdminSigningCertRoutes, { prefix: '/v1/superadmin' });
    await server.register(superAdminReportsRoutes, { prefix: '/v1/superadmin/reports' });
    await server.register(superAdminTradeWizardRoutes, { prefix: '/v1/superadmin/trade-wizard' });
    await server.register(superAdminIssuesRoutes, { prefix: '/v1/superadmin' });
    await server.register(superAdminKybRoutes, { prefix: '/v1/superadmin' });
    await server.register(superAdminReferralsRoutes, { prefix: '/v1/superadmin/referrals' });
    await server.register(referralsRoutes, { prefix: '/v1/referrals' });
    await server.register(superAdminAnnouncementRoutes, { prefix: '/v1/superadmin/announcements' });
    await server.register(workflowTemplateRoutes, { prefix: '/v1/superadmin/workflow-templates' });
    await server.register(announcementRoutes, { prefix: '/v1/announcements' });
    // A workspace posting notices to its own staff, distinct from the platform's.
    await server.register(tenantAnnouncementRoutes, { prefix: '/v1/workspace/announcements' });
    await server.register(intelligenceRoutes, { prefix: '/v1/intel' });
    await server.register(queryBuilderRoutes, { prefix: '/v1/superadmin/query-builder' });
    await server.register(ocrRoutes, { prefix: '/v1/ocr' });
    await server.register(hrRoutes, { prefix: '/v1/hr' });
    // Own sub-prefix, not bare /v1/hr — hr.routes.ts's GET /devices is a
    // different, pre-existing concept (login/session device tracking,
    // hr_devices/040_hr_teams_invites_audit.sql), and registering the same
    // path twice under one prefix is a Fastify boot-time duplicate-route error.
    await server.register(attendanceDevicesRoutes, { prefix: '/v1/hr/attendance-devices' });
    // Device-facing ADMS push endpoints — genuinely unauthenticated (a
    // biometric terminal carries no JWT), device-authenticated instead by
    // serial+token (device-ingest.routes.ts). Bare /iclock, not /v1/... —
    // real ZKTeco firmware in Cloud/ADMS mode always appends /iclock/... to
    // whatever base "Server URL" a tenant types into the unit's own menu.
    await server.register(deviceIngestRoutes, { prefix: '/iclock' });
    await server.register(presenceRoutes, { prefix: '/v1/presence' });
    // Calls (1:1 + group meetings) moved to Bliss, matching chatRoutes/supportRoutes'
    // own topic-based prefix convention rather than an app-namespaced one.
    await server.register(callsRoutes, { prefix: '/v1/calls' });
    // Guest ("join like Zoom/Meet/Teams") meeting access — genuinely
    // unauthenticated, its own prefix so it can never inherit a preHandler
    // meant for /v1/calls's authenticated routes.
    await server.register(callsPublicRoutes, { prefix: '/v1/calls-public' });
    await server.register(payrollRoutes, { prefix: '/v1/payroll' });
    // Shared across every app: who a person is, and whether the country is open.
    await server.register(identityRoutes, { prefix: '/v1/identity' });
    await server.register(calendarRoutes, { prefix: '/v1/calendar' });
    await server.register(leaveRoutes, { prefix: '/v1/hr' });
    await server.register(overtimeRoutes, { prefix: '/v1/hr' });
    // One per-record activity trail for every app, read from domain_events.
    await server.register(activityRoutes, { prefix: '/v1/activity' });
    await server.register(activityMonitorRoutes, { prefix: '/v1/activity-monitor' });
    await server.register(workflowEngineRoutes, { prefix: '/v1/workflow-engine' });
    await server.register(orgChartRoutes,   { prefix: '/v1/org-chart' });
    await server.register(permissionsRoutes, { prefix: '/v1/permissions' });
    await server.register(invoiceRoutes,  { prefix: '/v1/invoices' });
    await server.register(creditNoteRoutes, { prefix: '/v1/credit-notes' });
    await server.register(fixedAssetRoutes, { prefix: '/v1/fixed-assets' });
    await server.register(budgetRoutes, { prefix: '/v1/budgets' });
    await server.register(bankReconciliationRoutes, { prefix: '/v1/bank-reconciliation' });
    await server.register(fxRateRoutes, { prefix: '/v1/fx-rates' });
    await server.register(glPeriodRoutes, { prefix: '/v1/finance/gl-periods' });
    await server.register(paymentRoutes,  { prefix: '/v1/payments' });
    await server.register(chatRoutes, { prefix: '/v1/chat' });
    await server.register(productRoutes,  { prefix: '/v1/products' });
    await server.register(taxCodeRoutes,  { prefix: '/v1/tax-codes' });
    await server.register(vatPeriodRoutes, { prefix: '/v1/vat-periods' });
    await server.register(lensRoutes, { prefix: '/v1/lens' });
    await server.register(oneidRoutes,    { prefix: '/v1/oneid' });
    await server.register(ondiAuthRoutes, { prefix: '/v1/ondi/auth' });
    await server.register(ondiSamlRoutes, { prefix: '/v1/ondi/auth/saml' });
    await server.register(ondiOauthRoutes, { prefix: '/v1/ondi/oauth' });
    await server.register(oidcDiscoveryRoutes);
    await server.register(trackingRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetOpsRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetComplianceRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetCommsRoutes, { prefix: '/v1/tracking' });
    await server.register(fleetAnalyticsRoutes, { prefix: '/v1/tracking' });
    await server.register(warehouseRoutes, { prefix: '/v1/tracking' });
    await server.register(cargoLoadingRoutes, { prefix: '/v1/tracking' });
    await server.register(vehicleDetailRoutes, { prefix: '/v1/tracking' });
    await server.register(billRoutes,     { prefix: '/v1/bills' });
    await server.register(whtRoutes,      { prefix: '/v1/wht' });
    await server.register(citRoutes,      { prefix: '/v1/cit' });
    await server.register(deferredTaxRoutes, { prefix: '/v1/deferred-tax' });
    await server.register(dividendRoutes, { prefix: '/v1/dividends' });
    await server.register(fxRevaluationRoutes, { prefix: '/v1/fx-revaluations' });
    await server.register(apApprovalWorkflowRoutes, { prefix: '/v1/ap-approval-workflows' });
    await server.register(customerCreditRoutes, { prefix: '/v1/customer-credits' });
    await server.register(settingsRoutes, { prefix: '/v1/settings' });
    await server.register(mailOAuthRoutes, { prefix: '/v1/settings/email' });
    await server.register(reportsRoutes, { prefix: '/v1/reports' });
    await server.register(aiRoutes, { prefix: '/v1/ai' });
    await server.register(trackerRoutes, { prefix: '/v1/tracker' });
    await server.register(trackerPublicRoutes, { prefix: '/v1/tracker' });
    await server.register(cargoDashboardRoutes, { prefix: '/v1/cargotracker/dashboard' });
    await server.register(glRoutes, { prefix: '/v1/finance' });
    await server.register(purchaseOrderRoutes, { prefix: '/v1/purchase-orders' });
    await server.register(supplierRoutes, { prefix: '/v1/suppliers' });
    await server.register(accountingIntegrationRoutes, { prefix: '/v1/accounting-integrations' });
    await server.register(accountingOAuthRoutes, { prefix: '/v1/accounting-integrations' });
    await server.register(nexusHRRoutes, { prefix: '/v1/hr' });
    await server.register(contactsRoutes, { prefix: '/v1/contacts' });
    await server.register(contactsSyncRoutes, { prefix: '/v1/contacts' });
    await server.register(emailRoutes, { prefix: '/v1/emails' });
    await server.register(emailSendRoutes, { prefix: '/v1/email' });
    await server.register(emailTemplatesRoutes, { prefix: '/v1/email-templates' });
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
    await server.register(hudubiRoutes, { prefix: '/v1/hudubi' });
    await server.register(cmsRoutes, { prefix: '/v1/cms' });
    await server.register(complyOcrRoutes, { prefix: '/v1/comply/ocr' });
    await server.register(complyLegalRoutes, { prefix: '/v1/comply/legal' });
    await server.register(onboardingRoutes, { prefix: '/v1/onboarding' });
    await server.register(packagesRoutes, { prefix: '/v1/packages' });
    await server.register(addonsRoutes, { prefix: '/v1/addons' });
    await server.register(traRoutes, { prefix: '/v1/tra' });
    await server.register(customsRoutes, { prefix: '/v1/customs' });
    await server.register(advancedCalculatorRoutes, { prefix: '/v1/customs' });
    await server.register(tradeWizardRoutes, { prefix: '/v1/customs/trade-wizard' });
    await server.register(filesRoutes, { prefix: '/v1/files' });
    await server.register(filesPublicRoutes, { prefix: '/v1/files-public' });
    await server.register(drivesRoutes, { prefix: '/v1/drives' });
    await server.register(orgRoutes, { prefix: '/v1/org' });
    await server.register(organizationsRoutes, { prefix: '/v1/organizations' });
    await server.register(supportRoutes, { prefix: '/v1/support' });
    await server.register(platformRoutes, { prefix: '/v1/platform' });
    await server.register(entitlementsRoutes, { prefix: '/v1/entitlements' });
    await server.register(apiKeysRoutes, { prefix: '/v1/api-keys' });
    await server.register(storeRoutes, { prefix: '/v1/store' });
    await server.register(searchRoutes, { prefix: '/v1/search' });
    await server.register(workspaceCockpitRoutes, { prefix: '/v1/workspace/cockpit' });
    await server.register(tasksRoutes, { prefix: '/v1/tasks' });
    await server.register(taskProjectsRoutes, { prefix: '/v1/tasks/projects' });
    await server.register(contractsRoutes, { prefix: '/v1/contracts' });
    await server.register(securityRoutes, { prefix: '/v1/security' });
    await server.register(billingRoutes, { prefix: '/v1/billing' });
    await server.register(platformSupportRoutes, { prefix: '/v1/platform-support' });
    await server.register(publicSupportRoutes, { prefix: '/v1/public-support' });
    await server.register(workflowStudioRoutes, { prefix: '/v1/workflow-studio' });
    await server.register(onsiteRoutes, { prefix: '/v1/onsite' });
    await server.register(onsiteAgencyRoutes, { prefix: '/v1/onsite/agency' });
    await server.register(onsiteAgencyClientRoutes, { prefix: '/v1/onsite/agency' });
    await server.register(onsiteAgencyManageRoutes, { prefix: '/v1/onsite/agency/clients/:clientTenantId' });
    await server.register(onsitePlanRoutes, { prefix: '/v1/onsite/plan' });
    await server.register(onsiteBackupsRoutes, { prefix: '/v1/onsite/backups' });
    await server.register(onsiteAgencyDirectoryPublicRoutes, { prefix: '/v1/agency-directory' });
    await server.register(onsiteAgencyDirectoryManageRoutes, { prefix: '/v1/onsite/agency/directory' });
    await server.register(signRoutes, { prefix: '/v1/sign' });
    await server.register(signPublicRoutes, { prefix: '/v1/sign' });
    await server.register(bookingPublicRoutes, { prefix: '/v1/booking-public' });
    await server.register(calendarSyncRoutes, { prefix: '/v1/tasks/calendar-sync' });
    await server.register(signStampsRoutes, { prefix: '/v1/sign' });
    await server.register(signVersionsRoutes, { prefix: '/v1/sign' });
    await server.register(signPdfToolsRoutes, { prefix: '/v1/sign/pdf-tools' });
    await server.register(smsRoutes, { prefix: '/v1/sms' });
    await server.register(smsWebhookRoutes, { prefix: '/v1/sms/webhook' });
    await server.register(setupGuideRoutes, { prefix: '/v1/setup-guide' });


    // Health check
    server.get('/health', async () => {
      return { status: 'healthy', timestamp: new Date().toISOString() };
    });

    // 5. Start jobs scheduler
    bootstrapSubscribers();
    registerBuiltInEntityProviders();
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
