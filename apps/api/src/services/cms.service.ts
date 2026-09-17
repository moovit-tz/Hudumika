import crypto from 'node:crypto';
import { sql } from 'kysely';
import sanitizeHtml from 'sanitize-html';
import { env } from '../config/env.js';
import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { recordRevision, deleteRevisions } from './cms-revisions.service.js';
import { CMSWebhooksService } from './cms-webhooks.service.js';
import { emitDomainEvent } from './domain-events.service.js';
import type {
  CmsPage, CreateCmsPageInput, UpdateCmsPageInput,
  CmsPost, CreateCmsPostInput, UpdateCmsPostInput,
  CmsComment, CmsCommentStatus,
  CmsMedia,
  CmsSiteSettings, CmsPublicSite, CmsPublicPost,
  CmsPublicComment, CreateCmsCommentInput,
  CmsNavItem, CreateCmsNavItemInput, UpdateCmsNavItemInput, CmsPublicNavItem,
  CmsPublicSearchResult, CmsPublicPostSummary, CmsPublicArchiveMonth,
} from '@hudumika/types';

export class CommentValidationError extends Error {}

// ── Sanitization ──────────────────────────────────────────────────────────────
// Content is authored via RichTextEditor's fixed toolbar (bold/italic/underline/
// headings/lists/links/blockquote/image) — this allowlist matches that toolbar
// exactly plus the structural tags legal-page content needs (p, table), so
// nothing an admin can actually produce gets stripped, while anything else
// (script, iframe, event handlers, javascript: URLs) is removed before it
// ever reaches the DB. img's src is restricted to http(s) the same as `a`'s
// href — no data: URIs, which would bypass the media library entirely and
// bloat every page load with inline base64.
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'ul', 'ol', 'li', 'a', 'blockquote', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      h2: ['id'],
      h3: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

/** Plain-text snippet for a public post-list summary — strip tags, collapse
 *  whitespace, cut to a reasonable teaser length. Not a separately authored
 *  field (see CmsPublicPostSummary's own comment). */
/** §27 — a canonical URL, when set at all, must be a real absolute URL (same
 *  http(s)-prefix rule already applied to every other URL field this
 *  session — block button/image URLs, component links). Empty/null passes
 *  through unchanged; that's the normal "use the real URL" case. */
function checkCanonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//.test(trimmed)) throw new Error('Canonical URL must start with http:// or https://.');
  return trimmed;
}

/**
 * §62 — maps a status transition to the semantic audit-event suffix an
 * admin's Activity trail should read ("Published"/"Trashed"/"Restored"),
 * shared by Pages, Posts and Content entries (cms-content.service.ts
 * imports this) so the same transition reads identically everywhere. Only
 * called when a caller actually sent a `status` field — autosave's PATCH
 * never does, which is what keeps a domain event from firing on every
 * 2-second autosave tick rather than only on a real Save Draft/Publish/
 * Schedule/Trash/Restore action.
 */
export function statusTransitionEvent(prevStatus: string | undefined, nextStatus: string): string {
  if (nextStatus === 'published') return 'published';
  if (nextStatus === 'trash') return 'trashed';
  if (prevStatus === 'trash' && nextStatus !== 'trash') return 'restored';
  return 'status_changed';
}

export type CmsPreviewResourceType = 'page' | 'post' | 'entry';
const PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * §38 — secure preview links for a draft/scheduled Page, Post or Content
 * entry, so an editor can share an unpublished item with a reviewer without
 * granting them a CMS login. Same HMAC+timingSafeEqual shape as
 * object-storage.ts's presignGet/verifyDiskSignedUrl (its own established
 * precedent for a tamper-proof, time-limited signed value), keyed to the
 * exact resource row rather than its slug so a later rename can't strand or
 * misdirect an outstanding link. Deliberately time-limited (24h) rather than
 * single-use: a preview link is meant to be reloaded/browsed/shared with a
 * reviewer, and a true single-use token would go dead after the first page
 * load, which is not what "preview" means in practice.
 */
export function generatePreviewToken(resourceType: CmsPreviewResourceType, resourceId: string): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SECONDS;
  const secret = env.FILE_SIGNING_SECRET || env.JWT_SECRET;
  const sig = crypto.createHmac('sha256', secret).update(`${resourceType}\n${resourceId}\n${exp}`).digest('hex');
  return { token: `${exp}.${sig}`, expiresAt: exp };
}

export function verifyPreviewToken(resourceType: CmsPreviewResourceType, resourceId: string, token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const expNum = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(expNum) || !sig || expNum * 1000 < Date.now()) return false;
  const secret = env.FILE_SIGNING_SECRET || env.JWT_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${resourceType}\n${resourceId}\n${expNum}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function excerptOf(html: string, maxLen = 180): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
}

function slugifyBase(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
}

