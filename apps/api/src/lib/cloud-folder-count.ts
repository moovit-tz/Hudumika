import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Keeps a cloud_files folder's file_count/size aggregate correct after a
 * child is added, removed, or resized underneath it. Shared between
 * files.routes.ts (every real upload/move/delete path) and
 * cloud-sync.service.ts (customer/employee/SEAL/shipment document
 * mirroring) — the latter used to insert straight into cloud_files without
 * ever calling this, so a folder CloudSync mirrored real files into (e.g. a
 * shipment's own BL folder) kept showing "0 files" even when it genuinely
 * held one, because nothing had ever told the parent row its count changed.
 * Lives here rather than in files.routes.ts specifically so cloud-sync.
 * service.ts doesn't have to import a route module to get it.
 */
export async function bumpCloudFolderCount(
  trx: Transaction<Database> | any,
  parentId: string,
  tenantId: string,
  countDelta: number,
  sizeDelta: number,
) {
  const parent = await trx.selectFrom('cloud_files').select(['file_count', 'size'])
    .where('id', '=', parentId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!parent) return;
  await trx.updateTable('cloud_files').set({
    file_count: Math.max(0, Number(parent.file_count || 0) + countDelta),
    size: Math.max(0, Number(parent.size || 0) + sizeDelta),
    updated_at: new Date(),
  }).where('id', '=', parentId).execute();
}
