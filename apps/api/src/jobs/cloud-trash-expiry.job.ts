import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';

// 30 days — matches Google Drive's own default, stated explicitly rather
// than picked silently.
export const TRASH_RETENTION_DAYS = 30;

/**
 * Daily job: permanently deletes any cloud_files row that has sat in Trash
 * longer than TRASH_RETENTION_DAYS. Mirrors POST /trash/empty's own
 * MinIO-cleanup-then-delete sequence (files.routes.ts) rather than a second
 * copy of that logic with its own bugs — this just runs it unattended,
 * across every tenant, on a schedule instead of behind a SuperAdmin's
 * manual click.
 */
export async function runCloudTrashExpiryJob(): Promise<void> {
  console.log('⏳ Running Cloud trash auto-expiry sweep...');
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);

    const expired = await dbPlatform.selectFrom('cloud_files')
      .select(['id', 'tenant_id', 'storage_key'])
      .where('is_trash', '=', true)
      .where('trashed_at', 'is not', null)
      .where('trashed_at', '<', cutoff)
      .execute();

    if (expired.length === 0) {
      console.log('✅ No trashed Cloud files past the 30-day retention window.');
      return;
    }

    // Grouped by tenant so each deletion still runs inside that tenant's own
    // withTenant() transaction — a cross-tenant background sweep is exactly
    // the case CLAUDE.md's explicit tenant_id rule exists for.
    const byTenant = new Map<string, typeof expired>();
    for (const row of expired) {
      const list = byTenant.get(row.tenant_id) ?? [];
      list.push(row);
      byTenant.set(row.tenant_id, list);
    }

    let deleted = 0;
    for (const [tenantId, rows] of byTenant) {
      await withTenant(tenantId, async (trx) => {
        for (const row of rows) {
          if (row.storage_key) await MinioIntegration.deleteDocument(tenantId, row.storage_key);
          await trx.deleteFrom('cloud_files').where('id', '=', row.id).where('tenant_id', '=', tenantId).execute();
          deleted++;
        }
      });
    }

    console.log(`✅ Cloud trash auto-expiry sweep done — permanently deleted ${deleted} file(s).`);
  } catch (error) {
    console.error('❌ Cloud trash auto-expiry job failed:', error);
  }
}
