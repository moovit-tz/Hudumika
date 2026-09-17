import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSExperimentsService, ExperimentValidationError } from '../services/cms-experiments.service.js';
import { CMSCapabilitiesService } from '../services/cms-capabilities.service.js';

const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

function handleError(reply: any, err: any) {
  if (err instanceof ExperimentValidationError) return reply.status(400).send({ error: err.message });
  return reply.status(400).send({ error: err.message || 'Request failed' });
}

// §34 — `visibility` must be let through here too (real sanitizing happens
// in sanitizeBlock, not this zod gate), or a plain z.object() silently
// strips it before it ever reaches there.
const blockSchema = z.object({ id: z.string().optional(), type: z.string(), props: z.record(z.string(), z.any()).optional(), visibility: z.record(z.string(), z.any()).optional() });
const experimentCreateSchema = z.object({
  key: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1).max(120),
  variant_a_blocks: z.array(blockSchema).optional(),
  variant_b_blocks: z.array(blockSchema).optional(),
});
const experimentPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['running', 'stopped']).optional(),
  variant_a_blocks: z.array(blockSchema).optional(),
  variant_b_blocks: z.array(blockSchema).optional(),
});
const viewSchema = z.object({ variant: z.enum(['a', 'b']) });

/**
 * §35 of the CMS master brief — Experimentation. A real 'experiment' block
 * type (cms-content.service.ts's own BLOCK_TYPES registry) places one of
 * these on a page/post/entry wherever a 'blocks' field already works; the
 * two public routes below are what that block's own renderer
 * (BlockPreview.tsx's ExperimentBlockRenderer) actually calls.
 */
export async function cmsExperimentsRoutes(fastify: FastifyInstance) {
  // ── Public: no auth. Sticky variant assignment happens client-side
  // (localStorage) — this route just hands back both variants' own
  // sanitized blocks so the renderer can pick and render one, and records
  // a real view for whichever one it picked. ──
  fastify.get('/public/:tenantSlug/experiments/:key', async (request: any, reply) => {
    const { tenantSlug, key } = request.params as { tenantSlug: string; key: string };
    const experiment = await CMSExperimentsService.getPublicExperiment(tenantSlug, key);
    if (!experiment) return reply.status(404).send({ error: 'Experiment not found.' });
    return experiment;
  });

  fastify.post('/public/:tenantSlug/experiments/:key/view', async (request: any, reply) => {
    const { tenantSlug, key } = request.params as { tenantSlug: string; key: string };
    const { variant } = viewSchema.parse(request.body);
    const ok = await CMSExperimentsService.recordView(tenantSlug, key, variant);
    if (!ok) return reply.status(404).send({ error: 'Experiment not found.' });
    return { ok: true };
  });

  // ── Tenant (authenticated) routes ────────────────────────────────────────
  // Mapped to 'settings' — the same admin-configuration bucket §30-31's
  // own Forms routes already share, rather than a new per-area column in
  // the Permissions UI for one more "a block references this by key"
  // configuration surface.
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    if (url && url.startsWith('/v1/cms/experiments')) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      await requireEntitlement('onesite')(request, reply);
      if (reply.sent) return;
      if (request.user.role === 'CUSTOMER') {
        return reply.status(403).send({ error: 'Not available for this account type.' });
      }
      if (!isCmsAdmin(request.user.role)) {
        const action = request.method === 'GET' ? 'view' : 'manage';
        const allowed = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'settings', action);
        if (!allowed) return reply.status(403).send({ error: `Your role does not have ${action === 'view' ? 'access to' : 'permission to manage'} settings in the CMS.` });
      }
    }
  });

  fastify.get('/experiments', async (request: any, reply) => {
    try { return await CMSExperimentsService.listExperiments(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/experiments/:id', async (request: any, reply) => {
    try { return await CMSExperimentsService.getExperiment(request.user.tenant_id, (request.params as any).id); }
    catch { return reply.status(404).send({ error: 'Experiment not found.' }); }
  });

  fastify.post('/experiments', async (request: any, reply) => {
    const body = experimentCreateSchema.parse(request.body);
    try {
      const experiment = await CMSExperimentsService.createExperiment(request.user.tenant_id, request.user.sub, body as any);
      reply.status(201);
      return experiment;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.patch('/experiments/:id', async (request: any, reply) => {
    const body = experimentPatchSchema.parse(request.body);
    try { return await CMSExperimentsService.updateExperiment(request.user.tenant_id, (request.params as any).id, body as any); }
    catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/experiments/:id', async (request: any, reply) => {
    try {
      await CMSExperimentsService.deleteExperiment(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });
}
