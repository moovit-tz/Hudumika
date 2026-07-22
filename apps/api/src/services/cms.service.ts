import sanitizeHtml from 'sanitize-html';
import { db, withTenant } from '../db/client.js';
import type {
  CmsPage, CreateCmsPageInput, UpdateCmsPageInput,
  CmsPost, CreateCmsPostInput, UpdateCmsPostInput,
  CmsComment, CmsCommentStatus,
  CmsSiteSettings, CmsPublicSite,
} from '@hudumika/types';

// ── Sanitization ──────────────────────────────────────────────────────────────
// Content is authored via RichTextEditor's fixed toolbar (bold/italic/underline/
// headings/lists/links/blockquote) — this allowlist matches that toolbar exactly
// plus the structural tags legal-page content needs (p, table), so nothing an
// admin can actually produce gets stripped, while anything else (script, iframe,
// event handlers, javascript: URLs) is removed before it ever reaches the DB.
function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'ul', 'ol', 'li', 'a', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      h2: ['id'],
      h3: ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

function toCmsPage(row: any): CmsPage {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    status: row.status,
    seo_description: row.seo_description,
    author_id: row.author_id,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

function toCmsPost(row: any): CmsPost {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    title: row.title,
    content: row.content,
    status: row.status,
    author_id: row.author_id,
    category: row.category,
    tags: row.tags,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
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

const DEFAULT_SITE_SETTINGS: CmsSiteSettings = {
  siteTitle: '', tagline: '', logoUrl: '', faviconUrl: '', accentColor: '#0d7a6b',
};

export class CMSService {

  // ── Platform pages (Hudumika's own — tenant_id IS NULL) ──────────────────

  /** Public — only ever returns a published page. */
  static async getPublishedPlatformPage(slug: string): Promise<CmsPage | null> {
    const row = await db
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
    const rows = await db
      .selectFrom('cms_pages')
      .selectAll()
      .where('tenant_id', 'is', null)
      .orderBy('slug', 'asc')
      .execute();
    return rows.map(toCmsPage);
  }

  static async getPlatformPage(slug: string): Promise<CmsPage> {
    const row = await db
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
    const existing = await db
      .selectFrom('cms_pages')
      .select('id')
      .where('tenant_id', 'is', null)
      .where('slug', '=', input.slug)
      .executeTakeFirst();

    if (existing) {
      const row = await db
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

    const row = await db
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

  static async getTenantPages(tenantId: string): Promise<CmsPage[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('cms_pages')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(toCmsPage);
    });
  }

  static async createTenantPage(tenantId: string, userId: string, input: CreateCmsPageInput): Promise<CmsPage> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx
        .insertInto('cms_pages')
        .values({
          tenant_id: tenantId,
          slug: input.slug,
          title: input.title,
          content: sanitizeContent(input.content ?? ''),
          status: input.status ?? 'draft',
          seo_description: input.seo_description ?? null,
          author_id: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCmsPage(row);
    });
  }

  static async updateTenantPage(tenantId: string, pageId: string, input: UpdateCmsPageInput): Promise<CmsPage> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.title !== undefined) update['title'] = input.title;
      if (input.content !== undefined) update['content'] = sanitizeContent(input.content);
      if (input.status !== undefined) update['status'] = input.status;
      if (input.seo_description !== undefined) update['seo_description'] = input.seo_description;

      const row = await trx
        .updateTable('cms_pages')
        .set(update)
        .where('id', '=', pageId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCmsPage(row);
    });
  }

  static async deleteTenantPage(tenantId: string, pageId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      await trx
        .deleteFrom('cms_pages')
        .where('id', '=', pageId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
  }

  // ── Posts (tenant-scoped only — no platform-level posts concept) ─────────

  static async getTenantPosts(tenantId: string): Promise<CmsPost[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('cms_posts')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('updated_at', 'desc')
        .execute();
      return rows.map(toCmsPost);
    });
  }

  static async createTenantPost(tenantId: string, userId: string, input: CreateCmsPostInput): Promise<CmsPost> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx
        .insertInto('cms_posts')
        .values({
          tenant_id: tenantId,
          title: input.title,
          content: sanitizeContent(input.content ?? ''),
          status: input.status ?? 'draft',
          category: input.category ?? null,
          tags: input.tags ?? null,
          author_id: userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCmsPost(row);
    });
  }

  static async updateTenantPost(tenantId: string, postId: string, input: UpdateCmsPostInput): Promise<CmsPost> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.title !== undefined)    update['title'] = input.title;
      if (input.content !== undefined)  update['content'] = sanitizeContent(input.content);
      if (input.status !== undefined)   update['status'] = input.status;
      if (input.category !== undefined) update['category'] = input.category;
      if (input.tags !== undefined)     update['tags'] = input.tags;

      const row = await trx
        .updateTable('cms_posts')
        .set(update)
        .where('id', '=', postId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toCmsPost(row);
    });
  }

  // ── Comments (moderation infrastructure — no submission surface exists yet) ─

  static async getTenantComments(tenantId: string): Promise<CmsComment[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx
        .selectFrom('cms_comments')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
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

  // ── Site settings (Customize → Site Identity / Appearance) ───────────────
  // Stored in tenant_settings.settings.onesite — same sentinel-JSONB-blob
  // pattern platform.routes.ts uses for the global 'branding' key, just
  // keyed by the real tenant_id instead of the GLOBAL_TENANT_ID row.

  static async getSiteSettings(tenantId: string): Promise<CmsSiteSettings> {
    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const tenant = await db.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirst();
    return { ...DEFAULT_SITE_SETTINGS, ...(settings.onesite || {}), tenantSlug: tenant?.slug };
  }

  static async updateSiteSettings(tenantId: string, input: Partial<CmsSiteSettings>): Promise<CmsSiteSettings> {
    // tenantSlug is derived (from tenants.slug), never persisted into the settings blob.
    const { tenantSlug: _ignored, ...realInput } = input;
    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const merged = { ...DEFAULT_SITE_SETTINGS, ...(existing.onesite || {}), ...realInput };
    const nextSettings = { ...existing, onesite: merged };

    if (row) {
      await db.updateTable('tenant_settings')
        .set({ settings: JSON.stringify(nextSettings) })
        .where('tenant_id', '=', tenantId)
        .execute();
    } else {
      await db.insertInto('tenant_settings')
        .values({ tenant_id: tenantId, settings: JSON.stringify(nextSettings) })
        .execute();
    }
    const tenant = await db.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirst();
    return { ...merged, tenantSlug: tenant?.slug };
  }

  // ── Public site (unauthenticated) ─────────────────────────────────────────

  private static async resolveTenantBySlug(tenantSlug: string) {
    return db.selectFrom('tenants')
      .select(['id', 'name', 'logo_url'])
      .where('slug', '=', tenantSlug)
      .executeTakeFirst();
  }

  static async getPublicSite(tenantSlug: string): Promise<CmsPublicSite | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const settings = await this.getSiteSettings(tenant.id);
    const pages = await db.selectFrom('cms_pages')
      .select(['slug', 'title'])
      .where('tenant_id', '=', tenant.id)
      .where('status', '=', 'published')
      .orderBy('title', 'asc')
      .execute();
    return {
      tenantName: settings.siteTitle || tenant.name,
      settings,
      pages,
    };
  }

  static async getPublicPage(tenantSlug: string, pageSlug: string): Promise<CmsPage | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    const row = await db.selectFrom('cms_pages')
      .selectAll()
      .where('tenant_id', '=', tenant.id)
      .where('slug', '=', pageSlug)
      .where('status', '=', 'published')
      .executeTakeFirst();
    return row ? toCmsPage(row) : null;
  }
}
