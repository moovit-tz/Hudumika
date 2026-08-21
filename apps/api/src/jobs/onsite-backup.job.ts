import { dbPlatform, withTenant } from '../db/client.js';
import { snapshotTenant } from '../services/onsite-backup.service.js';

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Daily: one scheduled config snapshot per tenant that actually uses Onsite
 * (has at least one domain or application — skips tenants that never
 * touched it, rather than writing an empty snapshot for every tenant on the
 * platform), then prunes that tenant's own backups past its retention
 * window (tenant_settings['onsite-backup-retention-days'], default 30).
 *
 * Idempotency: skips a tenant that already has a 'scheduled' backup within
 * the last 20 hours — guards the interval-fallback path (which re-derives
 * its 24h timer on every process restart, so a dev session with several
 * tsx-watch restarts in one real day must not fan out several "daily"
 * snapshots) the same way comply-renewal.job.ts checks state before acting.
 */
export async function runOnsiteBackupJob(): Promise<void> {
  console.log('⏳ Running Onsite daily backup sweep...');
  try {
    const [fromDomains, fromApps] = await Promise.all([
      dbPlatform.selectFrom('onsite_domains').select('tenant_id').distinct().execute(),
      dbPlatform.selectFrom('onsite_applications').select('tenant_id').distinct().execute(),
    ]);
    const uniqueTenantIds = [...new Set([...fromDomains, ...fromApps].map(r => r.tenant_id))];

    if (uniqueTenantIds.length === 0) {
      console.log('✅ No tenants use Onsite yet — nothing to back up.');
      return;
    }

    const cutoff20h = new Date(Date.now() - 20 * 60 * 60 * 1000);
    let created = 0;
    let pruned = 0;

    for (const tenantId of uniqueTenantIds) {
      await withTenant(tenantId, async (trx) => {
        // Only gates whether a NEW backup gets created — retention pruning
        // below must still run every pass regardless, or a tenant that's
        // already been backed up today would never get pruned again until
        // its next snapshot, silently piling up backups past its own
        // configured retention window.
        const recent = await trx.selectFrom('onsite_backups').select('id')
          .where('tenant_id', '=', tenantId).where('trigger', '=', 'scheduled')
          .where('created_at', '>', cutoff20h).executeTakeFirst();

        if (!recent) {
          try {
            const { snapshot, sizeBytes } = await snapshotTenant(tenantId);
            await trx.insertInto('onsite_backups').values({
              tenant_id: tenantId, trigger: 'scheduled', status: 'completed',
              snapshot: JSON.stringify(snapshot), size_bytes: sizeBytes,
            }).execute();
            created++;
          } catch (err: any) {
            await trx.insertInto('onsite_backups').values({
              tenant_id: tenantId, trigger: 'scheduled', status: 'failed',
              snapshot: JSON.stringify({}), size_bytes: 0,
              error_message: String(err?.message ?? err).slice(0, 500),
            }).execute();
          }
        }

        const settingsRow = await trx.selectFrom('tenant_settings').select('settings')
          .where('tenant_id', '=', tenantId).executeTakeFirst();
        const settings = settingsRow
          ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
          : {};
        const retentionDays = settings['onsite-backup-retention-days'] ?? DEFAULT_RETENTION_DAYS;
        const retentionCutoff = new Date(Date.now() - retentionDays * 86_400_000);
        const res = await trx.deleteFrom('onsite_backups')
          .where('tenant_id', '=', tenantId).where('created_at', '<', retentionCutoff).executeTakeFirst();
        pruned += Number(res.numDeletedRows ?? 0);
      });
    }

    console.log(`✅ Onsite backup sweep done — ${created} new scheduled snapshot(s), ${pruned} pruned past retention.`);
  } catch (error) {
    console.error('❌ Onsite backup job failed:', error);
  }
}
