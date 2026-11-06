import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConsultantDelegationService } from '../services/consultant-delegation.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

// ── Portfolio routes (provider side) ──────────────────────────────

export async function portfolioRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { status, client_type } = request.query as Record<string, string>;
    return ConsultantDelegationService.listPortfolios(
      request.user!.tenant_id, { status, client_type },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    const body = request.body as any;
    return ConsultantDelegationService.createPortfolio(
      request.user!.tenant_id, request.user!.sub, body,
    );
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const p = await ConsultantDelegationService.getPortfolio(request.user!.tenant_id, id);
    if (!p) return reply.status(404).send({ error: 'Portfolio not found' });
    return p;
  });

  fastify.patch('/:id/status', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { status, termination_reason } = request.body as any;
    return ConsultantDelegationService.updatePortfolioStatus(
      request.user!.tenant_id, id, status, { termination_reason },
    );
  });
}

// ── Mandate routes ────────────────────────────────────────────────

export async function mandateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { side = 'owner', status } = request.query as Record<string, string>;
    return ConsultantDelegationService.listMandates(
      request.user!.tenant_id,
      side as 'owner' | 'provider',
      { status },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    const body = request.body as any;
    return ConsultantDelegationService.createMandate(
      request.user!.tenant_id, request.user!.sub, body,
    );
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const m = await ConsultantDelegationService.getMandate(request.user!.tenant_id, id);
    if (!m) return reply.status(404).send({ error: 'Mandate not found' });
    return m;
  });

  fastify.post('/:id/activate', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return ConsultantDelegationService.activateMandate(
      request.user!.tenant_id, id, request.user!.sub,
    );
  });

  fastify.post('/:id/revoke', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as any;
    return ConsultantDelegationService.revokeMandate(
      request.user!.tenant_id, id, request.user!.sub, reason,
    );
  });

  fastify.post('/:id/suspend', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return ConsultantDelegationService.suspendMandate(
      request.user!.tenant_id, id,
    );
  });

  // Staff assignment routes on mandates
  fastify.get('/:id/staff', async (request) => {
    const { id } = request.params as { id: string };
    return ConsultantDelegationService.listStaff(request.user!.tenant_id, id);
  });

  fastify.post('/:id/staff', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    return ConsultantDelegationService.assignStaff(
      request.user!.tenant_id, id, request.user!.sub, body,
    );
  });

  fastify.delete('/staff/:assignmentId', { preHandler: [requireAdmin] }, async (request) => {
    const { assignmentId } = request.params as { assignmentId: string };
    return ConsultantDelegationService.removeStaff(
      request.user!.tenant_id, assignmentId, request.user!.sub,
    );
  });

  // Access check
  fastify.post('/check-access', async (request) => {
    const { owner_tenant_id, action, app_id, entity_id, permit_code } = request.body as any;
    return ConsultantDelegationService.checkMandateAccess(
      request.user!.tenant_id, owner_tenant_id,
      request.user!.sub, action,
      { app_id, entity_id, permit_code },
    );
  });

  // Audit log
  fastify.get('/audit-log', async (request) => {
    const { mandate_id, actor_user_id, limit } = request.query as Record<string, string>;
    return ConsultantDelegationService.listAuditLog(
      request.user!.tenant_id,
      { mandate_id, actor_user_id, limit: limit ? parseInt(limit, 10) : undefined },
    );
  });
}

// ── Engagement routes ─────────────────────────────────────────────

export async function engagementRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { portfolio_id, status } = request.query as Record<string, string>;
    return ConsultantDelegationService.listEngagements(
      request.user!.tenant_id, { portfolio_id, status },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    const body = request.body as any;
    return ConsultantDelegationService.createEngagement(
      request.user!.tenant_id, request.user!.sub, body,
    );
  });
}
