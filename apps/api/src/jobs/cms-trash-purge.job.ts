import { dbPlatform, withTenant } from '../db/client.js';
import { deleteRevisions } from '../services/cms-revisions.service.js';

// Same retention window as Cloud/Notes (cloud-trash-expiry.job.ts /
// notes-purge.job.ts's own TRASH_RETENTION_DAYS) — one platform-wide
// convention, not a different number invented for CMS.
export const CMS_TRASH_RETENTION_DAYS = 30;

/**
 * Daily job: permanently deletes any Page or Post that has sat in Trash
 * longer than CMS_TRASH_RETENTION_DAYS. Neither ever auto-purged before
 * this — Posts got a real Trash status and a manual "Delete permanently"
 * button in an earlier pass, but nothing ever emptied it on its own; Pages
 * had no Trash at all, an instant hard-delete was the only option.
 *
 * trashed_at (migration 468), not updated_at, is the retention clock —
 * updated_at bumps on any save, which would make an old page that never
 * even touched Trash eligible by accident.
 *
 * tenant_id IS NOT NULL excludes Hudumika's own platform pages — those have
 * no Trash UI and were never meant to be swept by a tenant-content job.
 *
 * Same shape as notes-purge.job.ts: the candidate scan is cross-tenant
 * (dbPlatform), but every actual delete runs inside that tenant's own
 * withTenant() transaction rather than one blanket cross-tenant DELETE.
 */
export async function runCmsTrashPurgeJob(): Promise<void> {
  console.log('⏳ Running CMS trash auto-purge sweep (pages + posts)...');
  try {
    const cutoff = new Date(Date.now() - CMS_TRASH_RETENTION_DAYS * 86_400_000);

    const [expiredPages, expiredPosts] = await Promise.all([
      dbPlatform.selectFrom('cms_pages').select(['id', 'tenant_id'])
        .where('status', '=', 'trash').where('tenant_id', 'is not', null)
        .where('trashed_at', 'is not', null).where('trashed_at', '<', cutoff)
        .execute(),
      dbPlatform.selectFrom('cms_posts').select(['id', 'tenant_id'])
        .where('status', '=', 'trash')
        .where('trashed_at', 'is not', null).where('trashed_at', '<', cutoff)
        .execute(),
    ]);

    if (expiredPages.length === 0 && expiredPosts.length === 0) {
      console.log('✅ No trashed pages or posts past the retention window.');
      return;
    }

    function groupByTenant<T extends { tenant_id: string | null }>(rows: T[]): Map<string, T[]> {
      const byTenant = new Map<string, T[]>();
      for (const row of rows) {
        if (!row.tenant_id) continue;
        const list = byTenant.get(row.tenant_id) ?? [];
        list.push(row);
        byTenant.set(row.tenant_id, list);
      }
      return byTenant;
    }

    let deletedPages = 0, deletedPosts = 0;
    const pagesByTenant = groupByTenant(expiredPages);
    for (const [tenantId, rows] of pagesByTenant) {
      await withTenant(tenantId, async (trx) => {
        await trx.deleteFrom('cms_pages').where('tenant_id', '=', tenantId)
          .where('id', 'in', rows.map(r => r.id)).execute();
        for (const row of rows) await deleteRevisions(trx, tenantId, 'page', row.id);
        deletedPages += rows.length;
      });
    }
    const postsByTenant = groupByTenant(expiredPosts);
    for (const [tenantId, rows] of postsByTenant) {
      await withTenant(tenantId, async (trx) => {
        await trx.deleteFrom('cms_posts').where('tenant_id', '=', tenantId)
          .where('id', 'in', rows.map(r => r.id)).execute();
        for (const row of rows) await deleteRevisions(trx, tenantId, 'post', row.id);
        deletedPosts += rows.length;
      });
    }

    console.log(`✅ CMS trash auto-purge done — permanently deleted ${deletedPages} page(s) and ${deletedPosts} post(s) past the ${CMS_TRASH_RETENTION_DAYS}-day retention window.`);
  } catch (error) {
    console.error('❌ CMS trash auto-purge job failed:', error);
  }
}
