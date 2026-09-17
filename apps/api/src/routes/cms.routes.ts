import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSService, CommentValidationError } from '../services/cms.service.js';
import { listRevisions, getRevision } from '../services/cms-revisions.service.js';
import { CMSWebhooksService } from '../services/cms-webhooks.service.js';
import { callAI } from './ai.routes.js';
import { assertPublicHttpUrl } from '../lib/ssrf-guard.js';
import { withTenant } from '../db/client.js';
import { CMSCapabilitiesService, CMS_CAPABILITY_ROLES, CMS_CAPABILITY_AREAS } from '../services/cms-capabilities.service.js';
import type { CmsCapabilityArea } from '@hudumika/types';
import { CMS_FONT_IDS, CMS_RADIUS_PRESETS } from '@hudumika/types';

// §74 — TENANT_ADMIN is a live, still-issued legacy alias for ADMIN (see
// user.ts's own UserRole comment), never auto-normalized anywhere in this
// codebase — every file that wants admin-equivalent access lists both
// explicitly (metrics-registry.service.ts's METRICS_MGMT_ROLES, petti.
// service.ts's PETTI_OVERRIDE_ROLES, …). A bare `role !== 'ADMIN'` check
// silently locks out a real, currently-active class of admin accounts.
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

const PAGE_STATUSES = ['draft', 'published', 'scheduled'] as const; // Hudumika's own platform pages only — no trash UI exists for these
const TENANT_PAGE_STATUSES = ['draft', 'published', 'scheduled', 'trash'] as const;
const PAGE_TEMPLATES = ['standard', 'full-width', 'landing'] as const;
const POST_STATUSES = ['draft', 'published', 'scheduled', 'trash'] as const;
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
// §27 — canonical/noindex/og_image on both Pages and Posts.
const seoExtraFields = {
  canonical_url: z.string().max(2000).nullable().optional(),
  noindex: z.boolean().optional(),
  og_image: z.string().max(2000).nullable().optional(),
};
const pageCreateSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  site_id: z.string().uuid().nullable().optional(),
  content: z.string().optional(),
  status: z.enum(TENANT_PAGE_STATUSES).optional(),
  template: z.enum(PAGE_TEMPLATES).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
  locale: z.string().max(10).optional(),
  translation_group_id: z.string().uuid().nullable().optional(),
  ...seoExtraFields,
});
const pagePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  site_id: z.string().uuid().nullable().optional(),
  content: z.string().optional(),
  status: z.enum(TENANT_PAGE_STATUSES).optional(),
  template: z.enum(PAGE_TEMPLATES).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
  locale: z.string().max(10).optional(),
  translation_group_id: z.string().uuid().nullable().optional(),
  ...seoExtraFields,
});
const postCreateSchema = z.object({
  slug: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(300),
  site_id: z.string().uuid().nullable().optional(),
  content: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  category: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
  locale: z.string().max(10).optional(),
  translation_group_id: z.string().uuid().nullable().optional(),
  ...seoExtraFields,
});
const postPatchSchema = z.object({
  slug: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  site_id: z.string().uuid().nullable().optional(),
  content: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  category: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
  locale: z.string().max(10).optional(),
  translation_group_id: z.string().uuid().nullable().optional(),
  ...seoExtraFields,
});
const commentStatusSchema = z.object({ status: z.enum(COMMENT_STATUSES) });
const publicCommentCreateSchema = z.object({
  author: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(300).optional().or(z.literal('')),
  content: z.string().trim().min(1).max(5000),
  website: z.string().max(500).optional(), // honeypot — a real visitor's browser never fills this
});
const navItemCreateSchema = z.object({
  label: z.string().trim().min(1).max(100),
  target: z.string().trim().min(1).max(2000),
  parent_id: z.string().uuid().nullable().optional(),
});
const navItemPatchSchema = navItemCreateSchema.partial();
const navItemMoveSchema = z.object({ direction: z.enum(['up', 'down']) });
const WEBHOOK_EVENTS = ['page.published', 'post.published', 'entry.published', 'media.uploaded'] as const;
const webhookCreateSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).optional(),
});
const webhookPatchSchema = z.object({
  url: z.string().trim().min(1).max(2000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).optional(),
  enabled: z.boolean().optional(),
});
const siteSettingsPatchSchema = z.object({
  siteTitle: z.string().max(200).optional(),
  tagline: z.string().max(300).optional(),
  logoUrl: z.string().max(2000).optional(),
  faviconUrl: z.string().max(2000).optional(),
  accentColor: z.string().max(20).optional(),
  // §10 — allow-listed ids only, never a raw font/CSS value from a tenant.
  headingFont: z.enum(CMS_FONT_IDS).optional(),
  bodyFont: z.enum(CMS_FONT_IDS).optional(),
  radius: z.enum(CMS_RADIUS_PRESETS).optional(),
});
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
const bulkPageSchema = bulkSchema.extend({ status: z.enum(TENANT_PAGE_STATUSES) });
const bulkPostSchema = bulkSchema.extend({ status: z.enum(POST_STATUSES) });
const bulkCommentSchema = bulkSchema.extend({ status: z.enum(COMMENT_STATUSES) });