function toCmsPage(row: any): CmsPage {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    site_id: row.site_id ?? null,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    template: row.template ?? 'standard',
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    noindex: !!row.noindex,
    og_image: row.og_image,
    author_id: row.author_id,
    publish_at: row.publish_at ? (row.publish_at as Date).toISOString() : null,
    trashed_at: row.trashed_at ? (row.trashed_at as Date).toISOString() : null,
    locale: row.locale ?? 'en',
    translation_group_id: row.translation_group_id ?? null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

function toCmsPost(row: any): CmsPost {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    site_id: row.site_id ?? null,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    author_id: row.author_id,
    category: row.category,
    tags: row.tags,
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    noindex: !!row.noindex,
    og_image: row.og_image,
    publish_at: row.publish_at ? (row.publish_at as Date).toISOString() : null,
    trashed_at: row.trashed_at ? (row.trashed_at as Date).toISOString() : null,
    locale: row.locale ?? 'en',
    translation_group_id: row.translation_group_id ?? null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

// Only the fields an author would recognize as "the content" — never id/
// tenant_id/author_id/created_at/updated_at, which aren't meaningful to
// diff or restore.
function pageRevisionSnapshot(page: CmsPage): Record<string, unknown> {
  return { slug: page.slug, title: page.title, content: page.content, status: page.status, template: page.template, seo_description: page.seo_description, canonical_url: page.canonical_url, noindex: page.noindex, og_image: page.og_image, publish_at: page.publish_at, locale: page.locale, site_id: page.site_id, translation_group_id: page.translation_group_id };
}
function postRevisionSnapshot(post: CmsPost): Record<string, unknown> {
  return { slug: post.slug, title: post.title, content: post.content, status: post.status, category: post.category, tags: post.tags, seo_description: post.seo_description, canonical_url: post.canonical_url, noindex: post.noindex, og_image: post.og_image, publish_at: post.publish_at, locale: post.locale, site_id: post.site_id, translation_group_id: post.translation_group_id };
}

function toCmsNavItem(row: any): CmsNavItem {
  return {
    id: row.id, tenant_id: row.tenant_id, label: row.label, target: row.target,
    parent_id: row.parent_id, sort_order: row.sort_order,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}

function toCmsComment(row: any): CmsComment {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    post_id: row.post_id,
    author: row.author,
    email: row.email,
    content: row.content,
    status: row.status,
    created_at: (row.created_at as Date).toISOString(),
  };
}

// §10 — 'system'/'rounded' as defaults exactly match what every tenant's
// public site already rendered before this row existed (system font stack,
// the ~8px radius hardcoded throughout OneSitePublic.css), so leaving these
// unset is a visual no-op — the same "default preserves current behavior"
// posture accentColor's own '#0d7a6b' already established.
const DEFAULT_SITE_SETTINGS: CmsSiteSettings = {
  siteTitle: '', tagline: '', logoUrl: '', faviconUrl: '', accentColor: '#0d7a6b',
  headingFont: 'system', bodyFont: 'system', radius: 'rounded',
};

export interface ListParams {
  search?: string;
  limit?: number;
  offset?: number;
  site_id?: string;
  locale?: string;
  translation_group_id?: string;
}

export interface BulkResult {
  id: string;
  ok: boolean;
  error?: string;
}

export class CMSService {

  // ── Platform pages (Hudumika's own — tenant_id IS NULL) ──────────────────

  /** Public — only ever returns a published page. */
  static async getPublishedPlatformPage(slug: string): Promise<CmsPage | null> {
    const row = await dbPlatform
      .selectFrom('cms_pages')
      .selectAll()
      .where('tenant_id', 'is', null)
      .where('slug', '=', slug)
      .where('status', '=', 'published')
      .executeTakeFirst();
    return row ? toCmsPage(row) : null;
  }

  /** SuperAdmin — all statuses. */
  static async getPlatformPages(): Promise<CmsPage[]> {
    const rows = await dbPlatform
      .selectFrom('cms_pages')
      .selectAll()
      .where('tenant_id', 'is', null)
      .orderBy('slug', 'asc')
      .execute();
    return rows.map(toCmsPage);
  }

  static async getPlatformPage(slug: string): Promise<CmsPage> {
    const row = await dbPlatform
      .selectFrom('cms_pages')
      .selectAll()
      .where('tenant_id', 'is', null)
      .where('slug', '=', slug)
      .executeTakeFirstOrThrow();
    return toCmsPage(row);
  }

  /** Upsert-by-slug — a platform page's slug is its stable identity. */
  static async upsertPlatformPage(userId: string, input: CreateCmsPageInput): Promise<CmsPage> {
    const content = sanitizeContent(input.content ?? '');
    const existing = await dbPlatform
      .selectFrom('cms_pages')
      .select('id')
      .where('tenant_id', 'is', null)
      .where('slug', '=', input.slug)
      .executeTakeFirst();

    if (existing) {
      const row = await dbPlatform
        .updateTable('cms_pages')
        .set({
          title: input.title,
          content,
          status: input.status ?? 'draft',
          seo_description: input.seo_description ?? null,
          author_id: userId,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCmsPage(row);
    }

    const row = await dbPlatform
      .insertInto('cms_pages')
      .values({
        tenant_id: null,
        slug: input.slug,
        title: input.title,
        content,
        status: input.status ?? 'draft',
        seo_description: input.seo_description ?? null,
        author_id: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toCmsPage(row);
  }

  // ── Tenant pages (OneSite — tenant_id set) ────────────────────────────────

  static async getTenantPages(tenantId: string, params: ListParams = {}): Promise<CmsPage[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('cms_pages').selectAll().where('tenant_id', '=', tenantId);
      if (params.site_id) {
        q = q.where('site_id', '=', params.site_id);
      }
      if (params.locale) {
        q = q.where('locale', '=', params.locale);
      }
      if (params.translation_group_id) {
        q = q.where('translation_group_id', '=', params.translation_group_id);
      }
      if (params.search?.trim()) {
        q = q.where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${params.search.trim()})`);
      }
      const rows = await q.orderBy('created_at', 'desc')
        .limit(Math.min(Math.max(params.limit ?? 100, 1), 200))
        .offset(Math.max(params.offset ?? 0, 0))
        .execute();
      return rows.map(toCmsPage);
    });
  }

  static async createTenantPage(tenantId: string, userId: string, input: CreateCmsPageInput): Promise<CmsPage> {
    const canonicalUrl = checkCanonicalUrl(input.canonical_url);
    return withTenant(tenantId, async (trx) => {
      const row = await trx
        .insertInto('cms_pages')
        .values({
          tenant_id: tenantId,
          site_id: input.site_id ?? null,
          slug: input.slug,
          title: input.title,
          content: sanitizeContent(input.content ?? ''),
          status: input.status ?? 'draft',
          template: input.template ?? 'standard',
          seo_description: input.seo_description ?? null,
          canonical_url: canonicalUrl,
          noindex: input.noindex ?? false,
          og_image: input.og_image ?? null,
          author_id: userId,
          publish_at: input.publish_at ? new Date(input.publish_at) : null,
          locale: input.locale || 'en',
          translation_group_id: input.translation_group_id || undefined,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const page = toCmsPage(row);
      await recordRevision(trx, tenantId, 'page', page.id, pageRevisionSnapshot(page), userId);
      if (page.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'page.published', { id: page.id, slug: page.slug, title: page.title });
      await emitDomainEvent(trx, tenantId, { type: 'page.created', sourceApp: 'onesite', entityType: 'page', entityId: page.id, payload: { title: page.title, slug: page.slug, status: page.status }, actorId: userId });
      if (page.status === 'published') {
        await emitDomainEvent(trx, tenantId, { type: 'page.published', sourceApp: 'onesite', entityType: 'page', entityId: page.id, payload: { title: page.title, slug: page.slug }, actorId: userId });
      }
      return page;
    });
  }

  static async updateTenantPage(tenantId: string, pageId: string, userId: string, input: UpdateCmsPageInput): Promise<CmsPage> {
    return withTenant(tenantId, async (trx) => {
      // §62 — only fetched when a real status-changing action is happening
      // (autosave's own PATCH never sends `status`), so this stays a no-op
      // extra query on the common "just save my edits" path.
      let prevStatus: string | undefined;
      if (input.status !== undefined) {
        const existing = await trx.selectFrom('cms_pages').select('status').where('id', '=', pageId).where('tenant_id', '=', tenantId).executeTakeFirst();
        prevStatus = existing?.status;
      }
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.site_id !== undefined) update['site_id'] = input.site_id;
      if (input.title !== undefined) update['title'] = input.title;
      if (input.content !== undefined) update['content'] = sanitizeContent(input.content);
      if (input.status !== undefined) {
        update['status'] = input.status;
        // trashed_at tracks when the trash transition itself happened —
        // updated_at bumps on every save, so it can't stand in for a real
        // retention clock (cms-trash-purge.job.ts's 30-day sweep).
        update['trashed_at'] = input.status === 'trash' ? new Date() : null;
      }
      if (input.template !== undefined) update['template'] = input.template;
      if (input.seo_description !== undefined) update['seo_description'] = input.seo_description;
      if (input.canonical_url !== undefined) update['canonical_url'] = checkCanonicalUrl(input.canonical_url);
      if (input.noindex !== undefined) update['noindex'] = input.noindex;
      if (input.og_image !== undefined) update['og_image'] = input.og_image;
      if (input.publish_at !== undefined) update['publish_at'] = input.publish_at ? new Date(input.publish_at) : null;
      if (input.locale !== undefined) update['locale'] = input.locale;
      if (input.translation_group_id !== undefined) update['translation_group_id'] = input.translation_group_id;

      const row = await trx
        .updateTable('cms_pages')
        .set(update)
        .where('id', '=', pageId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      const page = toCmsPage(row);
      await recordRevision(trx, tenantId, 'page', page.id, pageRevisionSnapshot(page), userId);
      if (input.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'page.published', { id: page.id, slug: page.slug, title: page.title });
      if (input.status !== undefined) {
        const action = statusTransitionEvent(prevStatus, input.status);
        await emitDomainEvent(trx, tenantId, { type: `page.${action}`, sourceApp: 'onesite', entityType: 'page', entityId: page.id, payload: { title: page.title, slug: page.slug, from: prevStatus ?? null, to: input.status }, actorId: userId });
      }
      return page;
    });
  }

  static async deleteTenantPage(tenantId: string, pageId: string, userId?: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const deleted = await trx
        .deleteFrom('cms_pages')
        .where('id', '=', pageId)
        .where('tenant_id', '=', tenantId)
        .returning(['title', 'slug'])
        .executeTakeFirst();
      if (deleted) {
        await emitDomainEvent(trx, tenantId, { type: 'page.deleted', sourceApp: 'onesite', entityType: 'page', entityId: pageId, payload: { title: deleted.title, slug: deleted.slug }, actorId: userId ?? null });
      }
      await deleteRevisions(trx, tenantId, 'page', pageId);
    });
  }

  static async bulkUpdatePages(tenantId: string, ids: string[], status: CmsPage['status'], userId?: string): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const prevRows = await trx.selectFrom('cms_pages').select(['id', 'status', 'title', 'slug']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
      const prevMap = new Map(prevRows.map(r => [r.id, r]));
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.updateTable('cms_pages').set({ status, trashed_at: status === 'trash' ? new Date() : null, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirst();
        if (row) {
          const prev = prevMap.get(id);
          const action = statusTransitionEvent(prev?.status, status);
          const page = toCmsPage(row);
          // §19 — a bulk status change is exactly the kind of edit revision
          // history exists to capture; only the single-item save path did
          // before, so a bulk-trashed page had no way back except a raw
          // status flip with no record of what it looked like beforehand.
          await recordRevision(trx, tenantId, 'page', page.id, pageRevisionSnapshot(page), userId ?? null);
          await emitDomainEvent(trx, tenantId, { type: `page.${action}`, sourceApp: 'onesite', entityType: 'page', entityId: id, payload: { title: prev?.title ?? null, slug: prev?.slug ?? null, from: prev?.status ?? null, to: status }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  static async bulkDeletePages(tenantId: string, ids: string[], userId?: string): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.deleteFrom('cms_pages')
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returning(['id', 'title', 'slug']).executeTakeFirst();
        if (row) {
          await deleteRevisions(trx, tenantId, 'page', id);
          await emitDomainEvent(trx, tenantId, { type: 'page.deleted', sourceApp: 'onesite', entityType: 'page', entityId: id, payload: { title: row.title, slug: row.slug }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  // ── Posts (tenant-scoped only — no platform-level posts concept) ─────────

  static async getTenantPosts(tenantId: string, params: ListParams = {}): Promise<CmsPost[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('cms_posts').selectAll().where('tenant_id', '=', tenantId);
      if (params.site_id) {
        q = q.where('site_id', '=', params.site_id);
      }
      if (params.locale) {
        q = q.where('locale', '=', params.locale);
      }
      if (params.translation_group_id) {
        q = q.where('translation_group_id', '=', params.translation_group_id);
      }
      if (params.search?.trim()) {
        q = q.where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${params.search.trim()})`);
      }
      const rows = await q.orderBy('updated_at', 'desc')
        .limit(Math.min(Math.max(params.limit ?? 100, 1), 200))
        .offset(Math.max(params.offset ?? 0, 0))
        .execute();
      return rows.map(toCmsPost);
    });
  }

  private static async uniquePostSlug(trx: any, tenantId: string, title: string): Promise<string> {
    const base = slugifyBase(title);
    let candidate = base;
    let n = 2;
    while (await trx.selectFrom('cms_posts').select('id').where('tenant_id', '=', tenantId).where('slug', '=', candidate).executeTakeFirst()) {
      candidate = `${base}-${n}`;
      n++;
    }
    return candidate;
  }

  static async createTenantPost(tenantId: string, userId: string, input: CreateCmsPostInput): Promise<CmsPost> {
    const canonicalUrl = checkCanonicalUrl(input.canonical_url);
    return withTenant(tenantId, async (trx) => {
      const slug = input.slug?.trim() || await this.uniquePostSlug(trx, tenantId, input.title);
      const row = await trx
        .insertInto('cms_posts')
        .values({
          tenant_id: tenantId,
          site_id: input.site_id ?? null,
          slug,
          title: input.title,
          content: sanitizeContent(input.content ?? ''),
          status: input.status ?? 'draft',
          category: input.category ?? null,
          tags: input.tags ?? null,
          seo_description: input.seo_description ?? null,
          canonical_url: canonicalUrl,
          noindex: input.noindex ?? false,
          og_image: input.og_image ?? null,
          author_id: userId,
          publish_at: input.publish_at ? new Date(input.publish_at) : null,
          locale: input.locale || 'en',
          translation_group_id: input.translation_group_id || undefined,
          ...(input.created_at ? { created_at: new Date(input.created_at) } : {}),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const post = toCmsPost(row);
      await recordRevision(trx, tenantId, 'post', post.id, postRevisionSnapshot(post), userId);
      if (post.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'post.published', { id: post.id, slug: post.slug, title: post.title });
      await emitDomainEvent(trx, tenantId, { type: 'post.created', sourceApp: 'onesite', entityType: 'post', entityId: post.id, payload: { title: post.title, slug: post.slug, status: post.status }, actorId: userId });
      if (post.status === 'published') {
        await emitDomainEvent(trx, tenantId, { type: 'post.published', sourceApp: 'onesite', entityType: 'post', entityId: post.id, payload: { title: post.title, slug: post.slug }, actorId: userId });
      }
      return post;
    });
  }

  static async updateTenantPost(tenantId: string, postId: string, userId: string, input: UpdateCmsPostInput): Promise<CmsPost> {
    return withTenant(tenantId, async (trx) => {
      let prevStatus: string | undefined;
      if (input.status !== undefined) {
        const existing = await trx.selectFrom('cms_posts').select('status').where('id', '=', postId).where('tenant_id', '=', tenantId).executeTakeFirst();
        prevStatus = existing?.status;
      }
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.site_id !== undefined)   update['site_id'] = input.site_id;
      if (input.slug !== undefined)     update['slug'] = input.slug;
      if (input.title !== undefined)    update['title'] = input.title;
      if (input.content !== undefined)  update['content'] = sanitizeContent(input.content);
      if (input.status !== undefined) {
        update['status'] = input.status;
        update['trashed_at'] = input.status === 'trash' ? new Date() : null;
      }
      if (input.category !== undefined) update['category'] = input.category;
      if (input.tags !== undefined)     update['tags'] = input.tags;
      if (input.seo_description !== undefined) update['seo_description'] = input.seo_description;
      if (input.canonical_url !== undefined) update['canonical_url'] = checkCanonicalUrl(input.canonical_url);
      if (input.noindex !== undefined) update['noindex'] = input.noindex;
      if (input.og_image !== undefined) update['og_image'] = input.og_image;
      if (input.publish_at !== undefined) update['publish_at'] = input.publish_at ? new Date(input.publish_at) : null;
      if (input.locale !== undefined)   update['locale'] = input.locale;
      if (input.translation_group_id !== undefined) update['translation_group_id'] = input.translation_group_id;

      const row = await trx
        .updateTable('cms_posts')
        .set(update)
        .where('id', '=', postId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      const post = toCmsPost(row);
      await recordRevision(trx, tenantId, 'post', post.id, postRevisionSnapshot(post), userId);
      if (input.status === 'published') CMSWebhooksService.dispatchEvent(tenantId, 'post.published', { id: post.id, slug: post.slug, title: post.title });
      if (input.status !== undefined) {
        const action = statusTransitionEvent(prevStatus, input.status);
        await emitDomainEvent(trx, tenantId, { type: `post.${action}`, sourceApp: 'onesite', entityType: 'post', entityId: post.id, payload: { title: post.title, slug: post.slug, from: prevStatus ?? null, to: input.status }, actorId: userId });
      }
      return post;
    });
  }

  /** Posts have no soft/hard-delete distinction elsewhere in the UI — trash
   *  (status='trash') is the soft state, this is the real, permanent one, so
   *  a trashed post isn't a dead end with no way out. */
  static async deleteTenantPost(tenantId: string, postId: string, userId?: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const deleted = await trx
        .deleteFrom('cms_posts')
        .where('id', '=', postId)
        .where('tenant_id', '=', tenantId)
        .returning(['title', 'slug'])
        .executeTakeFirst();
      if (deleted) {
        await emitDomainEvent(trx, tenantId, { type: 'post.deleted', sourceApp: 'onesite', entityType: 'post', entityId: postId, payload: { title: deleted.title, slug: deleted.slug }, actorId: userId ?? null });
      }
      await deleteRevisions(trx, tenantId, 'post', postId);
    });
  }

  static async bulkUpdatePosts(tenantId: string, ids: string[], status: CmsPost['status'], userId?: string): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const prevRows = await trx.selectFrom('cms_posts').select(['id', 'status', 'title', 'slug']).where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
      const prevMap = new Map(prevRows.map(r => [r.id, r]));
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.updateTable('cms_posts').set({ status, trashed_at: status === 'trash' ? new Date() : null, updated_at: new Date() })
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returningAll().executeTakeFirst();
        if (row) {
          const prev = prevMap.get(id);
          const action = statusTransitionEvent(prev?.status, status);
          const post = toCmsPost(row);
          await recordRevision(trx, tenantId, 'post', post.id, postRevisionSnapshot(post), userId ?? null);
          await emitDomainEvent(trx, tenantId, { type: `post.${action}`, sourceApp: 'onesite', entityType: 'post', entityId: id, payload: { title: prev?.title ?? null, slug: prev?.slug ?? null, from: prev?.status ?? null, to: status }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  static async bulkDeletePosts(tenantId: string, ids: string[], userId?: string): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.deleteFrom('cms_posts')
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returning(['id', 'title', 'slug']).executeTakeFirst();
        if (row) {
          await deleteRevisions(trx, tenantId, 'post', id);
          await emitDomainEvent(trx, tenantId, { type: 'post.deleted', sourceApp: 'onesite', entityType: 'post', entityId: id, payload: { title: row.title, slug: row.slug }, actorId: userId ?? null });
        }
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  // ── Comments (moderation infrastructure — no submission surface exists yet) ─

  static async getTenantComments(tenantId: string, params: ListParams = {}): Promise<CmsComment[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('cms_comments').selectAll().where('tenant_id', '=', tenantId);
      if (params.search?.trim()) {
        const pattern = `%${params.search.trim().toLowerCase()}%`;
        q = q.where((eb) => eb.or([
          eb(sql<string>`lower(author)`, 'like', pattern),
          eb(sql<string>`lower(content)`, 'like', pattern),
        ]));
      }
      const rows = await q.orderBy('created_at', 'desc')
        .limit(Math.min(Math.max(params.limit ?? 100, 1), 200))
        .offset(Math.max(params.offset ?? 0, 0))
        .execute();
      return rows.map(toCmsComment);
    });
  }

  static async updateCommentStatus(tenantId: string, commentId: string, status: CmsCommentStatus): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx
        .updateTable('cms_comments')
        .set({ status })
        .where('id', '=', commentId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async deleteComment(tenantId: string, commentId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('cms_comments')
        .where('id', '=', commentId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  static async bulkUpdateComments(tenantId: string, ids: string[], status: CmsCommentStatus): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.updateTable('cms_comments').set({ status })
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returning('id').executeTakeFirst();
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  static async bulkDeleteComments(tenantId: string, ids: string[]): Promise<BulkResult[]> {
    return withTenant(tenantId, async (trx) => {
      const results: BulkResult[] = [];
      for (const id of ids) {
        const row = await trx.deleteFrom('cms_comments')
          .where('id', '=', id).where('tenant_id', '=', tenantId)
          .returning('id').executeTakeFirst();
        results.push(row ? { id, ok: true } : { id, ok: false, error: 'Not found' });
      }
      return results;
    });
  }

  // ── Media library ──────────────────────────────────────────────────────
  // Genuinely public — a tenant's page/post content and a logo/favicon all
  // need to render on the unauthenticated public site, so unlike most of
  // this codebase's upload flows, the read side (getPublicMediaFile) below
  // deliberately carries no tenant/auth check of its own beyond the id
  // itself resolving to a real row; the id is an unguessable UUID, the same
  // "public but unguessable" posture Drive's own public share links use.

  private static mediaUrl(id: string): string {
    return `/v1/cms/public/media/${id}`;
  }

  private static thumbnailUrl(id: string, hasThumbnail: boolean): string | null {
    return hasThumbnail ? `/v1/cms/public/media/${id}/thumbnail` : null;
  }

  private static toCmsMedia(row: any): CmsMedia {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      site_id: row.site_id ?? null,
      filename: row.filename,
      url: this.mediaUrl(row.id),
      thumbnail_url: this.thumbnailUrl(row.id, !!row.thumbnail_key),
      folder: row.folder ?? null,
      tags: row.tags ?? null,
      mime_type: row.mime_type,
      size: row.size,
      uploaded_by: row.uploaded_by,
      created_at: (row.created_at as Date).toISOString(),
    };
  }

  // §21-22 — never rasterized: an SVG is already resolution-independent (a
  // browser renders it correctly at any size with no thumbnail needed), and
  // feeding a hostile tenant-uploaded SVG through sharp's own rasterizer is
  // exactly the kind of untrusted-input-into-an-image-library risk worth
  // declining rather than adding. A failure for any other type (corrupt
  // bytes, an unsupported subtype) is caught by the caller and treated as
  // "no thumbnail," never as a failed upload.
  private static async makeThumbnail(mimeType: string, buffer: Buffer): Promise<Buffer | null> {
    if (mimeType === 'image/svg+xml') return null;
    try {
      const sharp = (await import('sharp')).default;
      return await sharp(buffer).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch {
      return null;
    }
  }

  static async uploadMedia(tenantId: string, userId: string, filename: string, mimeType: string, buffer: Buffer, siteId?: string | null): Promise<CmsMedia> {
    const up = await MinioIntegration.uploadCmsMedia(tenantId, filename, buffer);
    const thumbBuffer = await this.makeThumbnail(mimeType, buffer);
    const thumbUp = thumbBuffer ? await MinioIntegration.uploadCmsMedia(tenantId, `${filename}.thumb.webp`, thumbBuffer) : null;
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('cms_media').values({
        tenant_id: tenantId, site_id: siteId ?? null, filename, storage_key: up.storageKey, mime_type: mimeType, size: up.size, uploaded_by: userId,
        thumbnail_key: thumbUp?.storageKey ?? null,
      }).returningAll().executeTakeFirstOrThrow();
      const media = this.toCmsMedia(row);
      CMSWebhooksService.dispatchEvent(tenantId, 'media.uploaded', { id: media.id, filename: media.filename, mime_type: media.mime_type });
      await emitDomainEvent(trx, tenantId, { type: 'media.uploaded', sourceApp: 'onesite', entityType: 'media', entityId: media.id, payload: { filename: media.filename, mime_type: media.mime_type }, actorId: userId });
      return media;
    });
  }

  static async getMedia(tenantId: string, params: { folder?: string; tag?: string; site_id?: string } = {}): Promise<CmsMedia[]> {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('cms_media').selectAll().where('tenant_id', '=', tenantId);
      if (params.site_id) {
        q = q.where('site_id', '=', params.site_id);
      }
      // `folder = NULL` is always false in Postgres — the unfiled bucket
      // needs a real `IS NULL`, not an `=` comparison against a null value.
      if (params.folder !== undefined) {
        q = params.folder ? q.where('folder', '=', params.folder) : q.where('folder', 'is', null);
      }
      if (params.tag) q = q.where(sql<boolean>`(','||coalesce(tags,'')||',') LIKE ${'%,' + params.tag.trim() + ',%'}`);
      const rows = await q.orderBy('created_at', 'desc').limit(200).execute();
      return rows.map(r => this.toCmsMedia(r));
    });
  }

  static async updateMedia(tenantId: string, mediaId: string, input: { folder?: string | null; tags?: string | null }): Promise<CmsMedia> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = {};
      if (input.folder !== undefined) update['folder'] = input.folder?.trim() || null;
      if (input.tags !== undefined) update['tags'] = input.tags?.trim() || null;
      const row = await trx.updateTable('cms_media').set(update)
        .where('id', '=', mediaId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return this.toCmsMedia(row);
    });
  }

  /** Every distinct folder label already in use — the "filter by folder"
   *  UI's own option list, so it only ever offers folders that genuinely
   *  have something in them. */
  static async listMediaFolders(tenantId: string): Promise<string[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_media').select('folder').distinct()
        .where('tenant_id', '=', tenantId).where('folder', 'is not', null).orderBy('folder', 'asc').execute();
      return rows.map(r => r.folder).filter((f): f is string => !!f);
    });
  }

  static async deleteMedia(tenantId: string, mediaId: string, userId?: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const row = await trx.deleteFrom('cms_media')
        .where('id', '=', mediaId).where('tenant_id', '=', tenantId)
        .returning(['storage_key', 'thumbnail_key', 'filename']).executeTakeFirst();
      if (row?.storage_key) await MinioIntegration.deleteDocument(tenantId, row.storage_key);
      if (row?.thumbnail_key) await MinioIntegration.deleteDocument(tenantId, row.thumbnail_key);
      if (row) {
        await emitDomainEvent(trx, tenantId, { type: 'media.deleted', sourceApp: 'onesite', entityType: 'media', entityId: mediaId, payload: { filename: row.filename }, actorId: userId ?? null });
      }
    });
  }

  /** Public read — used by the unauthenticated /public/media/:id route.
   *  dbPlatform, not withTenant: the caller has no tenant context yet
   *  (matches getPublicSite/getPublicPage's own pre-tenant reasoning), and
   *  the row's own tenant_id is only needed to build the storage key back. */
  static async getPublicMediaFile(mediaId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const row = await dbPlatform.selectFrom('cms_media').selectAll().where('id', '=', mediaId).executeTakeFirst();
    if (!row) return null;
    const buffer = await MinioIntegration.readFile(row.storage_key);
    if (!buffer) return null;
    return { buffer, mimeType: row.mime_type, filename: row.filename };
  }

  /** §21-22 — same pre-tenant reasoning as getPublicMediaFile. Null when the
   *  row has no thumbnail_key (never generated, or generation failed) —
   *  the route handler falls back to the full file rather than 404ing. */
  static async getPublicMediaThumbnail(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const row = await dbPlatform.selectFrom('cms_media').select(['thumbnail_key']).where('id', '=', mediaId).executeTakeFirst();
    if (!row?.thumbnail_key) return null;
    const buffer = await MinioIntegration.readFile(row.thumbnail_key);
    if (!buffer) return null;
    return { buffer, mimeType: 'image/webp' };
  }

  // ── Site settings (Customize → Site Identity / Appearance) ───────────────
  // Stored in tenant_settings.settings.onesite — same sentinel-JSONB-blob
  // pattern platform.routes.ts uses for the global 'branding' key, just
  // keyed by the real tenant_id instead of the GLOBAL_TENANT_ID row.

  static async getSiteSettings(tenantId: string): Promise<CmsSiteSettings> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('tenant_settings')
        .select('settings')
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      const tenant = await trx.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirst();
      return { ...DEFAULT_SITE_SETTINGS, ...(settings.onesite || {}), tenantSlug: tenant?.slug };
    });
  }

  static async updateSiteSettings(tenantId: string, input: Partial<CmsSiteSettings>): Promise<CmsSiteSettings> {
    // tenantSlug is derived (from tenants.slug), never persisted into the settings blob.
    const { tenantSlug: _ignored, ...realInput } = input;
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('tenant_settings')
        .select('settings')
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();
      const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      const merged = { ...DEFAULT_SITE_SETTINGS, ...(existing.onesite || {}), ...realInput };
      const nextSettings = { ...existing, onesite: merged };

      if (row) {
        await trx.updateTable('tenant_settings')
          .set({ settings: JSON.stringify(nextSettings) })
          .where('tenant_id', '=', tenantId)
          .execute();
      } else {
        await trx.insertInto('tenant_settings')
          .values({ tenant_id: tenantId, settings: JSON.stringify(nextSettings) })
          .execute();
      }
      const tenant = await trx.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirst();
      return { ...merged, tenantSlug: tenant?.slug };
    });
  }

  // ── Public site (unauthenticated) ─────────────────────────────────────────

  // Pre-tenant: an unauthenticated visitor identifies a tenant by its public
  // slug, so the tenant isn't known until this resolves.
  private static async resolveTenantBySlug(tenantSlug: string) {
    return dbPlatform.selectFrom('tenants')
      .select(['id', 'name', 'logo_url'])
      .where('slug', '=', tenantSlug)
      .executeTakeFirst();
  }

  static async getPublicSite(tenantSlug: string): Promise<CmsPublicSite | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const settings = await this.getSiteSettings(tenant.id);
    // The slug has now resolved a real tenant — scoped from here on.
    const pages = await withTenant(tenant.id, trx => trx.selectFrom('cms_pages')
      .select(['slug', 'title'])
      .where('tenant_id', '=', tenant.id)
      .where('status', '=', 'published')
      .orderBy('title', 'asc')
      .execute());
    const postRows = await withTenant(tenant.id, trx => trx.selectFrom('cms_posts')
      .select(['slug', 'title', 'category', 'content', 'author_id', 'created_at'])
      .where('tenant_id', '=', tenant.id)
      .where('status', '=', 'published')
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute());
    const authorNames = await this.resolveAuthorNames(tenant.id, postRows.map(r => r.author_id).filter((id): id is string => !!id));
    return {
      tenantName: settings.siteTitle || tenant.name,
      settings,
      pages,
      posts: postRows.map(r => ({
        slug: r.slug, title: r.title, category: r.category,
        excerpt: excerptOf(r.content), created_at: (r.created_at as Date).toISOString(),
        author_id: r.author_id, author_name: r.author_id ? (authorNames.get(r.author_id) ?? null) : null,
      })),
      navItems: await this.getPublicNavItems(tenant.id),
    };
  }

  // ── Navigation builder (§14) ─────────────────────────────────────────────

  static async listNavItems(tenantId: string): Promise<CmsNavItem[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_nav_items').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('sort_order', 'asc').execute();
      return rows.map(toCmsNavItem);
    });
  }

  static async createNavItem(tenantId: string, input: CreateCmsNavItemInput): Promise<CmsNavItem> {
    return withTenant(tenantId, async (trx) => {
      let siblingScope = trx.selectFrom('cms_nav_items').select(sql<string>`coalesce(max(sort_order), -1)`.as('m'))
        .where('tenant_id', '=', tenantId);
      siblingScope = input.parent_id ? siblingScope.where('parent_id', '=', input.parent_id) : siblingScope.where('parent_id', 'is', null);
      const max = await siblingScope.executeTakeFirst();
      const row = await trx.insertInto('cms_nav_items').values({
        tenant_id: tenantId, label: input.label, target: input.target,
        parent_id: input.parent_id ?? null, sort_order: Number(max?.m ?? -1) + 1,
      }).returningAll().executeTakeFirstOrThrow();
      return toCmsNavItem(row);
    });
  }

  static async updateNavItem(tenantId: string, id: string, input: UpdateCmsNavItemInput): Promise<CmsNavItem> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.label !== undefined) update['label'] = input.label;
      if (input.target !== undefined) update['target'] = input.target;
      if (input.parent_id !== undefined) update['parent_id'] = input.parent_id;
      const row = await trx.updateTable('cms_nav_items').set(update)
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
      return toCmsNavItem(row);
    });
  }

  static async deleteNavItem(tenantId: string, id: string): Promise<void> {
    // ON DELETE CASCADE (migration 469) removes any children of this item too
    // — a parent's own menu disappearing along with its dropdown is the
    // correct behavior here, not an orphan risk to guard against.
    await withTenant(tenantId, trx => trx.deleteFrom('cms_nav_items')
      .where('id', '=', id).where('tenant_id', '=', tenantId).execute());
  }

  /** Swaps sort_order with the adjacent sibling under the same parent — same
   *  up/down-only reasoning as the Block Editor: reliable and keyboard-
   *  usable, where drag-and-drop is a common source of half-working
   *  cross-browser interactions. */
  static async moveNavItem(tenantId: string, id: string, direction: 'up' | 'down'): Promise<CmsNavItem[]> {
    return withTenant(tenantId, async (trx) => {
      const item = await trx.selectFrom('cms_nav_items').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      let siblings = trx.selectFrom('cms_nav_items').selectAll().where('tenant_id', '=', tenantId);
      siblings = item.parent_id ? siblings.where('parent_id', '=', item.parent_id) : siblings.where('parent_id', 'is', null);
      const rows = await siblings.orderBy('sort_order', 'asc').execute();
      const idx = rows.findIndex(r => r.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return rows.map(toCmsNavItem);
      const a = rows[idx], b = rows[swapIdx];
      await trx.updateTable('cms_nav_items').set({ sort_order: b.sort_order }).where('id', '=', a.id).execute();
      await trx.updateTable('cms_nav_items').set({ sort_order: a.sort_order }).where('id', '=', b.id).execute();
      const refreshed = await trx.selectFrom('cms_nav_items').selectAll().where('tenant_id', '=', tenantId).orderBy('sort_order', 'asc').execute();
      return refreshed.map(toCmsNavItem);
    });
  }

  static async getPublicNavItems(tenantId: string): Promise<CmsPublicNavItem[]> {
    const rows = await withTenant(tenantId, trx => trx.selectFrom('cms_nav_items').selectAll()
      .where('tenant_id', '=', tenantId).orderBy('sort_order', 'asc').execute());
    const items = rows.map(toCmsNavItem);
    const byParent = new Map<string | null, CmsNavItem[]>();
    for (const it of items) {
      const list = byParent.get(it.parent_id) ?? [];
      list.push(it);
      byParent.set(it.parent_id, list);
    }
    const toPublic = (it: CmsNavItem): CmsPublicNavItem => ({
      id: it.id, label: it.label, target: it.target,
      children: (byParent.get(it.id) ?? []).map(toPublic),
    });
    return (byParent.get(null) ?? []).map(toPublic);
  }

  // ── Public search (§32) — reuses the same tsvector columns the admin's
  // own Pages/Posts search already runs on, scoped to published rows only.
  static async searchPublicSite(tenantSlug: string, query: string): Promise<CmsPublicSearchResult[]> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return [];
    const q = query.trim();
    if (!q) return [];
    return withTenant(tenant.id, async (trx) => {
      const [pages, posts] = await Promise.all([
        trx.selectFrom('cms_pages').select(['slug', 'title', 'content', 'created_at'])
          .where('tenant_id', '=', tenant.id).where('status', '=', 'published')
          .where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${q})`)
          .orderBy('created_at', 'desc').limit(20).execute(),
        trx.selectFrom('cms_posts').select(['slug', 'title', 'content', 'category', 'created_at'])
          .where('tenant_id', '=', tenant.id).where('status', '=', 'published')
          .where(sql<boolean>`search_vector @@ plainto_tsquery('english', ${q})`)
          .orderBy('created_at', 'desc').limit(20).execute(),
      ]);
      const pageResults: CmsPublicSearchResult[] = pages.map(p => ({
        type: 'page' as const, slug: p.slug, title: p.title, excerpt: excerptOf(p.content),
        category: null, created_at: (p.created_at as Date).toISOString(),
      }));
      const postResults: CmsPublicSearchResult[] = posts.map(p => ({
        type: 'post' as const, slug: p.slug, title: p.title, excerpt: excerptOf(p.content),
        category: p.category, created_at: (p.created_at as Date).toISOString(),
      }));
      return [...pageResults, ...postResults].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  }

  // ── Blogging extras (§36) — all three are read-only projections of data
  // that already exists, no schema change needed. ────────────────────────

  /** Real RSS 2.0 XML — hand-built (no library needed for a format this
   *  small), with the same XSS-safety posture as everywhere else: every
   *  value is escaped before going into the markup, nothing is trusted raw. */
  static async getRssFeed(tenantSlug: string): Promise<string | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const settings = await this.getSiteSettings(tenant.id);
    const posts = await withTenant(tenant.id, trx => trx.selectFrom('cms_posts')
      .select(['slug', 'title', 'content', 'created_at'])
      .where('tenant_id', '=', tenant.id).where('status', '=', 'published')
      .orderBy('created_at', 'desc').limit(50).execute());

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const base = env.PUBLIC_APP_URL || '';
    const siteUrl = `${base}/site/${tenantSlug}`;
    const siteTitle = settings.siteTitle || tenant.name;
    const items = posts.map(p => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(`${siteUrl}/blog/${p.slug}`)}</link>
      <guid isPermaLink="true">${esc(`${siteUrl}/blog/${p.slug}`)}</guid>
      <pubDate>${(p.created_at as Date).toUTCString()}</pubDate>
      <description>${esc(excerptOf(p.content, 400))}</description>
    </item>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(siteTitle)}</title>
  <link>${esc(siteUrl)}</link>
  <description>${esc(settings.tagline || siteTitle)}</description>${items}
</channel></rss>`;
  }

  static async getPublicPostArchive(tenantSlug: string, year: number, month: number): Promise<CmsPublicPostSummary[] | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    const rows = await withTenant(tenant.id, trx => trx.selectFrom('cms_posts')
      .select(['slug', 'title', 'category', 'content', 'created_at'])
      .where('tenant_id', '=', tenant.id).where('status', '=', 'published')
      .where('created_at', '>=', start).where('created_at', '<', end)
      .orderBy('created_at', 'desc').execute());
    return rows.map(r => ({ slug: r.slug, title: r.title, category: r.category, excerpt: excerptOf(r.content), created_at: (r.created_at as Date).toISOString() }));
  }

  /** authorId is the raw author_id (a users.id) — resolved to a real display
   *  name the same leftJoin-with-cast pattern cms-revisions.service.ts uses,
   *  since this schema stores author_id as TEXT against users.id's UUID. */
  static async getPublicAuthorPage(tenantSlug: string, authorId: string): Promise<{ authorName: string; posts: CmsPublicPostSummary[] } | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const authorName = (await this.resolveAuthorName(tenant.id, authorId)) || 'Unknown';
    const rows = await withTenant(tenant.id, trx => trx.selectFrom('cms_posts')
      .select(['slug', 'title', 'category', 'content', 'created_at'])
      .where('tenant_id', '=', tenant.id).where('status', '=', 'published').where('author_id', '=', authorId)
      .orderBy('created_at', 'desc').execute());
    return { authorName, posts: rows.map(r => ({ slug: r.slug, title: r.title, category: r.category, excerpt: excerptOf(r.content), created_at: (r.created_at as Date).toISOString() })) };
  }

  /** §27 — a real sitemap.xml, one route selecting published, non-noindex
   *  slugs — no new infrastructure, exactly as scoped. */
  static async getSitemap(tenantSlug: string): Promise<string | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const base = env.PUBLIC_APP_URL || '';
    const siteUrl = `${base}/site/${tenantSlug}`;
    return withTenant(tenant.id, async (trx) => {
      const [pages, posts] = await Promise.all([
        trx.selectFrom('cms_pages').select(['slug', 'updated_at'])
          .where('tenant_id', '=', tenant.id).where('status', '=', 'published').where('noindex', '=', false).execute(),
        trx.selectFrom('cms_posts').select(['slug', 'updated_at'])
          .where('tenant_id', '=', tenant.id).where('status', '=', 'published').where('noindex', '=', false).execute(),
      ]);
      const urls = [
        `<url><loc>${siteUrl}</loc></url>`,
        // A page's stored slug can carry PageEditor's own leading '/'
        // convention (see the matching fix in getPublicPage above) — strip
        // it here too, or a page with one produces a doubled-slash <loc>.
        ...pages.map(p => `<url><loc>${siteUrl}/${p.slug.replace(/^\//, '')}</loc><lastmod>${(p.updated_at as Date).toISOString().slice(0, 10)}</lastmod></url>`),
        ...posts.map(p => `<url><loc>${siteUrl}/blog/${p.slug}</loc><lastmod>${(p.updated_at as Date).toISOString().slice(0, 10)}</lastmod></url>`),
      ];
      return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    });
  }

  static async createPagePreviewToken(tenantId: string, id: string): Promise<{ token: string; expiresAt: number }> {
    const row = await withTenant(tenantId, trx => trx.selectFrom('cms_pages').select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
    if (!row) throw new Error('Page not found.');
    return generatePreviewToken('page', id);
  }

  static async createPostPreviewToken(tenantId: string, id: string): Promise<{ token: string; expiresAt: number }> {
    const row = await withTenant(tenantId, trx => trx.selectFrom('cms_posts').select('id').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst());
    if (!row) throw new Error('Post not found.');
    return generatePreviewToken('post', id);
  }

  static async getPublicPage(tenantSlug: string, pageSlug: string, previewToken?: string | null): Promise<CmsPage | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const row = await withTenant(tenant.id, trx => {
      let query = trx.selectFrom('cms_pages').selectAll()
        .where('tenant_id', '=', tenant.id)
        // Real bug found while live-verifying §38: PageEditor's own
        // convention stores a page's slug with a leading '/' (its "/about"
        // placeholder, and its auto-slug default — see CMS.tsx), but
        // :pageSlug is a single URL path segment that can never itself
        // carry that slash, and every link that points here already
        // strips it first. An exact-string match therefore 404'd every
        // published page whose slug had the leading slash — match either
        // form so this doesn't depend on which one happens to be stored.
        .where(eb => eb.or([eb('slug', '=', pageSlug), eb('slug', '=', `/${pageSlug}`)]));
      if (!previewToken) query = query.where('status', '=', 'published');
      return query.executeTakeFirst();
    });
    if (!row) return null;
    // §38 — a draft/scheduled page is only visible with a token that verifies
    // for this exact row id; a published page needs no token at all.
    if (row.status !== 'published' && !verifyPreviewToken('page', row.id, previewToken)) return null;
    return toCmsPage(row);
  }

  static async getPublicPost(tenantSlug: string, postSlug: string, previewToken?: string | null): Promise<CmsPublicPost | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const row = await withTenant(tenant.id, trx => {
      let query = trx.selectFrom('cms_posts')
        .select(['id', 'slug', 'title', 'content', 'category', 'tags', 'author_id', 'created_at', 'seo_description', 'canonical_url', 'noindex', 'og_image', 'status'])
        .where('tenant_id', '=', tenant.id)
        .where('slug', '=', postSlug);
      if (!previewToken) query = query.where('status', '=', 'published');
      return query.executeTakeFirst();
    });
    if (!row) return null;
    if (row.status !== 'published' && !verifyPreviewToken('post', row.id, previewToken)) return null;
    const authorName = row.author_id ? await this.resolveAuthorName(tenant.id, row.author_id) : null;
    return {
      id: row.id, slug: row.slug, title: row.title, content: row.content,
      category: row.category, tags: row.tags, created_at: (row.created_at as Date).toISOString(),
      author_id: row.author_id, author_name: authorName,
      seo_description: row.seo_description, canonical_url: row.canonical_url, noindex: !!row.noindex, og_image: row.og_image,
    };
  }

  /** Same leftJoin-with-cast reasoning as cms-revisions.service.ts: every
   *  cms_* table stores an author id as TEXT (this schema's own established
   *  convention) while users.id is UUID, so a plain join throws
   *  "operator does not exist: uuid = text" without the explicit cast. */
  private static async resolveAuthorName(tenantId: string, authorId: string): Promise<string | null> {
    return withTenant(tenantId, async (trx) => {
      const row = await sql<{ name: string | null }>`SELECT name FROM users WHERE id::text = ${authorId}`.execute(trx);
      return row.rows[0]?.name ?? null;
    });
  }

  /** Batched version for a list (e.g. every post on the site index) — one
   *  query for every distinct author instead of one per post. */
  private static async resolveAuthorNames(tenantId: string, authorIds: string[]): Promise<Map<string, string>> {
    const distinct = Array.from(new Set(authorIds));
    if (distinct.length === 0) return new Map();
    return withTenant(tenantId, async (trx) => {
      const rows = await sql<{ id: string; name: string }>`SELECT id::text AS id, name FROM users WHERE id::text = ANY(${distinct})`.execute(trx);
      return new Map(rows.rows.map(r => [r.id, r.name]));
    });
  }

  static async getPublicArchiveIndex(tenantSlug: string): Promise<CmsPublicArchiveMonth[] | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    return withTenant(tenant.id, async (trx) => {
      const rows = await sql<{ year: number; month: number; count: string }>`
        SELECT extract(year from created_at)::int AS year, extract(month from created_at)::int AS month, count(*) AS count
        FROM cms_posts
        WHERE tenant_id = ${tenant.id} AND status = 'published'
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2 DESC
      `.execute(trx);
      return rows.rows.map(r => ({ year: r.year, month: r.month, count: Number(r.count) }));
    });
  }

  // ── Blog comments (§37) — the submission surface the moderation queue ───
  // above was always missing. A visitor only ever sees approved comments,
  // oldest first, and never anyone's email — that stays admin-only.

  private static async resolvePublicPostId(tenant: { id: string }, postSlug: string): Promise<string | null> {
    const row = await withTenant(tenant.id, trx => trx.selectFrom('cms_posts').select('id')
      .where('tenant_id', '=', tenant.id).where('slug', '=', postSlug).where('status', '=', 'published')
      .executeTakeFirst());
    return row?.id ?? null;
  }

  static async getPublicComments(tenantSlug: string, postSlug: string): Promise<CmsPublicComment[] | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const postId = await this.resolvePublicPostId(tenant, postSlug);
    if (!postId) return null;
    const rows = await withTenant(tenant.id, trx => trx.selectFrom('cms_comments')
      .select(['id', 'author', 'content', 'created_at'])
      .where('tenant_id', '=', tenant.id).where('post_id', '=', postId).where('status', '=', 'approved')
      .orderBy('created_at', 'asc').limit(200).execute());
    return rows.map(r => ({ id: r.id, author: r.author, content: r.content, created_at: (r.created_at as Date).toISOString() }));
  }

  /** Returns null when the tenant/post can't be resolved (caller 404s);
   *  throws CommentValidationError for a real input problem (caller 400s);
   *  a honeypot hit returns as if it succeeded (`{ ok: true, honeypot: true }`)
   *  — never tell a bot which check it tripped. */
  static async createPublicComment(tenantSlug: string, postSlug: string, input: CreateCmsCommentInput): Promise<{ ok: boolean } | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const postId = await this.resolvePublicPostId(tenant, postSlug);
    if (!postId) return null;

    if (input.website?.trim()) return { ok: true }; // honeypot tripped — silently discard, look successful

    const author = input.author?.trim().slice(0, 200);
    const content = input.content?.trim().slice(0, 5000);
    if (!author) throw new CommentValidationError('Name is required.');
    if (!content) throw new CommentValidationError('Comment can\'t be empty.');
    const email = input.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CommentValidationError('That doesn\'t look like a valid email address.');

    await withTenant(tenant.id, trx => trx.insertInto('cms_comments').values({
      tenant_id: tenant.id, post_id: postId, author, email: email || null, content, status: 'pending',
    }).execute());
    return { ok: true };
  }
}
