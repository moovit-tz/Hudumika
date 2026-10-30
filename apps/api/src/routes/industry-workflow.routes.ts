import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { IndustryWorkflowService } from '../services/industry-workflow.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!ADMIN_ROLES.includes(request.user?.role ?? '')) {
    reply.code(403).send({ error: 'Admin role required' });
    return;
  }
  done();
}

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (request.user?.role !== 'SUPER_ADMIN') {
    reply.code(403).send({ error: 'SUPER_ADMIN required' });
    return;
  }
  done();
}

// ── Workflow definition routes (platform-scoped) ──────────────────────────

export async function workflowDefRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return IndustryWorkflowService.listWorkflowDefs({
      industry_key: q.industry_key,
      app_id: q.app_id,
      status: q.status,
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const def = await IndustryWorkflowService.getWorkflowDef(id);
    if (!def) return reply.code(404).send({ error: 'Not found' });
    return def;
  });

  fastify.post('/', { preHandler: requireAdmin }, async (request) => {
    const body = z.object({
      industry_key: z.string().min(1),
      app_id: z.string().min(1),
      workflow_code: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      steps: z.array(z.record(z.string(), z.unknown())).optional(),
      required_apps: z.array(z.string()).optional(),
      required_permits: z.array(z.string()).optional(),
      config_schema: z.record(z.string(), z.unknown()).optional(),
    }).parse(request.body);
    return IndustryWorkflowService.createWorkflowDef(body);
  });
}

// ── Industry × app matrix routes (platform-scoped) ────────────────────────

export async function matrixRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return IndustryWorkflowService.listMatrix({
      industry_key: q.industry_key,
      app_id: q.app_id,
      status: q.status,
    });
  });

  fastify.get('/:industryKey/:appId', async (request, reply) => {
    const { industryKey, appId } = request.params as { industryKey: string; appId: string };
    const entry = await IndustryWorkflowService.getMatrixEntry(industryKey, appId);
    if (!entry) return reply.code(404).send({ error: 'Not found' });
    return entry;
  });

  fastify.put('/:industryKey/:appId', { preHandler: requireSuperAdmin }, async (request) => {
    const { industryKey, appId } = request.params as { industryKey: string; appId: string };
    const body = z.object({
      status: z.string().optional(),
      evidence_notes: z.string().optional(),
      last_verified: z.string().optional(),
      verified_by: z.string().optional(),
    }).parse(request.body);
    return IndustryWorkflowService.updateMatrixEntry(industryKey, appId, body);
  });
}

// ── Workflow instance routes (tenant-scoped) ──────────────────────────────

export async function workflowInstanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    const q = request.query as Record<string, string>;
    return IndustryWorkflowService.listInstances(request.user!.tenant_id, {
      industry_key: q.industry_key,
      app_id: q.app_id,
      status: q.status,
    });
  });

  fastify.post('/', { preHandler: requireAdmin }, async (request) => {
    const body = z.object({
      workflow_def_id: z.string().uuid().optional(),
      industry_key: z.string().min(1),
      app_id: z.string().min(1),
      workflow_code: z.string().min(1),
      name: z.string().min(1),
      config: z.record(z.string(), z.unknown()).optional(),
      entity_id: z.string().uuid().optional(),
      site_id: z.string().uuid().optional(),
    }).parse(request.body);
    return IndustryWorkflowService.createInstance(
      request.user!.tenant_id, request.user!.sub, body,
    );
  });

  fastify.get('/:instanceId/transactions', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    return IndustryWorkflowService.listTransactions(request.user!.tenant_id, instanceId);
  });

  fastify.post('/:instanceId/transactions', async (request) => {
    const { instanceId } = request.params as { instanceId: string };
    const body = z.object({
      step_code: z.string().min(1),
      step_name: z.string().min(1),
      source_app: z.string().min(1),
      target_app: z.string().optional(),
      status: z.string().optional(),
      input_data: z.record(z.string(), z.unknown()).optional(),
      output_data: z.record(z.string(), z.unknown()).optional(),
      source_record_type: z.string().optional(),
      source_record_id: z.string().optional(),
      target_record_type: z.string().optional(),
      target_record_id: z.string().optional(),
    }).parse(request.body);
    return IndustryWorkflowService.recordTransaction(
      request.user!.tenant_id, request.user!.sub, {
        workflow_instance_id: instanceId,
        ...body,
      },
    );
  });

  fastify.patch('/transactions/:txnId', async (request) => {
    const { txnId } = request.params as { txnId: string };
    const body = z.object({
      status: z.string().min(1),
      output_data: z.record(z.string(), z.unknown()).optional(),
    }).parse(request.body);
    return IndustryWorkflowService.updateTransactionStatus(
      request.user!.tenant_id, txnId, body.status, body.output_data,
    );
  });
}
