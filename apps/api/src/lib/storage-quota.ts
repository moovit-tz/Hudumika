import { dbPlatform, withTenant } from '../db/client.js';

/**
 * Real per-tenant Cloud storage quota, hooked into the same tenants.plan →
 * packages tier system the monthly item-count metering (lib/usage.ts)
 * already uses — see packages.storage_limit_bytes (migration 234). No
 * cached counter table: usage is a live SUM over cloud_files, cheap with an
 * index on (tenant_id, type) and immune to the drift a cached counter would
 * risk on every upload/move/delete.
 */

async function getStorageLimit(tenantId: string): Promise<number | null> {
  const tenant = await withTenant(tenantId, (trx) =>
    trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst(),
  );
  if (!tenant) return null;
  const pkg = await dbPlatform.selectFrom('packages').select('storage_limit_bytes').where('code', '=', tenant.plan).executeTakeFirst();
  // No matching package row (legacy plan code) or a genuinely unlimited tier — both read as unlimited.
  if (!pkg || pkg.storage_limit_bytes == null) return null;
  return Number(pkg.storage_limit_bytes);
}

async function getStorageUsed(tenantId: string): Promise<number> {
  // Folders excluded — a folder's own `size` is already a rolled-up total
  // of its children (see files.routes.ts's bumpParentCount), so including
  // it would double-count every file once directly and again per ancestor.
  const row = await withTenant(tenantId, (trx) =>
    trx.selectFrom('cloud_files')
      .select(({ fn }) => fn.sum<string>('size').as('total'))
      .where('tenant_id', '=', tenantId)
      .where('type', '!=', 'folder')
      .executeTakeFirst(),
  );
  return row?.total != null ? Number(row.total) : 0;
}

export interface StorageQuota {
  used_bytes: number;
  limit_bytes: number | null; // null = unlimited
}

export async function getStorageQuota(tenantId: string): Promise<StorageQuota> {
  const [limit_bytes, used_bytes] = await Promise.all([getStorageLimit(tenantId), getStorageUsed(tenantId)]);
  return { used_bytes, limit_bytes };
}

export async function wouldExceedStorageQuota(tenantId: string, additionalBytes: number): Promise<StorageQuota & { exceeded: boolean }> {
  const quota = await getStorageQuota(tenantId);
  const exceeded = quota.limit_bytes !== null && quota.used_bytes + additionalBytes > quota.limit_bytes;
  return { ...quota, exceeded };
}
