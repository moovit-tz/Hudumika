// ─── apps/api/src/routes/developer.routes.ts ─────────────────────
// REST API route handlers for Hudumika Developer Platform
// Supports Accounts, Organizations, Projects, Credentials, Marketplace, Analytics, and API Gateway

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { DeveloperService } from '../services/developer.service.js';
import { DeveloperGatewayService } from '../services/developer-gateway.service.js';
import type { EnvironmentType, OrgMemberRole } from '@hudumika/types';

const ORG_MEMBER_ROLES: OrgMemberRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'BILLING_ADMIN', 'SECURITY_ADMIN', 'VIEWER'];

export const developerRoutes: FastifyPluginAsync = async fastify => {
  /* ════════════════════════════════════════════════════════════════════════
     1. LIVE API GATEWAY EXECUTION ENDPOINT (PUBLIC WITH API KEY)
     ════════════════════════════════════════════════════════════════════════ */
  fastify.all('/gateway/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawApiKey = (request.headers['x-hudumika-key'] || request.headers['x-api-key'] || (request.headers.authorization?.startsWith('Bearer ak_') ? request.headers.authorization.slice(7) : null)) as string;

    if (!rawApiKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing API Key. Provide key via X-Hudumika-Key header or Authorization: Bearer ak_live_...',
      });
    }

    let authContext;
    try {
      authContext = await DeveloperGatewayService.authenticateRequest(rawApiKey);
    } catch (err: any) {
      return reply.status(401).send({ error: 'Unauthorized', message: err.message });
    }

    const subPath = (request.params as any)['*'] || '';
    const fullPath = subPath.startsWith('/') ? subPath : `/${subPath}`;

    const resolved = await DeveloperGatewayService.resolveOperation(request.method, fullPath);
    if (!resolved) {
      return reply.status(404).send({
        error: 'Operation Not Found',
        message: `No active API operation matched ${request.method} ${fullPath}`,
      });
    }

    // Check entitlement
    const ent = await DeveloperGatewayService.checkEntitlement(
      authContext.project_id,
      authContext.environment,
      resolved.operation.api_product_id
    );

    if (!ent.is_entitled) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Project is not subscribed or entitled to "${resolved.operation.product_name}" in ${authContext.environment} environment.`,
      });
    }

    const startTime = Date.now();
    try {
      const result = await DeveloperGatewayService.executeRoute(
        resolved.operation,
        resolved.provider,
        request.body,
        request.query,
        authContext
      );

      const durationMs = Date.now() - startTime;
      const requestId = (request.headers['x-request-id'] || `req_${crypto.randomBytes(12).toString('hex')}`) as string;

      // Record metered usage asynchronously
      DeveloperGatewayService.recordUsage({
        requestId,
        authContext,
        operation: resolved.operation,
        provider: resolved.provider,
        result,
        durationMs,
        ipAddress: request.ip,
      }).catch(err => request.log.error(err, 'Failed to record gateway usage'));

      reply.header('X-Hudumika-Request-Id', requestId);
      reply.header('X-Hudumika-Environment', authContext.environment);
      reply.header('X-Hudumika-Execution-Mode', resolved.operation.execution_mode);

      return reply.status(result.status_code).send(result.data);
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Gateway Execution Failed',
        message: err.message || 'An internal error occurred while executing the API operation.',
      });
    }
  });

  /* ════════════════════════════════════════════════════════════════════════
     2. DEVELOPER CONSOLE AUTHENTICATED ENDPOINTS
     ════════════════════════════════════════════════════════════════════════ */
  fastify.register(async authScoped => {
    authScoped.addHook('preHandler', fastify.authenticate);

    // ── Accounts & Organizations ──
    authScoped.get('/accounts', async (request: FastifyRequest) => {
      const user = request.user;
      return DeveloperService.listUserAccounts(user.sub, user.name);
    });

    authScoped.post('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      const body = request.body as any;
      if (!body.name) {
        return reply.status(400).send({ error: 'Account name is required.' });
      }

      if (body.type === 'ORGANIZATION') {
        const org = await DeveloperService.createOrganizationAccount(user.sub, {
          name: body.name,
          legal_name: body.legal_name || body.name,
          registration_number: body.registration_number,
          tin: body.tin,
          country: body.country,
          industry: body.industry,
          website: body.website,
        });
        return org;
      } else {
        return DeveloperService.getOrCreatePersonalAccount(user.sub, user.name);
      }
    });

    // ── Org Members ──
    authScoped.get('/accounts/:id/members', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      return DeveloperService.listOrgMembers(id);
    });

    authScoped.post('/accounts/:id/members', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      await DeveloperService.assertAccountAccess(id, user.sub);
      const body = request.body as { email: string; role: OrgMemberRole };
      if (!body.email || !body.role) {
        return reply.status(400).send({ error: 'Email and role are required.' });
      }
      // HUD-0117: an invalid role used to reach developer_org_members' own
      // CHECK constraint unvalidated, surfacing as an opaque 500 (the global
      // error handler deliberately masks raw driver errors) instead of
      // telling the caller what a valid role actually is.
      if (!ORG_MEMBER_ROLES.includes(body.role)) {
        return reply.status(400).send({ error: `Invalid role. Must be one of: ${ORG_MEMBER_ROLES.join(', ')}.` });
      }
      return DeveloperService.addOrgMember(id, user.sub, body.email, body.role);
    });

    authScoped.delete('/accounts/:id/members/:memberId', async (request: FastifyRequest) => {
      const { id, memberId } = request.params as { id: string; memberId: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      await DeveloperService.removeOrgMember(id, memberId);
      return { success: true };
    });

    // ── Projects ──
    authScoped.get('/accounts/:id/projects', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      return DeveloperService.listProjects(id);
    });

    authScoped.post('/accounts/:id/projects', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      await DeveloperService.assertAccountAccess(id, user.sub);
      const body = request.body as { name: string; description?: string; is_internal?: boolean };
      if (!body.name) {
        return reply.status(400).send({ error: 'Project name is required.' });
      }
      return DeveloperService.createProject(id, user.sub, body);
    });

    // ── Credentials ──
    authScoped.get('/projects/:id/credentials', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertProjectAccess(id, request.user.sub);
      const { environment } = request.query as { environment?: EnvironmentType };
      return DeveloperService.listCredentials(id, environment);
    });

    authScoped.post('/projects/:id/credentials', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      await DeveloperService.assertProjectAccess(id, user.sub);
      const body = request.body as {
        name: string;
        environment: EnvironmentType;
        type?: 'API_KEY' | 'OAUTH_CLIENT' | 'SERVICE_ACCOUNT';
        scopes?: string[];
        rate_limit_override?: number;
        expires_in_days?: number;
      };

      if (!body.name || !body.environment) {
        return reply.status(400).send({ error: 'Name and environment are required.' });
      }

      return DeveloperService.createCredential(id, user.sub, body);
    });

    authScoped.post('/projects/:id/credentials/:credId/revoke', async (request: FastifyRequest) => {
      const { id, credId } = request.params as { id: string; credId: string };
      await DeveloperService.assertProjectAccess(id, request.user.sub);
      const body = request.body as { reason?: string };
      await DeveloperService.revokeCredential(id, credId, body?.reason);
      return { success: true };
    });

    // ── API Catalog & Marketplace ──
    authScoped.get('/catalog', async (request: FastifyRequest) => {
      const { category } = request.query as { category?: string };
      return DeveloperService.listCatalog(category);
    });

    authScoped.get('/catalog/:code', async (request: FastifyRequest, reply: FastifyReply) => {
      const { code } = request.params as { code: string };
      const prod = await DeveloperService.getProductDetails(code);
      if (!prod) return reply.status(404).send({ error: 'API Product Not Found' });
      return prod;
    });

    // ── Entitlements & Subscriptions ──
    authScoped.get('/projects/:id/entitlements', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertProjectAccess(id, request.user.sub);
      const { environment } = request.query as { environment?: EnvironmentType };
      return DeveloperService.listProjectEntitlements(id, environment);
    });

    authScoped.post('/accounts/:id/subscribe', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      const body = request.body as {
        project_id: string;
        environment: EnvironmentType;
        api_product_id: string;
        pricing_plan_id: string;
      };

      if (!body.project_id || !body.environment || !body.api_product_id || !body.pricing_plan_id) {
        return reply.status(400).send({ error: 'Missing required subscription parameters.' });
      }

      // HUD-0117: subscribeAndEntitle bills accountId's own balance but writes
      // the entitlement against whatever project_id the body names — without
      // this, the account-ownership check above is not enough on its own,
      // since a caller could pass their own real account id but a
      // different account's real project id here.
      const projectAccountId = await DeveloperService.assertProjectAccess(body.project_id, request.user.sub);
      if (projectAccountId !== id) {
        return reply.status(400).send({ error: 'That project does not belong to this developer account.' });
      }

      return DeveloperService.subscribeAndEntitle(
        id,
        body.project_id,
        body.environment,
        body.api_product_id,
        body.pricing_plan_id
      );
    });

    // ── Analytics & Telemetry ──
    authScoped.get('/projects/:id/analytics', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertProjectAccess(id, request.user.sub);
      const { environment } = request.query as { environment?: EnvironmentType };
      return DeveloperService.getProjectAnalytics(id, environment);
    });

    // ── Billing & Credits ──
    authScoped.get('/accounts/:id/billing', async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      return DeveloperService.getBillingOverview(id);
    });

    authScoped.post('/accounts/:id/billing/topup', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await DeveloperService.assertAccountAccess(id, request.user.sub);
      const body = request.body as { amount: number; currency?: string };
      if (!body.amount || body.amount <= 0) {
        return reply.status(400).send({ error: 'A positive top-up amount is required.' });
      }
      return DeveloperService.topUpCredits(id, body.amount, body.currency || 'TZS');
    });
  });
};
