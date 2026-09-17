import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSEnterpriseService } from '../services/cms-enterprise.service.js';
import { CMSCapabilitiesService } from '../services/cms-capabilities.service.js';

const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

// Validation Schemas
const siteCreateSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).nullable().optional(),
  is_default: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});
const sitePatchSchema = siteCreateSchema.partial();

const workflowStateCreateSchema = z.object({
  site_id: z.string().uuid().nullable().optional(),
  slug: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  color: z.string().max(30).optional(),
  is_initial: z.boolean().optional(),
  is_published: z.boolean().optional(),
  sort_order: z.number().optional(),
});
const workflowStatePatchSchema = workflowStateCreateSchema.partial();

const workflowTransitionCreateSchema = z.object({
  site_id: z.string().uuid().nullable().optional(),
  from_state_id: z.string().uuid(),
  to_state_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  required_role: z.string().max(50).nullable().optional(),
  require_approval: z.boolean().optional(),
});

const approvalRequestSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
  assigned_to: z.string().uuid(),
  due_date: z.string().datetime().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

const approvalDecideSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
});

const releaseCreateSchema = z.object({
  site_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
});
const releasePatchSchema = releaseCreateSchema.partial();

const releaseItemCreateSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
  target_status: z.string().max(50).optional(),
});

const contentCommentCreateSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  block_id: z.string().max(100).nullable().optional(),
  content: z.string().trim().min(1).max(5000),
});
const contentCommentPatchSchema = z.object({
  content: z.string().trim().min(1).max(5000).optional(),
  is_resolved: z.boolean().optional(),
});

const translateSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
  target_locale: z.string().trim().min(2).max(10),
  source_locale: z.string().trim().min(2).max(10).optional(),
});

const linkTranslationSchema = z.object({
  resource_type: z.enum(['page', 'post', 'entry']),
  resource_id: z.string().uuid(),
  translation_group_id: z.string().uuid(),
  locale: z.string().trim().min(2).max(10),
});

