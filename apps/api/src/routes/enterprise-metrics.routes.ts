import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EnterpriseMetricsService } from '../services/enterprise-metrics.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (request.user?.role !== 'SUPER_ADMIN') {
    reply.code(403).send({ error: 'Super admin role required' });
    return;
  }
  done();
}

// ── Platform metrics (SUPER_ADMIN) ────────────────────────────────

export async function platformMetricsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/compute', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { metric_type } = request.body as any;
    return EnterpriseMetricsService.computePlatformSnapshot(metric_type);
  });

  fastify.get('/', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { metric_type, limit } = request.query as Record<string, string>;
    return EnterpriseMetricsService.listPlatformSnapshots({
      metric_type, limit: limit ? parseInt(limit, 10) : undefined,
    });
  });
}

// ── Tenant metrics ────────────────────────────────────────────────

export async function tenantMetricsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/compute', { preHandler: [requireAdmin] }, async (request) => {
    const { metric_type } = request.body as any;
    return EnterpriseMetricsService.computeTenantSnapshot(
      request.user!.tenant_id, metric_type,
    );
  });

  fastify.get('/', async (request) => {
    const { metric_type, limit } = request.query as Record<string, string>;
    return EnterpriseMetricsService.listTenantSnapshots(
      request.user!.tenant_id,
      { metric_type, limit: limit ? parseInt(limit, 10) : undefined },
    );
  });
}

// ── Resource limits ───────────────────────────────────────────────

export async function resourceLimitRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return EnterpriseMetricsService.listResourceLimits(request.user!.tenant_id);
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return EnterpriseMetricsService.setResourceLimit(
      request.user!.tenant_id, request.body as any,
    );
  });

  fastify.post('/check', async (request) => {
    const { resource_type, current_usage } = request.body as any;
    return EnterpriseMetricsService.checkResourceLimit(
      request.user!.tenant_id, resource_type, current_usage,
    );
  });
}

// ── Jobs ──────────────────────────────────────────────────────────

export async function jobRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { status, job_type, limit } = request.query as Record<string, string>;
    return EnterpriseMetricsService.listJobs(
      request.user!.tenant_id,
      { status, job_type, limit: limit ? parseInt(limit, 10) : undefined },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return EnterpriseMetricsService.enqueueJob(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.post('/:id/claim', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return EnterpriseMetricsService.claimJob(id, request.user!.tenant_id);
  });

  fastify.post('/:id/complete', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { result } = request.body as any;
    return EnterpriseMetricsService.completeJob(id, request.user!.tenant_id, result);
  });

  fastify.post('/:id/fail', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    const { error_message } = request.body as any;
    return EnterpriseMetricsService.failJob(id, request.user!.tenant_id, error_message);
  });
}

// ── Bulk operations ───────────────────────────────────────────────

export async function bulkOperationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { operation_type, status, limit } = request.query as Record<string, string>;
    return EnterpriseMetricsService.listBulkOperations(
      request.user!.tenant_id,
      { operation_type, status, limit: limit ? parseInt(limit, 10) : undefined },
    );
  });

  fastify.post('/', { preHandler: [requireAdmin] }, async (request) => {
    return EnterpriseMetricsService.createBulkOperation(
      request.user!.tenant_id, request.user!.sub, request.body as any,
    );
  });

  fastify.patch('/:id', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    return EnterpriseMetricsService.updateBulkProgress(
      request.user!.tenant_id, id, request.body as any,
    );
  });
}
