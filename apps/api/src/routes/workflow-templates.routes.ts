import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { WorkflowTemplateService, type TemplateDef } from '../services/workflow-template.service.js';
import { WorkflowLearningService } from '../services/workflow-learning.service.js';

/**
 * Platform superadmin management of the workflow template library
 * (migration 218). Tenants consume these read-only via GET
 * /v1/workflows/templates and adopt them; here the superadmin authors new
 * templates, publishes new versions, and archives old ones. Every version a
 * tenant might adopt lives in `workflow_templates`, keyed (template_key,
 * version) — which is exactly the surface the self-learning phase writes
 * machine-proposed draft versions into for approval.
 */
export async function workflowTemplateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN'));

  const actorId = (request: any) => request.user?.sub ?? request.user?.id ?? null;

  /** GET / — every template, every version (newest version first per key). */
  fastify.get('/', async () => ({ data: await WorkflowTemplateService.listAll() }));

  /** POST / — author a brand-new template key at version 1. */
  fastify.post('/', async (request, reply) => {
    const body = request.body as TemplateDef & { source?: string };
    if (!body?.templateKey || !body?.name || !Array.isArray(body?.steps)) {
      return reply.status(400).send({ error: 'templateKey, name and steps[] are required' });
    }
    const res = await WorkflowTemplateService.create(body, actorId(request));
    return reply.status(201).send({ success: true, id: res.id });
  });

  /** POST /:key/versions — publish the next version of an existing key. */
  fastify.post('/:key/versions', async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = request.body as Partial<TemplateDef> & { source?: string };
    try {
      const res = await WorkflowTemplateService.publishNewVersion(key, body, actorId(request));
      return reply.status(201).send({ success: true, ...res });
    } catch (err: any) {
      return reply.status(err.message === 'Template key not found' ? 404 : 400).send({ error: err.message });
    }
  });

  /** PATCH /:id/status — publish | archive | draft a specific version. */
  fastify.patch('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'draft' | 'published' | 'archived' };
    if (!['draft', 'published', 'archived'].includes(status)) {
      return reply.status(400).send({ error: 'status must be draft, published or archived' });
    }
    await WorkflowTemplateService.setStatus(id, status);
    return { success: true, status };
  });

  // ── Self-learning (Phase 3) ───────────────────────────────────────────────

  /** POST /learn — run the analysis now (also runs daily via the scheduler). */
  fastify.post('/learn', async () => {
    const summary = await WorkflowLearningService.analyze();
    return { success: true, summary };
  });

  /** GET /proposals — machine-proposed template versions (default: pending). */
  fastify.get('/proposals', async (request) => {
    const { status } = request.query as { status?: string };
    return { data: await WorkflowLearningService.listProposals(status ?? 'pending') };
  });

  /** GET /signals — the aggregated cross-tenant learning evidence. */
  fastify.get('/signals', async (request) => {
    const { templateKey } = request.query as { templateKey?: string };
    return { data: await WorkflowLearningService.getSignals(templateKey) };
  });

  /** POST /proposals/:id/approve — publish it as a real new template version. */
  fastify.post('/proposals/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const res = await WorkflowLearningService.approve(id, request.user?.sub ?? null);
      return { success: true, ...res };
    } catch (err: any) {
      return reply.status(err.message === 'Proposal not found' ? 404 : 400).send({ error: err.message });
    }
  });

  /** POST /proposals/:id/reject */
  fastify.post('/proposals/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { note } = (request.body ?? {}) as { note?: string };
    try {
      await WorkflowLearningService.reject(id, request.user?.sub ?? null, note);
      return { success: true };
    } catch (err: any) {
      return reply.status(err.message === 'Proposal not found' ? 404 : 400).send({ error: err.message });
    }
  });
}
