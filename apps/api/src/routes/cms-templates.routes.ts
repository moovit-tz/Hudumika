import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSTemplatesService, ValidationError } from '../services/cms-templates.service.js';

// Same admin-equivalence list cms.routes.ts / cms-content.routes.ts each
// carry their own copy of — TENANT_ADMIN is a live, still-issued legacy
// alias for ADMIN, never auto-normalized anywhere in this codebase.
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

function handleError(reply: any, err: any) {
  if (err instanceof ValidationError) return reply.status(400).send({ error: err.message });
  return reply.status(500).send({ error: err?.message || 'Request failed' });
}

/**
 * §45-46 of the CMS brief — installable starting points, "not a template
 * you build, a template you use": a small in-code catalog of starter Pages/
 * Posts/Nav a brand-new, empty tenant site can install in one click instead
 * of starting from a blank Customize form. Registered at the same /v1/cms
 * prefix as cms.routes.ts / cms-content.routes.ts, but — same HUD-0024
 * lesson those files' own comments document — a sibling Fastify plugin does
 * NOT inherit another plugin's hooks even under one shared prefix, so this
 * file carries its own complete auth/entitlement/CUSTOMER-exclusion gate.
 */
export async function cmsTemplatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    if (url && url.startsWith('/v1/cms/templates')) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      await requireEntitlement('onesite')(request, reply);
      if (reply.sent) return;
      if (request.user.role === 'CUSTOMER') {
        return reply.status(403).send({ error: 'Not available for this account type.' });
      }
      // Installing seeds real, published content in bulk — treated as an
      // admin-only action, the same posture cms.routes.ts's own
      // /capabilities route takes, rather than folding it into the
      // per-role content capability matrix.
      if (request.method === 'POST' && !isCmsAdmin(request.user.role)) {
        return reply.status(403).send({ error: 'Only a workspace admin can install a template.' });
      }
    }
  });

  fastify.get('/templates', async () => {
    return { data: CMSTemplatesService.listTemplates() };
  });

  fastify.post('/templates/:key/install', async (request: any, reply) => {
    const { key } = z.object({ key: z.string().trim().min(1).max(60) }).parse(request.params);
    try {
      const result = await CMSTemplatesService.installTemplate(request.user.tenant_id, request.user.sub, key);
      return { data: result };
    } catch (err: any) { return handleError(reply, err); }
  });
}
