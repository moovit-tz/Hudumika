import { dbPlatform, withTenant } from '../db/client.js';
import { CMSEnterpriseService } from '../services/cms-enterprise.service.js';

/**
 * Auto-publishes CMS pages/posts/content-entries and releases scheduled ahead of time —
 * closes the gap where the CMS dashboard's own copy promised "published,
 * drafted and scheduled" content with no scheduling mechanism behind the
 * third word. A row in status='scheduled' with publish_at in the past
 * flips to 'published'; safe to re-run on every sweep since a row is only
 * ever matched once (the status change excludes it from the next pass).
 * cms_content_entries (Content Model Builder) and cms_releases (Content Releases §18)
 * share this same sweep rather than getting a second job — same lifecycle, same rule.
 */
export async function runCmsScheduledPublishJob(): Promise<void> {
  try {
    const duePages = await dbPlatform.selectFrom('cms_pages')
      .select(['id', 'tenant_id'])
      .where('status', '=', 'scheduled')
      .where('publish_at', '<=', new Date())
      .where('tenant_id', 'is not', null)
      .limit(200)
      .execute();
    const duePosts = await dbPlatform.selectFrom('cms_posts')
      .select(['id', 'tenant_id'])
      .where('status', '=', 'scheduled')
      .where('publish_at', '<=', new Date())
      .limit(200)
      .execute();
    const dueEntries = await dbPlatform.selectFrom('cms_content_entries')
      .select(['id', 'tenant_id'])
      .where('status', '=', 'scheduled')
      .where('publish_at', '<=', new Date())
      .limit(200)
      .execute();
    const dueReleases = await dbPlatform.selectFrom('cms_releases')
      .select(['id', 'tenant_id', 'created_by'])
      .where('status', '=', 'scheduled')
      .where('publish_at', '<=', new Date())
      .limit(50)
      .execute();

    for (const p of duePages) {
      await withTenant(p.tenant_id as string, trx =>
        trx.updateTable('cms_pages').set({ status: 'published', updated_at: new Date() })
          .where('id', '=', p.id).execute());
    }
    for (const p of duePosts) {
      await withTenant(p.tenant_id, trx =>
        trx.updateTable('cms_posts').set({ status: 'published', updated_at: new Date() })
          .where('id', '=', p.id).execute());
    }
    for (const e of dueEntries) {
      await withTenant(e.tenant_id, trx =>
        trx.updateTable('cms_content_entries').set({ status: 'published', updated_at: new Date() })
          .where('id', '=', e.id).execute());
    }
    for (const r of dueReleases) {
      await CMSEnterpriseService.publishRelease(r.tenant_id, r.id, r.created_by ?? 'system').catch((err) => {
        console.error(`[CMS scheduled publish] Failed to publish release ${r.id}:`, err);
      });
    }

    if (duePages.length || duePosts.length || dueEntries.length || dueReleases.length) {
      console.log(`📰 CMS scheduled publish — pages: ${duePages.length}, posts: ${duePosts.length}, entries: ${dueEntries.length}, releases: ${dueReleases.length}`);
    }
  } catch (error) {
    console.error('❌ CMS scheduled publish job failed:', error);
  }
}