export async function cmsEnterpriseRoutes(fastify: FastifyInstance) {
  // Enforce auth & entitlement on all enterprise routes
  fastify.addHook('preHandler', async (request: any, reply) => {
    // Resolve public site query if any (e.g. public site lookup)
    const url = request.raw.url as string | undefined;
    if (url && url.startsWith('/v1/cms/sites/resolve')) {
      return; // public site resolution allows unauthenticated domain routing
    }

    await fastify.authenticate(request, reply);
    if (reply.sent) return;

    await requireEntitlement('onesite')(request, reply);
    if (reply.sent) return;

    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Multisite (§23)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/sites', async (request: any, reply) => {
    try {
      return await CMSEnterpriseService.listSites(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/sites/resolve', async (request: any, reply) => {
    const { domain, slug, tenant_id } = request.query as { domain?: string; slug?: string; tenant_id?: string };
    if (!domain && (!slug || !tenant_id)) {
      return reply.status(400).send({ error: 'Provide either domain, or slug and tenant_id' });
    }
    try {
      const site = await CMSEnterpriseService.resolveSite({ domain, slug, tenantId: tenant_id });
      if (!site) return reply.status(404).send({ error: 'Site not found' });
      return site;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/sites/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const site = await CMSEnterpriseService.getSite(request.user.tenant_id, id);
      if (!site) return reply.status(404).send({ error: 'Site not found' });
      return site;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/sites', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can create CMS sites' });
    }
    const body = siteCreateSchema.parse(request.body);
    try {
      const created = await CMSEnterpriseService.createSite(request.user.tenant_id, body);
      reply.status(201);
      return created;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/sites/:id', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can edit CMS sites' });
    }
    const { id } = request.params as { id: string };
    const body = sitePatchSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.updateSite(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/sites/:id', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can delete CMS sites' });
    }
    const { id } = request.params as { id: string };
    try {
      await CMSEnterpriseService.deleteSite(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/sites/:id/make-default', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can set default CMS site' });
    }
    const { id } = request.params as { id: string };
    try {
      return await CMSEnterpriseService.setDefaultSite(request.user.tenant_id, id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Workflow States & Transitions (§15)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/workflows/states', async (request: any, reply) => {
    const { site_id } = request.query as { site_id?: string };
    try {
      return await CMSEnterpriseService.listWorkflowStates(request.user.tenant_id, site_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/workflows/states', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can manage workflow states' });
    }
    const body = workflowStateCreateSchema.parse(request.body);
    try {
      const state = await CMSEnterpriseService.createWorkflowState(request.user.tenant_id, body);
      reply.status(201);
      return state;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/workflows/states/:id', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can manage workflow states' });
    }
    const { id } = request.params as { id: string };
    const body = workflowStatePatchSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.updateWorkflowState(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/workflows/states/:id', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can manage workflow states' });
    }
    const { id } = request.params as { id: string };
    try {
      await CMSEnterpriseService.deleteWorkflowState(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/workflows/states/seed', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can seed workflow states' });
    }
    const { site_id } = request.body as { site_id?: string } || {};
    try {
      return await CMSEnterpriseService.seedDefaultWorkflow(request.user.tenant_id, site_id);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/workflows/transitions', async (request: any, reply) => {
    const { site_id } = request.query as { site_id?: string };
    try {
      return await CMSEnterpriseService.listWorkflowTransitions(request.user.tenant_id, site_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/workflows/transitions', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can manage workflow transitions' });
    }
    const body = workflowTransitionCreateSchema.parse(request.body);
    try {
      const transition = await CMSEnterpriseService.createWorkflowTransition(request.user.tenant_id, body);
      reply.status(201);
      return transition;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/workflows/transitions/:id', async (request: any, reply) => {
    if (!isCmsAdmin(request.user.role)) {
      return reply.status(403).send({ error: 'Only admins can manage workflow transitions' });
    }
    const { id } = request.params as { id: string };
    try {
      await CMSEnterpriseService.deleteWorkflowTransition(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/workflows/validate-transition', async (request: any, reply) => {
    const { from_state_id, to_state_id, site_id } = request.body as { from_state_id: string; to_state_id: string; site_id?: string };
    if (!from_state_id || !to_state_id) {
      return reply.status(400).send({ error: 'from_state_id and to_state_id are required' });
    }
    try {
      const result = await CMSEnterpriseService.validateTransition(
        request.user.tenant_id,
        from_state_id,
        to_state_id,
        request.user.role,
        site_id
      );
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Approvals (§16)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/reviewers', async (request: any, reply) => {
    try {
      return await CMSEnterpriseService.listReviewers(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/approvals', async (request: any, reply) => {
    const { resource_type, resource_id, assigned_to, status } = request.query as any;
    try {
      return await CMSEnterpriseService.listApprovals(request.user.tenant_id, {
        resource_type,
        resource_id,
        assigned_to,
        status,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/approvals/request', async (request: any, reply) => {
    const body = approvalRequestSchema.parse(request.body);
    try {
      const approval = await CMSEnterpriseService.requestApproval(
        request.user.tenant_id,
        request.user.sub,
        body
      );
      reply.status(201);
      return approval;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/approvals/:id/decide', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = approvalDecideSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.decideApproval(
        request.user.tenant_id,
        id,
        request.user.sub,
        request.user.role,
        body
      );
    } catch (err: any) {
      return reply.status(err.message.startsWith('Only the') ? 403 : 400).send({ error: err.message });
    }
  });

  fastify.post('/approvals/:id/cancel', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await CMSEnterpriseService.cancelApproval(
        request.user.tenant_id,
        id,
        request.user.sub,
        request.user.role
      );
    } catch (err: any) {
      return reply.status(err.message.startsWith('Only the') ? 403 : 400).send({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Content Releases (§18)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/releases', async (request: any, reply) => {
    const { site_id, status } = request.query as any;
    try {
      return await CMSEnterpriseService.listReleases(request.user.tenant_id, { site_id, status });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/releases', async (request: any, reply) => {
    const body = releaseCreateSchema.parse(request.body);
    try {
      const release = await CMSEnterpriseService.createRelease(
        request.user.tenant_id,
        request.user.sub,
        body
      );
      reply.status(201);
      return release;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/releases/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      const release = await CMSEnterpriseService.getRelease(request.user.tenant_id, id);
      if (!release) return reply.status(404).send({ error: 'Release not found' });
      return release;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/releases/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = releasePatchSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.updateRelease(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/releases/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      await CMSEnterpriseService.deleteRelease(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/releases/:id/items', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = releaseItemCreateSchema.parse(request.body);
    try {
      const item = await CMSEnterpriseService.addReleaseItem(request.user.tenant_id, id, body);
      reply.status(201);
      return item;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/releases/:id/items/:itemId', async (request: any, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    try {
      await CMSEnterpriseService.removeReleaseItem(request.user.tenant_id, id, itemId);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/releases/:id/publish', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await CMSEnterpriseService.publishRelease(request.user.tenant_id, id, request.user.sub);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Editorial Collaboration Comments (§19–20)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/comments/editorial', async (request: any, reply) => {
    const { resource_type, resource_id, resolved } = request.query as any;
    if (!resource_type || !resource_id) {
      return reply.status(400).send({ error: 'resource_type and resource_id query parameters are required' });
    }
    try {
      const isResolved = resolved === 'true' ? true : resolved === 'false' ? false : undefined;
      return await CMSEnterpriseService.listContentComments(
        request.user.tenant_id,
        resource_type,
        resource_id,
        isResolved
      );
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/comments/editorial', async (request: any, reply) => {
    const body = contentCommentCreateSchema.parse(request.body);
    try {
      const comment = await CMSEnterpriseService.addContentComment(
        request.user.tenant_id,
        request.user.sub,
        body
      );
      reply.status(201);
      return comment;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/comments/editorial/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = contentCommentPatchSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.updateContentComment(
        request.user.tenant_id,
        id,
        request.user.sub,
        request.user.role,
        body
      );
    } catch (err: any) {
      return reply.status(err.message.startsWith('Only the') ? 403 : 400).send({ error: err.message });
    }
  });

  fastify.delete('/comments/editorial/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    try {
      await CMSEnterpriseService.deleteContentComment(
        request.user.tenant_id,
        id,
        request.user.sub,
        request.user.role
      );
      return { ok: true };
    } catch (err: any) {
      return reply.status(err.message.startsWith('Only the') ? 403 : 400).send({ error: err.message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Localization & AI Translation Workflow (§25–26)
  // ───────────────────────────────────────────────────────────────────────────

  fastify.get('/translations/:group_id', async (request: any, reply) => {
    const { group_id } = request.params as { group_id: string };
    try {
      return await CMSEnterpriseService.listTranslationGroup(request.user.tenant_id, group_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/translate', async (request: any, reply) => {
    const body = translateSchema.parse(request.body);
    try {
      // Draft-only machine translation workflow via callAI
      const result = await CMSEnterpriseService.translateContent(
        request.user.tenant_id,
        request.user.sub,
        body
      );
      reply.status(201);
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/translations/link', async (request: any, reply) => {
    const body = linkTranslationSchema.parse(request.body);
    try {
      return await CMSEnterpriseService.linkTranslation(request.user.tenant_id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
