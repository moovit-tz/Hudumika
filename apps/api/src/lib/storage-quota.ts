import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';

/**
 * Real per-tenant Cloud storage quota, hooked into the same tenants.plan →
 * packages tier system the monthly item-count metering (lib/usage.ts)
 * already uses — see packages.storage_limit_bytes (migration 234). No
 * cached counter table: usage is a live SUM, cheap with an index on
 * (tenant_id, type) and immune to the drift a cached counter would risk on
 * every upload/move/delete.
 *
 * What counts against the quota — every byte we actually store for the
 * tenant in Cloud:
 *   - live files (including system/generated ones — Finance auto-filing,
 *     signed eSign PDFs, CloudSync mirrors are all ordinary cloud_files rows)
 *   - trashed files, until they are purged (they still occupy storage)
 *   - SEAL shipment documents (seal_documents, a separate table)
 *   - version history (cloud_file_versions) — every archived revision is a
 *     full stored copy, and used to be invisible to the quota
 * Not counted: folders (their `size` is a rolled-up total of children, so
 * counting them would double-count) and OneDrive/external-connector files
 * (cloud_external_files — the bytes live in the customer's own account, we
 * only hold metadata). There is no thumbnail/preview or temporary
 * upload-part storage in this codebase to account for.
 */

export interface StorageLimit {
  /** null = unlimited (enterprise tier, or a legacy plan code with no package row) */
  total: number | null;
  base: number | null;
  addon: number;
}

async function getStorageLimit(tenantId: string): Promise<StorageLimit> {
  const tenant = await withTenant(tenantId, (trx) =>
    trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst(),
  );
  if (!tenant) return { total: null, base: null, addon: 0 };
  const pkg = await dbPlatform.selectFrom('packages').select('storage_limit_bytes').where('code', '=', tenant.plan).executeTakeFirst();
  // No matching package row (legacy plan code) or a genuinely unlimited tier — both read as unlimited.
  if (!pkg || pkg.storage_limit_bytes == null) return { total: null, base: null, addon: 0 };
  const base = Number(pkg.storage_limit_bytes);

  // Purchased storage add-ons (migration 504): storage_bytes per unit × quantity.
  const addonRow = await dbPlatform.selectFrom('tenant_addons')
    .innerJoin('package_addons', 'package_addons.code', 'tenant_addons.addon_code')
    .select(sql<string>`COALESCE(SUM(package_addons.storage_bytes * tenant_addons.quantity), 0)`.as('total'))
    .where('tenant_addons.tenant_id', '=', tenantId)
    .where('tenant_addons.status', '=', 'active')
    .where('package_addons.storage_bytes', 'is not', null)
    .executeTakeFirst();
  const addon = Number(addonRow?.total ?? 0);
  return { total: base + addon, base, addon };
}

/** Dunning stage at which an unpaid subscription invoice blocks new storage
 *  writes (reads, downloads and deletes keep working — a delinquent tenant
 *  must still be able to get their data out and free space). */
export const BILLING_LOCK_STAGE = 4;

async function isBillingLocked(tenantId: string): Promise<boolean> {
  const row = await dbPlatform.selectFrom('subscription_invoices').select('id')
    .where('tenant_id', '=', tenantId)
    .where('status', 'in', ['due', 'overdue'])
    .where('dunning_stage', '>=', BILLING_LOCK_STAGE)
    .limit(1).executeTakeFirst();
  return !!row;
}

export type StorageCategory = 'documents' | 'images' | 'video' | 'audio' | 'archives' | 'other';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'tif', 'tiff']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'video']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md', 'json', 'rtf', 'odt', 'ods']);

export function categoryOf(type: string | null, mime: string | null): StorageCategory {
  const t = (type ?? '').toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (IMAGE_EXT.has(t) || m.startsWith('image/')) return 'images';
  if (VIDEO_EXT.has(t) || m.startsWith('video/')) return 'video';
  if (AUDIO_EXT.has(t) || m.startsWith('audio/')) return 'audio';
  if (ARCHIVE_EXT.has(t) || m.includes('zip') || m.includes('compressed')) return 'archives';
  if (DOC_EXT.has(t) || m === 'application/pdf' || m.startsWith('text/') || m.includes('officedocument') || m.includes('msword')) return 'documents';
  return 'other';
}

export type QuotaLevel = 'ok' | 'warning' | 'high' | 'critical' | 'exceeded';

/** 70% / 85% / 95% / 100% thresholds. Unlimited tiers are always 'ok'. */
export function quotaLevel(used: number, limit: number | null): QuotaLevel {
  if (limit === null || limit <= 0) return 'ok';
  const pct = (used / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= 95) return 'critical';
  if (pct >= 85) return 'high';
  if (pct >= 70) return 'warning';
  return 'ok';
}