function listParams(query: Record<string, string>) {
  return {
    search: query.search,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
    site_id: query.site_id,
    locale: query.locale,
    translation_group_id: query.translation_group_id,
  };
}

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
    const previewToken = (request.query as any)?.preview as string | undefined;
    const page = await CMSService.getPublicPage(tenantSlug, pageSlug, previewToken);
    if (!page) return reply.status(404).send({ error: 'Page not found.' });
    return page;
  });

  // ── Public: search (§32) — no auth, published-only, reuses the admin's
  // own tsvector columns. ───────────────────────────────────────────────
  fastify.get('/public/:tenantSlug/search', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const q = String((request.query as any)?.q ?? '');
    try { return await CMSService.searchPublicSite(tenantSlug, q); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  // ── Public: blogging extras (§36) — RSS/Atom, date archives, author
  // pages. All read-only projections of data that already exists. ────────
  fastify.get('/public/:tenantSlug/sitemap.xml', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const xml = await CMSService.getSitemap(tenantSlug);
    if (xml === null) return reply.status(404).send({ error: 'Site not found.' });
    reply.header('Content-Type', 'application/xml; charset=utf-8');
    return reply.send(xml);
  });
  fastify.get('/public/:tenantSlug/feed.xml', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const xml = await CMSService.getRssFeed(tenantSlug);
    if (xml === null) return reply.status(404).send({ error: 'Site not found.' });
    reply.header('Content-Type', 'application/rss+xml; charset=utf-8');
    return reply.send(xml);
  });
  fastify.get('/public/:tenantSlug/blog/archive', async (request: any, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const months = await CMSService.getPublicArchiveIndex(tenantSlug);
    if (months === null) return reply.status(404).send({ error: 'Site not found.' });
    return months;
  });
  fastify.get('/public/:tenantSlug/blog/archive/:year/:month', async (request: any, reply) => {
    const { tenantSlug, year, month } = request.params as { tenantSlug: string; year: string; month: string };
    const y = parseInt(year, 10), m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return reply.status(400).send({ error: 'Invalid year/month.' });
    const posts = await CMSService.getPublicPostArchive(tenantSlug, y, m);
    if (posts === null) return reply.status(404).send({ error: 'Site not found.' });
    return posts;
  });
  fastify.get('/public/:tenantSlug/blog/author/:authorId', async (request: any, reply) => {
    const { tenantSlug, authorId } = request.params as { tenantSlug: string; authorId: string };
    const result = await CMSService.getPublicAuthorPage(tenantSlug, authorId);
    if (result === null) return reply.status(404).send({ error: 'Site not found.' });
    return result;
  });

  fastify.get('/public/:tenantSlug/posts/:postSlug', async (request: any, reply) => {
    const { tenantSlug, postSlug } = request.params as { tenantSlug: string; postSlug: string };
    const previewToken = (request.query as any)?.preview as string | undefined;
    const post = await CMSService.getPublicPost(tenantSlug, postSlug, previewToken);
    if (!post) return reply.status(404).send({ error: 'Post not found.' });
    return post;
  });

  // ── Public: blog comments (§37) — the submission surface the moderation
  // queue above was always missing. GET returns approved-only, no email.
  fastify.get('/public/:tenantSlug/posts/:postSlug/comments', async (request: any, reply) => {
    const { tenantSlug, postSlug } = request.params as { tenantSlug: string; postSlug: string };
    const comments = await CMSService.getPublicComments(tenantSlug, postSlug);
    if (comments === null) return reply.status(404).send({ error: 'Post not found.' });
    return comments;
  });
  fastify.post('/public/:tenantSlug/posts/:postSlug/comments', async (request: any, reply) => {
    const { tenantSlug, postSlug } = request.params as { tenantSlug: string; postSlug: string };
    const body = publicCommentCreateSchema.parse(request.body);
    try {
      const result = await CMSService.createPublicComment(tenantSlug, postSlug, body);
      if (result === null) return reply.status(404).send({ error: 'Post not found.' });
      reply.status(201);
      return result;
    } catch (err: any) {
      if (err instanceof CommentValidationError) return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  // ── Public: serve a media library file's bytes — no auth, same posture as
  // Drive's own public share links (unguessable UUID id). Content must
  // render on the unauthenticated public site, so this can't require a
  // tenant session the visitor never has. ────────────────────────────────
  fastify.get('/public/media/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const file = await CMSService.getPublicMediaFile(id);
    if (!file) return reply.status(404).send({ error: 'File not found.' });
    reply.header('Content-Type', file.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(file.buffer);
  });

  // §21-22 — falls back to the full file when no thumbnail was generated
  // (an SVG, or a type sharp couldn't handle), never a 404 for something
  // that genuinely exists.
  fastify.get('/public/media/:id/thumbnail', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const thumb = await CMSService.getPublicMediaThumbnail(id);
    if (thumb) {
      reply.header('Content-Type', thumb.mimeType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(thumb.buffer);
    }
    const file = await CMSService.getPublicMediaFile(id);
    if (!file) return reply.status(404).send({ error: 'File not found.' });
    reply.header('Content-Type', file.mimeType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(file.buffer);
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
      return await CMSService.upsertPlatformPage(request.user.sub, { ...body, slug });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant (OneSite): manage the tenant's own pages/posts/comments/settings ─
  // §50 — '/v1/cms/ai' (summarize-seo, suggest-tags) deliberately has no
  // CMS_AREA_BY_PREFIX entry, the same as '/v1/cms/capabilities': these
  // endpoints only ever return a suggestion, never persist anything
  // themselves, so the real §74 gate is the already-area-gated PATCH the
  // caller makes afterward to actually save it (pages/posts) — they still
  // require authenticated + entitled + non-CUSTOMER, just not a specific
  // area's 'manage' capability on top.
  const TENANT_PREFIXES = ['/v1/cms/pages', '/v1/cms/posts', '/v1/cms/comments', '/v1/cms/site-settings', '/v1/cms/media', '/v1/cms/nav-items', '/v1/cms/webhooks', '/v1/cms/capabilities', '/v1/cms/ai'];
  // §74 — url prefix -> the capability area it's gated by. '/v1/cms/capabilities'
  // itself isn't in this map: configuring capabilities is an ADMIN-only action
  // (enforced below), never itself subject to the capabilities it configures.
  const CMS_AREA_BY_PREFIX: Record<string, CmsCapabilityArea> = {
    '/v1/cms/pages': 'pages', '/v1/cms/posts': 'posts', '/v1/cms/comments': 'comments',
    '/v1/cms/media': 'media', '/v1/cms/site-settings': 'settings', '/v1/cms/nav-items': 'settings',
    '/v1/cms/webhooks': 'settings',
  };
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
      if (reply.sent) return;
      // Production-readiness audit HUD-0024/0027: nothing below this point
      // (including PUT /site-settings and DELETE /pages/:id) checked
      // anything beyond "authenticated + entitled" — a CUSTOMER-role portal
      // account could edit or delete the tenant's own public website.
      // Proven live: GET /v1/cms/pages returned 200 for a CUSTOMER JWT.
      if (request.user.role === 'CUSTOMER') {
        return reply.status(403).send({ error: 'Not available for this account type.' });
      }
      // §74 — configuring capabilities is ADMIN-only, full stop.
      if (url.startsWith('/v1/cms/capabilities') && !isCmsAdmin(request.user.role)) {
        return reply.status(403).send({ error: 'Only an administrator can manage CMS permissions.' });
      }
      // §74 — ADMIN always bypasses (never itself capability-restricted, the
      // same way SUPER_ADMIN bypasses platform-wide checks elsewhere). Any
      // other non-CUSTOMER role is checked against the configurable matrix,
      // which defaults to full access until an ADMIN explicitly narrows it.
      if (!isCmsAdmin(request.user.role)) {
        const areaPrefix = TENANT_PREFIXES.find(p => url.startsWith(p) && p !== '/v1/cms/capabilities');
        const area = areaPrefix ? CMS_AREA_BY_PREFIX[areaPrefix] : undefined;
        if (area) {
          const action = request.method === 'GET' ? 'view' : 'manage';
          const allowed = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, area, action);
          if (!allowed) return reply.status(403).send({ error: `Your role does not have ${action === 'view' ? 'access to' : 'permission to manage'} ${area} in the CMS.` });
          const body = request.body as any;
          if (body && typeof body === 'object' && body.status === 'published') {
            const canPublish = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, area, 'publish');
            if (!canPublish) return reply.status(403).send({ error: `Your role does not have permission to publish in ${area}.` });
          }
        }
      }
    }
  });

  fastify.get('/pages', async (request: any, reply) => {
    try {
      return await CMSService.getTenantPages(request.user.tenant_id, listParams(request.query));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/pages', async (request: any, reply) => {
    const body = pageCreateSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await CMSService.createTenantPage(request.user.tenant_id, request.user.sub, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/pages/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = pagePatchSchema.parse(request.body);
    try {
      return await CMSService.updateTenantPage(request.user.tenant_id, id, request.user.sub, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Pages: revision history (§19) ───────────────────────────────────────
  fastify.get('/pages/:id/revisions', async (request: any, reply) => {
    try { return await listRevisions(request.user.tenant_id, 'page', (request.params as any).id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.post('/pages/:id/revisions/:revId/restore', async (request: any, reply) => {
    const { id, revId } = request.params as { id: string; revId: string };
    try {
      const rev = await getRevision(request.user.tenant_id, 'page', id, revId);
      // §74 — the generic capability hook above only inspects the real
      // request body, which this route never sends a `status` field in; a
      // restored snapshot can still carry status:'published' on its own,
      // so a role with 'manage' but not 'publish' could otherwise restore
      // its way to a live page without ever tripping the publish check.
      if (!isCmsAdmin(request.user.role) && (rev.snapshot as any)?.status === 'published') {
        const canPublish = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'pages', 'publish');
        if (!canPublish) return reply.status(403).send({ error: 'Your role does not have permission to publish in pages.' });
      }
      return await CMSService.updateTenantPage(request.user.tenant_id, id, request.user.sub, rev.snapshot as any);
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  // §38 — secure preview link, minted for an editor with 'view' access on
  // pages (the shared preHandler above already gates GET this way).
  fastify.get('/pages/:id/preview-token', async (request: any, reply) => {
    try {
      return await CMSService.createPagePreviewToken(request.user.tenant_id, (request.params as any).id);
    } catch (err: any) { return reply.status(404).send({ error: err.message }); }
  });

  fastify.delete('/pages/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await CMSService.deleteTenantPage(request.user.tenant_id, id, request.user.sub);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/pages/bulk', async (request: any, reply) => {
    const body = bulkPageSchema.parse(request.body);
    try {
      const results = await CMSService.bulkUpdatePages(request.user.tenant_id, body.ids, body.status, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/pages/bulk-delete', async (request: any, reply) => {
    const body = bulkSchema.parse(request.body);
    try {
      const results = await CMSService.bulkDeletePages(request.user.tenant_id, body.ids, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Posts ────────────────────────────────────────────────────────
  fastify.get('/posts', async (request: any, reply) => {
    try {
      return await CMSService.getTenantPosts(request.user.tenant_id, listParams(request.query));
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/posts', async (request: any, reply) => {
    const body = postCreateSchema.parse(request.body);
    try {
      return reply.status(201).send(
        await CMSService.createTenantPost(request.user.tenant_id, request.user.sub, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/posts/:id', async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = postPatchSchema.parse(request.body);
    try {
      return await CMSService.updateTenantPost(request.user.tenant_id, id, request.user.sub, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Posts: revision history (§19) ───────────────────────────────────────
  fastify.get('/posts/:id/revisions', async (request: any, reply) => {
    try { return await listRevisions(request.user.tenant_id, 'post', (request.params as any).id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.post('/posts/:id/revisions/:revId/restore', async (request: any, reply) => {
    const { id, revId } = request.params as { id: string; revId: string };
    try {
      const rev = await getRevision(request.user.tenant_id, 'post', id, revId);
      // §74 — see the same guard on the page-restore route just above.
      if (!isCmsAdmin(request.user.role) && (rev.snapshot as any)?.status === 'published') {
        const canPublish = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'posts', 'publish');
        if (!canPublish) return reply.status(403).send({ error: 'Your role does not have permission to publish in posts.' });
      }
      return await CMSService.updateTenantPost(request.user.tenant_id, id, request.user.sub, rev.snapshot as any);
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  // §38 — same preview-link minting as pages, above.
  fastify.get('/posts/:id/preview-token', async (request: any, reply) => {
    try {
      return await CMSService.createPostPreviewToken(request.user.tenant_id, (request.params as any).id);
    } catch (err: any) { return reply.status(404).send({ error: err.message }); }
  });

  // Real delete — was missing entirely, so a post moved to Trash (the
  // existing PATCH status='trash') had no way to ever actually be removed.
  fastify.delete('/posts/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await CMSService.deleteTenantPost(request.user.tenant_id, id, request.user.sub);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/posts/bulk', async (request: any, reply) => {
    const body = bulkPostSchema.parse(request.body);
    try {
      const results = await CMSService.bulkUpdatePosts(request.user.tenant_id, body.ids, body.status, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/posts/bulk-delete', async (request: any, reply) => {
    const body = bulkSchema.parse(request.body);
    try {
      const results = await CMSService.bulkDeletePosts(request.user.tenant_id, body.ids, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Comments (moderation) ──────────────────────────────────────────
  fastify.get('/comments', async (request: any, reply) => {
    try {
      return await CMSService.getTenantComments(request.user.tenant_id, listParams(request.query));
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

  fastify.post('/comments/bulk', async (request: any, reply) => {
    const body = bulkCommentSchema.parse(request.body);
    try {
      const results = await CMSService.bulkUpdateComments(request.user.tenant_id, body.ids, body.status);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/comments/bulk-delete', async (request: any, reply) => {
    const body = bulkSchema.parse(request.body);
    try {
      const results = await CMSService.bulkDeleteComments(request.user.tenant_id, body.ids);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Tenant: Media library ──────────────────────────────────────────────────
  fastify.get('/media', async (request: any, reply) => {
    try {
      const query = request.query as { folder?: string; tag?: string };
      // folder='' (an explicit empty string, e.g. ?folder=) asks for the
      // unfiled bucket; folder entirely absent from the query means "every
      // folder" — CMSService.getMedia tells those apart by undefined vs ''.
      return await CMSService.getMedia(request.user.tenant_id, { folder: query.folder, tag: query.tag });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/media/folders', async (request: any, reply) => {
    try { return await CMSService.listMediaFolders(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.post('/media', async (request: any, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded.' });
    if (!data.mimetype.startsWith('image/')) {
      return reply.status(400).send({ error: 'Only image files are supported.' });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Images are limited to 10MB.' });
    }
    try {
      const media = await CMSService.uploadMedia(
        request.user.tenant_id, request.user.sub, data.filename || 'image', data.mimetype, buffer,
      );
      reply.status(201);
      return media;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/media/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await CMSService.deleteMedia(request.user.tenant_id, id, request.user.sub);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // §21-22 — folder/tags are metadata edits, not a re-upload.
  fastify.patch('/media/:id', async (request: any, reply) => {
    const body = z.object({ folder: z.string().max(120).nullable().optional(), tags: z.string().max(500).nullable().optional() }).parse(request.body);
    try {
      const { id } = request.params as { id: string };
      return await CMSService.updateMedia(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * POST /v1/cms/media/generate-alt-text — §50 of the brief ("Alt-text
   * generation on media upload is the highest-value single feature here").
   * Alt text is contextual to *where* an image is placed, not a property of
   * the shared cms_media row, so this takes whatever URL is currently in the
   * Block Editor's image block — the tenant's own Media library or a pasted
   * external one — rather than writing back to cms_media itself. Reuses
   * ai.routes.ts's callAI() and the tenant's own BYO Anthropic key (same
   * `int-ai` Settings config every other AI feature reads), not a new
   * integration. assertPublicHttpUrl guards the server-side fetch the same
   * way every other "fetch a URL a tenant configured" integration already
   * is (Onsite uptime monitors, workflow webhooks, marketplace app hooks).
   */
  const SUPPORTED_ALT_TEXT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  const MAX_ALT_TEXT_IMAGE_BYTES = 5 * 1024 * 1024;
  fastify.post('/media/generate-alt-text', async (request: any, reply) => {
    const { url } = z.object({ url: z.string().trim().min(1) }).parse(request.body);
    const user = request.user;

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }
    if (aiCfg.provider && aiCfg.provider !== 'anthropic') {
      return reply.status(400).send({ error: 'Alt-text generation currently requires an Anthropic (Claude) API key — set one in Settings > Integrations > AI Integration.' });
    }

    try {
      await assertPublicHttpUrl(url);
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    let imgRes: globalThis.Response;
    try {
      imgRes = await fetch(url);
    } catch {
      return reply.status(400).send({ error: 'Could not fetch that image URL.' });
    }
    if (!imgRes.ok) return reply.status(400).send({ error: `Could not fetch that image (HTTP ${imgRes.status}).` });
    const contentType = (imgRes.headers.get('content-type') || '').split(';')[0].trim();
    if (!SUPPORTED_ALT_TEXT_IMAGE_TYPES.has(contentType)) {
      return reply.status(400).send({ error: `Unsupported image type "${contentType || 'unknown'}" — JPEG, PNG, GIF and WebP are supported.` });
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    if (buffer.byteLength > MAX_ALT_TEXT_IMAGE_BYTES) {
      return reply.status(400).send({ error: 'Image is too large (max 5MB) for alt-text generation.' });
    }

    const messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: contentType, data: buffer.toString('base64') } },
        { type: 'text', text: 'Write concise, accurate alt text for this image for a screen-reader user: one plain sentence, under 125 characters, describing what matters visually. No "image of" / "picture of" prefix, no markdown, no quotes.' },
      ],
    }];

    try {
      const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', 'anthropic', messages, 150, 0.3);
      const alt = raw.trim().replace(/^["']|["']$/g, '');
      if (!alt) return reply.status(500).send({ error: 'AI returned an empty response — try again.' });
      return { alt };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  /**
   * §50 of the brief — two of the three remaining, genuinely unblocked
   * sub-features ("summarize" and "tagging"; the third, "rewrite," lives in
   * cms-content.routes.ts instead since its only real caller — the Block
   * Editor's TextFormatToolbar — is only ever mounted from Content-entry
   * and Component editing, both of which live there, not here; Pages/Posts
   * still edit through RichTextEditor's one HTML blob, per §5's own fork.
   * The fourth sub-feature, "translate," stays correctly blocked on
   * §25-26's still-nonexistent locale field, not addressed here. Same
   * BYO-key pattern as the alt-text route above (ai.routes.ts's callAI(),
   * the tenant's own `int-ai` Settings config) — but unlike alt-text these
   * are plain-text calls, not vision, so they work with whichever provider
   * the tenant configured (Anthropic or OpenAI), not Anthropic-only.
   */
  async function requireAiConfig(tenantId: string, reply: any) {
    const settings = await withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
      return row?.settings as any ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
      return null;
    }
    return aiCfg;
  }

  // POST /v1/cms/ai/summarize-seo — summarizes a Page/Post's own content
  // into a real SEO meta description (§27's already-shipped seo_description
  // field), not a generic summary — length-instructed to the actual bound
  // search engines honor. `text` is HTML (RichTextEditor's own output);
  // stripped to plain text server-side via the same sanitize-html
  // dependency cms.service.ts's own sanitizeContent() already uses, rather
  // than sending markup tags into the prompt.
  fastify.post('/ai/summarize-seo', async (request: any, reply) => {
    const { text } = z.object({ text: z.string().trim().min(1) }).parse(request.body);
    const aiCfg = await requireAiConfig(request.user.tenant_id, reply);
    if (!aiCfg) return;
    const plain = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim().slice(0, 8000);
    if (!plain) return reply.status(400).send({ error: 'There is no text content yet to summarize.' });
    try {
      const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
        [{ role: 'user', content: `Write a compelling meta description for this content, for search engine results and social previews. One or two sentences, 120-155 characters, plain text, no quotes, no markdown.\n\n${plain}` }],
        150, 0.4);
      const result = raw.trim().replace(/^["']|["']$/g, '').slice(0, 500);
      if (!result) return reply.status(500).send({ error: 'AI returned an empty response — try again.' });
      return { result };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // POST /v1/cms/ai/suggest-tags — suggests short tags for a Post from its
  // title + content, matching CmsPost.tags' own existing plain
  // comma-separated-text convention (never a new array column).
  fastify.post('/ai/suggest-tags', async (request: any, reply) => {
    const { title, text } = z.object({ title: z.string().trim().max(300).optional(), text: z.string().trim().min(1) }).parse(request.body);
    const aiCfg = await requireAiConfig(request.user.tenant_id, reply);
    if (!aiCfg) return;
    const plain = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim().slice(0, 6000);
    if (!plain) return reply.status(400).send({ error: 'There is no text content yet to tag.' });
    try {
      const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
        [{ role: 'user', content: `Suggest 3-6 short, lowercase tags for this blog post. Respond ONLY with a valid JSON array of strings, nothing else, e.g. ["logistics","east-africa"].\n\nTitle: ${title || '(untitled)'}\n\nContent:\n${plain}` }],
        150, 0.3);
      let tags: unknown;
      try { tags = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim()); } catch { tags = null; }
      if (!Array.isArray(tags)) return reply.status(500).send({ error: 'AI returned an unexpected response — try again.' });
      const cleaned = tags.map(t => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 6);
      if (!cleaned.length) return reply.status(500).send({ error: 'AI returned no usable tags — try again.' });
      return { tags: cleaned };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });

  // ── Tenant: Navigation builder (§14) ────────────────────────────────────
  fastify.get('/nav-items', async (request: any, reply) => {
    try { return await CMSService.listNavItems(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.post('/nav-items', async (request: any, reply) => {
    const body = navItemCreateSchema.parse(request.body);
    try {
      const item = await CMSService.createNavItem(request.user.tenant_id, body);
      reply.status(201);
      return item;
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.patch('/nav-items/:id', async (request: any, reply) => {
    const body = navItemPatchSchema.parse(request.body);
    try { return await CMSService.updateNavItem(request.user.tenant_id, (request.params as any).id, body); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.delete('/nav-items/:id', async (request: any, reply) => {
    try {
      await CMSService.deleteNavItem(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.post('/nav-items/:id/move', async (request: any, reply) => {
    const body = navItemMoveSchema.parse(request.body);
    try { return await CMSService.moveNavItem(request.user.tenant_id, (request.params as any).id, body.direction); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  // ── Tenant: Webhooks (§78) ──────────────────────────────────────────────
  fastify.get('/webhooks', async (request: any, reply) => {
    try { return await CMSWebhooksService.list(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.post('/webhooks', async (request: any, reply) => {
    const body = webhookCreateSchema.parse(request.body);
    try {
      const hook = await CMSWebhooksService.create(request.user.tenant_id, request.user.sub, body);
      reply.status(201);
      return hook;
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.patch('/webhooks/:id', async (request: any, reply) => {
    const body = webhookPatchSchema.parse(request.body);
    try { return await CMSWebhooksService.update(request.user.tenant_id, (request.params as any).id, body); }
    catch (err: any) { return reply.status(err.message === 'Webhook not found.' ? 404 : 400).send({ error: err.message }); }
  });
  fastify.delete('/webhooks/:id', async (request: any, reply) => {
    try {
      await CMSWebhooksService.delete(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.post('/webhooks/:id/test', async (request: any, reply) => {
    try { return await CMSWebhooksService.sendTest(request.user.tenant_id, (request.params as any).id); }
    catch (err: any) { return reply.status(err.message === 'Webhook not found.' ? 404 : 400).send({ error: err.message }); }
  });

  // ── Tenant: Role capabilities / Permissions (§74) — ADMIN-only, enforced
  // in the shared preHandler above. ────────────────────────────────────────
  fastify.get('/capabilities', async (request: any, reply) => {
    try { return await CMSCapabilitiesService.listResolved(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.patch('/capabilities/:role/:area', async (request: any, reply) => {
    const { role, area } = request.params as { role: string; area: CmsCapabilityArea };
    if (!(CMS_CAPABILITY_ROLES as readonly string[]).includes(role) || !CMS_CAPABILITY_AREAS.includes(area)) {
      return reply.status(400).send({ error: 'Unknown role or area.' });
    }
    const body = z.object({ can_view: z.boolean().optional(), can_manage: z.boolean().optional(), can_publish: z.boolean().optional() }).parse(request.body);
    try {
      return await CMSCapabilitiesService.set(request.user.tenant_id, request.user.sub, role, area, body);
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });
  fastify.delete('/capabilities/:role/:area', async (request: any, reply) => {
    const { role, area } = request.params as { role: string; area: CmsCapabilityArea };
    try {
      await CMSCapabilitiesService.reset(request.user.tenant_id, role, area);
      return { ok: true };
    } catch (err: any) { return reply.status(400).send({ error: err.message }); }
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
