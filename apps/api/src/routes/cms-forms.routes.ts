import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSFormsService, FormValidationError } from '../services/cms-forms.service.js';
import { CMSCapabilitiesService } from '../services/cms-capabilities.service.js';

// §74 — same admin-equivalence list every other CMS routes file uses.
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

function handleError(reply: any, err: any) {
  if (err instanceof FormValidationError) return reply.status(400).send({ error: err.message });
  // HUD-0130: a plain Error ending in "not found." is this file's own
  // signal for a caller-supplied id that doesn't resolve to a real row —
  // a 404, not a validation problem.
  if (typeof err?.message === 'string' && err.message.endsWith('not found.')) {
    return reply.status(404).send({ error: err.message });
  }
  return reply.status(400).send({ error: err.message || 'Request failed' });
}

const formFieldSchema = z.object({
  key: z.string().trim().max(60).optional(),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'email', 'textarea', 'select']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});
const formCreateSchema = z.object({
  key: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1).max(120),
  fields: z.array(formFieldSchema).optional(),
  success_message: z.string().max(500).nullable().optional(),
  notify_email: z.string().max(200).nullable().optional(),
});
const formPatchSchema = formCreateSchema.omit({ key: true }).partial();
const submitSchema = z.record(z.string(), z.any());

/**
 * §30-31 of the CMS master brief — Forms + form workflows. A tenant
 * defines a form once (CMSFormsService's own field-shape validation), a
 * real 'form' block type places it on a page/post/entry
 * (cms-content.service.ts's BLOCK_TYPES registry), and the two public
 * routes below are what that block's own renderer actually calls.
 */
export async function cmsFormsRoutes(fastify: FastifyInstance) {

  // ── Public: no auth, honeypot-guarded, validated against the form's
  // own declared field shape server-side — never trusting the client. ──
  fastify.get('/public/:tenantSlug/forms/:formKey', async (request: any, reply) => {
    const { tenantSlug, formKey } = request.params as { tenantSlug: string; formKey: string };
    const form = await CMSFormsService.getPublicForm(tenantSlug, formKey);
    if (!form) return reply.status(404).send({ error: 'Form not found.' });
    return form;
  });

  fastify.post('/public/:tenantSlug/forms/:formKey/submit', async (request: any, reply) => {
    const { tenantSlug, formKey } = request.params as { tenantSlug: string; formKey: string };
    const body = submitSchema.parse(request.body ?? {});
    try {
      const result = await CMSFormsService.submitForm(tenantSlug, formKey, body);
      if (result === null) return reply.status(404).send({ error: 'Form not found.' });
      reply.status(201);
      return result;
    } catch (err: any) {
      if (err instanceof FormValidationError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  // ── Tenant (authenticated) routes ────────────────────────────────────────
  // Mapped to the 'settings' capability area — the same admin-configuration
  // bucket cms_nav_items/cms_webhooks/cms_site_settings already share in
  // cms.routes.ts's own CMS_AREA_BY_PREFIX, rather than adding a new area
  // (and a new column in the Permissions UI) for one more configuration
  // surface with the same real shape as those three.
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    if (url && url.startsWith('/v1/cms/forms')) {
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

  fastify.get('/forms', async (request: any, reply) => {
    try { return await CMSFormsService.listForms(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/forms/:id', async (request: any, reply) => {
    try { return await CMSFormsService.getForm(request.user.tenant_id, (request.params as any).id); }
    catch { return reply.status(404).send({ error: 'Form not found.' }); }
  });

  fastify.post('/forms', async (request: any, reply) => {
    const body = formCreateSchema.parse(request.body);
    try {
      const form = await CMSFormsService.createForm(request.user.tenant_id, request.user.sub, body);
      reply.status(201);
      return form;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.patch('/forms/:id', async (request: any, reply) => {
    const body = formPatchSchema.parse(request.body);
    try { return await CMSFormsService.updateForm(request.user.tenant_id, (request.params as any).id, body); }
    catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/forms/:id', async (request: any, reply) => {
    try {
      await CMSFormsService.deleteForm(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.get('/forms/:id/submissions', async (request: any, reply) => {
    const q = request.query as Record<string, string>;
    try {
      return await CMSFormsService.listSubmissions(request.user.tenant_id, (request.params as any).id, {
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
    } catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
}
