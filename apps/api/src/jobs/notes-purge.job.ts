import { dbPlatform, withTenant } from '../db/client.js';

// Matches Cloud's own retention window (cloud-trash-expiry.job.ts's
// TRASH_RETENTION_DAYS) rather than inventing a different number for this
// app — same product convention, same 30 days.
export const NOTES_TRASH_RETENTION_DAYS = 30;

/**
 * Daily job: permanently deletes any note that has sat in Trash longer than
 * NOTES_TRASH_RETENTION_DAYS. Notes never auto-purged before this — Trash
 * only ever emptied on an explicit click, forever. legal_hold
 * (282_notes_enterprise.sql) exempts a note from this sweep regardless of
 * age, for compliance content that must not disappear on a timer.
 *
 * Same shape as cloud-trash-expiry.job.ts: the candidate scan is cross-
 * tenant (dbPlatform), but every actual delete runs inside that tenant's
 * own withTenant() transaction rather than one blanket cross-tenant DELETE.
 */
export async function runNotesPurgeJob(): Promise<void> {
  console.log('⏳ Running Notes trash auto-purge sweep...');
  try {
    const cutoff = new Date(Date.now() - NOTES_TRASH_RETENTION_DAYS * 86_400_000);

    const expired = await dbPlatform.selectFrom('notes')
      .select(['id', 'tenant_id'])
      .where('is_trashed', '=', true)
      .where('legal_hold', '=', false)
      .where('trashed_at', 'is not', null)
      .where('trashed_at', '<', cutoff)
      .execute();

    if (expired.length === 0) {
      console.log('✅ No trashed notes past the retention window.');
      return;
    }

    const byTenant = new Map<string, typeof expired>();
    for (const row of expired) {
      const list = byTenant.get(row.tenant_id) ?? [];
      list.push(row);
      byTenant.set(row.tenant_id, list);
    }

    let deleted = 0;
    for (const [tenantId, rows] of byTenant) {
      await withTenant(tenantId, async (trx) => {
        await trx.deleteFrom('notes').where('tenant_id', '=', tenantId)
          .where('id', 'in', rows.map(r => r.id)).execute();
        deleted += rows.length;
      });
    }

    console.log(`✅ Notes trash auto-purge done — permanently deleted ${deleted} note(s) past the ${NOTES_TRASH_RETENTION_DAYS}-day retention window.`);
  } catch (error) {
    console.error('❌ Notes trash auto-purge job failed:', error);
  }
}
