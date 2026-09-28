/**
 * Document retention enforcement (migration 499).
 *
 * Two passes per nightly run:
 *
 *  1. Backfill — any cloud_file with a retention_class but no retain_until
 *     missed the computation at filing time (e.g. filed before migration 499
 *     or by a path that does not yet call retainUntilFor). Set it now.
 *
 *  2. Expiry sweep — files whose retain_until has passed: emit a
 *     cloud.file.retention_expired domain event so the audit log records the
 *     transition, clear retain_until (the file is no longer locked), and let
 *     the normal trash-purge / admin-delete paths clean it up on their own
 *     schedule. Automatic deletion is deliberate omitted: a retained record
 *     expiring is not the same thing as it being unwanted; a human decision
 *     (or a separate archival-delete policy the admin configures) should
 *     precede any permanent removal.
 *
 * Both passes are bounded by BATCH_SIZE per run and repeat nightly, so even
 * large backlogs drain gradually rather than causing a single long-running
 * transaction.
 */
import { dbPlatform, withTenant } from '../db/client.js';
import { retainUntilFor } from '../lib/cloud-retention.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

const BATCH_SIZE = 200;

export async function runDocumentRetentionJob(): Promise<{
  backfilled: number;
  expired: number;
}> {
  let backfilled = 0;
  let expired = 0;

  // ── Pass 1: backfill missing retain_until ───────────────────────────────
  const toBackfill = await dbPlatform
    .selectFrom('cloud_files')
    .select(['id', 'tenant_id', 'retention_class', 'created_at'])
    .where('type', '!=', 'folder')
    .where('retention_class', 'is not', null)
    .where('retain_until', 'is', null)
    .orderBy('created_at', 'asc')
    .limit(BATCH_SIZE)
    .execute();

  for (const row of toBackfill) {
    try {
      const until = await withTenant(row.tenant_id, async (trx) => {
        return retainUntilFor(trx, row.tenant_id, row.retention_class, new Date(row.created_at));
      });
      if (!until) continue;
      await withTenant(row.tenant_id, async (trx) => {
        await trx
          .updateTable('cloud_files')
          .set({ retain_until: until })
          .where('id', '=', row.id)
          .where('tenant_id', '=', row.tenant_id)
          .execute();
      });
      backfilled++;
    } catch (err: any) {
      console.error(`[DocumentRetention] backfill failed for file ${row.id}:`, err.message);
    }
  }

  // ── Pass 2: expire past retain_until ────────────────────────────────────
  const now = new Date();
  const toExpire = await dbPlatform
    .selectFrom('cloud_files')
    .select(['id', 'tenant_id', 'name', 'retention_class', 'retain_until'])
    .where('type', '!=', 'folder')
    .where('retain_until', 'is not', null)
    .where('retain_until', '<', now)
    .orderBy('retain_until', 'asc')
    .limit(BATCH_SIZE)
    .execute();

  for (const row of toExpire) {
    try {
      await withTenant(row.tenant_id, async (trx) => {
        await trx
          .updateTable('cloud_files')
          .set({ retain_until: null })
          .where('id', '=', row.id)
          .where('tenant_id', '=', row.tenant_id)
          .execute();

        // Auditable: compliance tooling and Workflow Studio automation can
        // react to retention expiry without polling the table.
        await emitDomainEvent(trx, row.tenant_id, {
          type: 'cloud.file.retention_expired',
          sourceApp: 'cloud',
          entityType: 'document',
          entityId: row.id,
          actorId: null,
          payload: {
            name: row.name,
            retentionClass: row.retention_class,
            expiredAt: now.toISOString(),
          },
        });
      });
      expired++;
    } catch (err: any) {
      console.error(`[DocumentRetention] expiry sweep failed for file ${row.id}:`, err.message);
    }
  }

  if (backfilled || expired) {
    console.log(`📄 Document retention: backfilled ${backfilled}, expired ${expired}`);
  }
  return { backfilled, expired };
}
