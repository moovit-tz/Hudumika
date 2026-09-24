import { dbPlatform, withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { objectStore } from '../integrations/object-storage.js';
import { scanBuffer } from '../integrations/antivirus.js';
import { emitDomainEvent } from '../services/domain-events.service.js';
import { env } from '../config/env.js';

/**
 * Nightly Cloud storage maintenance (migration 504):
 *
 *  1. Malware re-scan — files that were stored while the scanner was
 *     unconfigured or unreachable (scan_status NULL/'skipped') are scanned
 *     once ClamAV is available; a positive hit is quarantined (downloads are
 *     refused with 423; the row and bytes are kept for the admin to review,
 *     not silently deleted). Only runs when CLAMAV_HOST is set.
 *  2. Storage integrity — every file row that claims stored bytes is checked
 *     against the object store; a missing object is flagged
 *     (storage_missing) and surfaced in the compliance report and as a domain
 *     event, so a lost object is noticed before someone needs the file.
 *     This detects loss; it is not a backup. Durable copies come from the
 *     object store itself (S3/MinIO versioning + replication) — configure
 *     that at the bucket level.
 */
const SCAN_BATCH = 50;
const SCAN_MAX_BYTES = 25 * 1024 * 1024; // clamd's default StreamMaxLength
const VERIFY_BATCH = 500;
const VERIFY_INTERVAL_DAYS = 7;

export async function runMalwareRescan(): Promise<{ scanned: number; infected: number }> {
  if (!env.CLAMAV_HOST) return { scanned: 0, infected: 0 };
  const rows = await dbPlatform.selectFrom('cloud_files')
    .select(['id', 'tenant_id', 'name', 'storage_key', 'size'])
    .where('type', '!=', 'folder').where('storage_key', 'is not', null)
    .where(eb => eb.or([eb('scan_status', 'is', null), eb('scan_status', 'in', ['skipped', 'pending'])]))
    .orderBy('created_at', 'asc').limit(SCAN_BATCH).execute();

  let scanned = 0, infected = 0;
  for (const row of rows) {
    if (Number(row.size) > SCAN_MAX_BYTES) continue;
    try {
      const buf = await MinioIntegration.readFile(row.storage_key!);
      if (!buf) continue;
      const result = await scanBuffer(buf);
      if (result.skipped) continue; // scanner unreachable this time — try again tomorrow
      const status = result.clean ? 'clean' : 'infected';
      await withTenant(row.tenant_id, async (trx) => {
        await trx.updateTable('cloud_files').set({ scan_status: status, scanned_at: new Date() })
          .where('id', '=', row.id).where('tenant_id', '=', row.tenant_id).execute();
        if (!result.clean) {
          await emitDomainEvent(trx, row.tenant_id, {
            type: 'cloud.file.quarantined', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
            payload: { name: row.name, signature: result.signature ?? null }, actorId: null,
          });
        }
      });
      scanned++;
      if (!result.clean) infected++;
    } catch (err: any) {
      console.error(`❌ Malware re-scan failed for file ${row.id}:`, err.message);
    }
  }
  return { scanned, infected };
}

export async function runStorageIntegrityCheck(onlyTenantId?: string): Promise<{ checked: number; missing: number }> {
  const cutoff = new Date(Date.now() - VERIFY_INTERVAL_DAYS * 86_400_000);
  let query = dbPlatform.selectFrom('cloud_files')
    .select(['id', 'tenant_id', 'name', 'storage_key', 'storage_missing'])
    .where('type', '!=', 'folder').where('storage_key', 'is not', null)
    .where(eb => eb.or([eb('storage_verified_at', 'is', null), eb('storage_verified_at', '<', cutoff)]));
  if (onlyTenantId) query = query.where('tenant_id', '=', onlyTenantId);
  const rows = await query.orderBy('storage_verified_at', 'asc').limit(VERIFY_BATCH).execute();

  let checked = 0, missing = 0;
  for (const row of rows) {
    try {
      const exists = await objectStore.exists(row.storage_key!);
      checked++;
      if (!exists) missing++;
      if (!exists || row.storage_missing) {
        await withTenant(row.tenant_id, async (trx) => {
          await trx.updateTable('cloud_files').set({ storage_missing: !exists, storage_verified_at: new Date() })
            .where('id', '=', row.id).where('tenant_id', '=', row.tenant_id).execute();
          if (!exists) {
            await emitDomainEvent(trx, row.tenant_id, {
              type: 'cloud.file.missing_from_storage', sourceApp: 'cloud', entityType: 'document', entityId: row.id,
              payload: { name: row.name }, actorId: null,
            });
          }
        });
      } else {
        await dbPlatform.updateTable('cloud_files').set({ storage_verified_at: new Date() })
          .where('id', '=', row.id).where('tenant_id', '=', row.tenant_id).execute();
      }
    } catch (err: any) {
      console.error(`❌ Storage integrity check failed for file ${row.id}:`, err.message);
    }
  }
  return { checked, missing };
}

/** Abandoned chunked uploads: expired open sessions are closed and their staged chunks deleted. */
export async function runUploadSessionCleanup(onlyTenantId?: string): Promise<number> {
  let q = dbPlatform.selectFrom('cloud_upload_sessions').select(['id', 'tenant_id', 'size', 'chunk_bytes'])
    .where('status', '=', 'open').where('expires_at', '<', new Date());
  if (onlyTenantId) q = q.where('tenant_id', '=', onlyTenantId);
  const stale = await q.limit(200).execute();
  for (const s of stale) {
    try {
      await MinioIntegration.deleteUploadChunks(s.tenant_id, s.id, Math.ceil(Number(s.size) / s.chunk_bytes));
      await dbPlatform.updateTable('cloud_upload_sessions').set({ status: 'cancelled', updated_at: new Date() })
        .where('id', '=', s.id).where('tenant_id', '=', s.tenant_id).execute();
    } catch (err: any) { console.error(`❌ Upload session cleanup failed for ${s.id}:`, err.message); }
  }
  return stale.length;
}

export async function runCloudStorageMaintenanceJob(): Promise<void> {
  try {
    await runUploadSessionCleanup();
    const scan = await runMalwareRescan();
    const integrity = await runStorageIntegrityCheck();
    if (scan.scanned || scan.infected || integrity.missing) {
      console.log(`🛡️ Cloud maintenance — re-scanned: ${scan.scanned} (infected: ${scan.infected}); integrity checked: ${integrity.checked} (missing: ${integrity.missing})`);
    }
  } catch (err) {
    console.error('❌ Cloud storage maintenance job failed:', err);
  }
}
