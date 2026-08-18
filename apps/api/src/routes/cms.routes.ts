import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSService } from '../services/cms.service.js';

const PAGE_STATUSES = ['draft', 'published'] as const;
const POST_STATUSES = ['draft', 'published', 'trash'] as const;
const COMMENT_STATUSES = ['approved', 'pending', 'spam'] as const;

// content is raw HTML from RichTextEditor — CMSService.sanitizeContent()
// strips anything outside its toolbar allowlist before it ever reaches the
// DB, so these schemas are shape-guards only, not the sanitization layer.
const platformPageUpsertSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().optional(),
  status: z.enum(PAGE_STATUSES).optional(),
  seo_description: z.string().max(500).nullable().optional(),
});
const pageCreateSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  content: z.string().optional(),
  status: z.enum(PAGE_STATUSES).optional(),
  seo_description: z.string().max(500).nullable().optional(),
});
const pagePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().optional(),
  status: z.enum(PAGE_STATUSES).optional(),
  seo_description: z.string().max(500).nullable().optional(),
});
const postCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  category: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
});
const postPatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  category: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
});
const commentStatusSchema = z.object({ status: z.enum(COMMENT_STATUSES) });
const siteSettingsPatchSchema = z.object({
  siteTitle: z.string().max(200).optional(),
  tagline: z.string().max(300).optional(),
  logoUrl: z.string().max(2000).optional(),
  faviconUrl: z.string().max(2000).optional(),
  accentColor: z.string().max(20).optional(),
});

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
    const { slug } = request.params as { slug: string };
    const body = platformPageUpsertSchema.parse(request.body);
    try {
      return await CMSService.upsertPlatformPage(request.user.id, { ...body, slug });
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
    const body = pageCreateSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await CMSService.createTenantPage(request.user.tenant_id, request.user.id, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/pages/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = pagePatchSchema.parse(request.body);
    try {
      return await CMSService.updateTenantPage(request.user.tenant_id, id, body);
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
    const body = postCreateSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await CMSService.createTenantPost(request.user.tenant_id, request.user.id, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/posts/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = postPatchSchema.parse(request.body);
    try {
      return await CMSService.updateTenantPost(request.user.tenant_id, id, body);
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
    const { id } = request.params as { id: string };
    const { status } = commentStatusSchema.parse(request.body);
    try {
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
    const body = siteSettingsPatchSchema.parse(request.body);
    try {
      return await CMSService.updateSiteSettings(request.user.tenant_id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