export interface StorageBreakdown {
  live_bytes: number;
  trash_bytes: number;
  versions_bytes: number;
  by_category: Record<StorageCategory, number>;
}

export async function getStorageBreakdown(tenantId: string): Promise<StorageBreakdown> {
  const { files, versions, sealBytes } = await withTenant(tenantId, async (trx) => {
    // Folders excluded — a folder's own `size` is already a rolled-up total
    // of its children (see files.routes.ts's bumpParentCount), so including
    // it would double-count every file once directly and again per ancestor.
    const files = await trx.selectFrom('cloud_files')
      .select(['type', 'mime_type', 'is_trash'])
      .select(({ fn }) => fn.sum<string>('size').as('total'))
      .where('tenant_id', '=', tenantId)
      .where('type', '!=', 'folder')
      .groupBy(['type', 'mime_type', 'is_trash'])
      .execute();
    const versions = await trx.selectFrom('cloud_file_versions')
      .innerJoin('cloud_files', 'cloud_files.id', 'cloud_file_versions.file_id')
      .select(['cloud_files.type as type', 'cloud_file_versions.mime_type as mime_type'])
      .select(({ fn }) => fn.sum<string>('cloud_file_versions.size').as('total'))
      .where('cloud_file_versions.tenant_id', '=', tenantId)
      .groupBy(['cloud_files.type', 'cloud_file_versions.mime_type'])
      .execute();
    // SEAL documents live in their own table but are stored bytes all the same.
    const seal = await trx.selectFrom('seal_documents')
      .select(({ fn }) => fn.sum<string>('size_bytes').as('total'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    return { files, versions, sealBytes: seal?.total != null ? Number(seal.total) : 0 };
  });

  const by_category: Record<StorageCategory, number> = { documents: 0, images: 0, video: 0, audio: 0, archives: 0, other: 0 };
  let live_bytes = 0, trash_bytes = 0, versions_bytes = 0;
  for (const r of files) {
    const n = r.total != null ? Number(r.total) : 0;
    if (r.is_trash) trash_bytes += n; else live_bytes += n;
    by_category[categoryOf(r.type, r.mime_type)] += n;
  }
  live_bytes += sealBytes;
  by_category.documents += sealBytes;
  for (const r of versions) {
    const n = r.total != null ? Number(r.total) : 0;
    versions_bytes += n;
    by_category[categoryOf(r.type, r.mime_type)] += n;
  }
  return { live_bytes, trash_bytes, versions_bytes, by_category };
}

export interface StorageQuota {
  used_bytes: number;
  limit_bytes: number | null; // null = unlimited; plan + purchased add-ons
  base_limit_bytes: number | null;
  addon_bytes: number;
  /** New writes are blocked because a subscription invoice is badly overdue. */
  billing_locked: boolean;
  level: QuotaLevel;
  live_bytes: number;
  trash_bytes: number;
  versions_bytes: number;
  by_category: Record<StorageCategory, number>;
}

export async function getStorageQuota(tenantId: string): Promise<StorageQuota> {
  const [limit, breakdown, billing_locked] = await Promise.all([getStorageLimit(tenantId), getStorageBreakdown(tenantId), isBillingLocked(tenantId)]);
  const used_bytes = breakdown.live_bytes + breakdown.trash_bytes + breakdown.versions_bytes;
  return {
    used_bytes, limit_bytes: limit.total, base_limit_bytes: limit.base, addon_bytes: limit.addon, billing_locked,
    level: quotaLevel(used_bytes, limit.total), ...breakdown,
  };
}

export async function wouldExceedStorageQuota(tenantId: string, additionalBytes: number): Promise<StorageQuota & { exceeded: boolean }> {
  const quota = await getStorageQuota(tenantId);
  const overLimit = quota.limit_bytes !== null && quota.used_bytes + additionalBytes > quota.limit_bytes;
  return { ...quota, exceeded: overLimit || quota.billing_locked };
}

const fmtBytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1)} GB` : `${Math.round(n / 1048576)} MB`;

/** User-facing 402 message for a blocked write — distinguishes "over your
 *  limit" from "blocked for an unpaid invoice", which need different fixes. */
export function quotaBlockedMessage(q: StorageQuota, what = 'This upload'): string {
  if (q.billing_locked) return `${what} is blocked because a subscription invoice is badly overdue. Pay the invoice to resume uploads — your files stay available to view, download and delete.`;
  return `${what} would exceed your storage limit${q.limit_bytes != null ? ` (${fmtBytes(q.limit_bytes)})` : ''}. Buy extra storage, upgrade your plan or free up space.`;
}
