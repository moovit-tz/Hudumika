import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSService } from '../services/cms.service.js';

/**
 * CMS — Hudumika's own public pages (Privacy, Terms, ...) plus each tenant's
 * OneSite pages. Mixed-auth like platform.routes.ts: the public read route
 * carries no auth hook at all (pre-login visitors need it), the platform
 * admin routes are SUPER_ADMIN-only, and the tenant routes are gated by the
 * 'onesite' entitlement — so no single blanket preHandler for this file.
 */
export async function cmsRoutes(fastify: FastifyInstance) {

  // ── Public: read a published platform page ────────────────────────────────
  fastify.get('/platform-pages/:slug', async (request: any, reply) => {
    const { slug } = request.params as { slug: string };
    const page = await CMSService.getPublishedPlatformPage(slug);
    if (!page) return reply.status(404).send({ error: 'Page not found.' });
    return page;
  });

  // ── Public: a tenant's OneSite (unauthenticated visitor-facing pages) ─────
  fastify.get('/public/:tenantSlug', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const site = await CMSService.getPublicSite(tenantSlug);
    if (!site) return reply.status(404).send({ error: 'Site not found.' });
    return site;
  });

  fastify.get('/public/:tenantSlug/pages/:pageSlug', async (request: any, reply) => {
    const { tenantSlug, pageSlug } = request.params as { tenantSlug: string; pageSlug: string };
    const page = await CMSService.getPublicPage(tenantSlug, pageSlug);
    if (!page) return reply.status(404).send({ error: 'Page not found.' });
    return page;
  });

  // ── SuperAdmin: manage platform pages ──────────────────────────────────────
  fastify.get('/platform-admin/pages', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (_request, reply) => {
    try {
      return await CMSService.getPlatformPages();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/platform-admin/pages/:slug', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request: any, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      return await CMSService.getPlatformPage(slug);
    } catch (err: any) {
      return reply.status(404).send({ error: 'Page not found.' });
    }
  });

  fastify.put('/platform-admin/pages/:slug', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request: any, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      return await CMSService.upsertPlatformPage(request.user.id, { ...request.body, slug });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant (OneSite): manage the tenant's own pages/posts/comments/settings ─
  const TENANT_PREFIXES = ['/v1/cms/pages', '/v1/cms/posts', '/v1/cms/comments', '/v1/cms/site-settings'];
  fastify.addHook('preHandler', async (request: any, reply) => {
    // Only tenant routes below this point need the entitlement + auth combo;
    // apply it selectively by prefix rather than to the whole plugin (the
    // public /platform-pages and /public/:tenantSlug routes above must stay
    // unauthenticated).
    const url = request.raw.url as string | undefined;
    if (url && TENANT_PREFIXES.some(p => url.startsWith(p))) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      await requireEntitlement('onesite')(request, reply);
    }
  });

  fastify.get('/pages', async (request: any, reply) => {
    try {
      return await CMSService.getTenantPages(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/pages', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await CMSService.createTenantPage(request.user.tenant_id, request.user.id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/pages/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await CMSService.updateTenantPage(request.user.tenant_id, id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/pages/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await CMSService.deleteTenantPage(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Posts ────────────────────────────────────────────────────────
  fastify.get('/posts', async (request: any, reply) => {
    try {
      return await CMSService.getTenantPosts(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/posts', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await CMSService.createTenantPost(request.user.tenant_id, request.user.id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/posts/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await CMSService.updateTenantPost(request.user.tenant_id, id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Comments (moderation) ──────────────────────────────────────────
  fastify.get('/comments', async (request: any, reply) => {
    try {
      return await CMSService.getTenantComments(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch('/comments/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: 'approved' | 'pending' | 'spam' };
      await CMSService.updateCommentStatus(request.user.tenant_id, id, status);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/comments/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await CMSService.deleteComment(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Site settings (Customize) ──────────────────────────────────────
  fastify.get('/site-settings', async (request: any, reply) => {
    try {
      return await CMSService.getSiteSettings(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.put('/site-settings', async (request: any, reply) => {
    try {
      return await CMSService.updateSiteSettings(request.user.tenant_id, request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
