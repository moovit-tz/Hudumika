import { XMLParser } from 'fast-xml-parser';
import { withTenant } from '../db/client.js';
import { toCsv } from '../lib/csv.js';
import { CMSService } from './cms.service.js';
import type { CmsPostStatus } from '@hudumika/types';

// §56-57 of the CMS master brief — Import/export/migration. Export first
// (the simpler, lower-risk direction, no external format to trust), then a
// real WordPress importer — the brief's own explicitly-recommended
// starting point, mapping onto Posts rather than a generic Content Model
// entry, since a WXR <item> is structurally a blog post.

function isoOrNull(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d ?? '');
}

/** Every content type's own CSV shares the "compound value becomes its
 *  JSON string" rule for a Content Model entry's own field data — the same
 *  bounded, honest posture as the public dynamic template's own fallback
 *  for a field type it doesn't have special rendering for. */
function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export class CMSImportExportService {
  static async exportPostsCsv(tenantId: string): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_posts').selectAll()
        .where('tenant_id', '=', tenantId).where('status', '!=', 'trash')
        .orderBy('created_at', 'desc').execute();
      return toCsv(
        ['Title', 'Slug', 'Status', 'Category', 'Tags', 'SEO Description', 'Created', 'Updated', 'Content (HTML)'],
        rows.map(r => [r.title, r.slug, r.status, r.category ?? '', r.tags ?? '', r.seo_description ?? '', isoOrNull(r.created_at), isoOrNull(r.updated_at), r.content]),
      );
    });
  }

  static async exportPagesCsv(tenantId: string): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_pages').selectAll()
        .where('tenant_id', '=', tenantId).where('status', '!=', 'trash')
        .orderBy('created_at', 'desc').execute();
      return toCsv(
        ['Title', 'Slug', 'Status', 'Template', 'SEO Description', 'Created', 'Updated', 'Content (HTML)'],
        rows.map(r => [r.title, r.slug, r.status, r.template, r.seo_description ?? '', isoOrNull(r.created_at), isoOrNull(r.updated_at), r.content]),
      );
    });
  }

  static async exportEntriesCsv(tenantId: string, modelId: string): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      await trx.selectFrom('cms_content_models').select('id')
        .where('id', '=', modelId).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      const fields = await trx.selectFrom('cms_content_fields').select(['key', 'label'])
        .where('model_id', '=', modelId).orderBy('sort_order', 'asc').execute();
      const rows = await trx.selectFrom('cms_content_entries').selectAll()
        .where('model_id', '=', modelId).where('tenant_id', '=', tenantId).where('status', '!=', 'trash')
        .orderBy('created_at', 'desc').execute();
      const headers = ['Title', 'Slug', 'Status', 'Created', 'Updated', ...fields.map(f => f.label)];
      const dataRows = rows.map(r => {
        const data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? {});
        return [r.title, r.slug, r.status, isoOrNull(r.created_at), isoOrNull(r.updated_at), ...fields.map(f => flattenValue(data[f.key]))];
      });
      return toCsv(headers, dataRows);
    });
  }

  // ── Import ────────────────────────────────────────────────────────────

  private static readonly MAX_IMPORT_ITEMS = 500;
  private static readonly WXR_STATUS_MAP: Record<string, CmsPostStatus> = {
    publish: 'published', draft: 'draft', trash: 'trash',
    // WordPress's own pending/private/future statuses have no direct
    // equivalent here — landing them as draft is the same honest,
    // disclosed simplification currency's own non-ISO-4217-validated code
    // already established: a real value, not a guess dressed up as one.
    pending: 'draft', private: 'draft', future: 'draft',
  };

  private static async uniquePostSlug(trx: any, tenantId: string, base: string): Promise<string> {
    let candidate = base, n = 2;
    while (await trx.selectFrom('cms_posts').select('id').where('tenant_id', '=', tenantId).where('slug', '=', candidate).executeTakeFirst()) {
      candidate = `${base}-${n}`; n++;
    }
    return candidate;
  }

  /**
   * Imports Posts from a WordPress WXR export (the standard Tools ▸ Export
   * XML file). Deliberately scoped to `wp:post_type === 'post'` — pages,
   * attachments, custom post types and comments are all real, disclosed
   * future work, not attempted here; a real production WordPress importer
   * would eventually need them, but a blog's own posts are the
   * brief's own named starting point and the highest-value slice on their
   * own. Capped at 500 items per import call so one oversized export can't
   * turn into an unbounded write — a second file/call handles the rest.
   * Never aborts the whole batch on one bad item: each is tried
   * independently, and a per-item failure is recorded and skipped rather
   * than losing every item after it.
   */
  static async importWordPress(tenantId: string, userId: string, xml: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['item', 'category'].includes(name),
    });
    let parsed: any;
    try {
      parsed = parser.parse(xml);
    } catch (e: any) {
      throw new Error(`Could not parse this file as XML: ${e.message || 'invalid format'}`);
    }
    const items: any[] = parsed?.rss?.channel?.item ?? [];
    if (!Array.isArray(items) || !items.length) {
      throw new Error('No WordPress items found — this doesn\'t look like a WordPress export (Tools ▸ Export) file.');
    }
    const posts = items.filter(it => it?.['wp:post_type'] === 'post').slice(0, this.MAX_IMPORT_ITEMS);
    if (!posts.length) {
      throw new Error('This export has no posts (wp:post_type="post") to import.');
    }

    let imported = 0, skipped = 0;
    const errors: string[] = [];

    for (const item of posts) {
      try {
        const title = String(item.title ?? '').trim();
        if (!title) { skipped++; errors.push('Skipped an item with no title.'); continue; }

        const rawStatus = String(item['wp:status'] ?? 'draft').toLowerCase();
        const status = this.WXR_STATUS_MAP[rawStatus] ?? 'draft';

        const categories: any[] = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
        const categoryNames = categories.filter(c => c?.['@_domain'] === 'category').map(c => String(c['#text'] ?? c ?? '').trim()).filter(Boolean);
        const tagNames = categories.filter(c => c?.['@_domain'] === 'post_tag').map(c => String(c['#text'] ?? c ?? '').trim()).filter(Boolean);

        const postDate = item['wp:post_date'] ? new Date(String(item['wp:post_date']).replace(' ', 'T')) : null;
        const createdAt = postDate && !Number.isNaN(postDate.getTime()) ? postDate.toISOString() : undefined;

        const rawSlug = String(item['wp:post_name'] ?? '').trim();
        const baseSlug = (rawSlug || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post';
        const slug = await withTenant(tenantId, trx => this.uniquePostSlug(trx, tenantId, baseSlug));

        await CMSService.createTenantPost(tenantId, userId, {
          title, slug, status,
          content: String(item['content:encoded'] ?? ''),
          category: categoryNames[0],
          tags: tagNames.length ? tagNames.join(', ') : undefined,
          created_at: createdAt,
        });
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`"${item?.title ?? '(untitled)'}" — ${e.message || 'unknown error'}`);
      }
    }

    return { imported, skipped, errors: errors.slice(0, 50) };
  }
}
