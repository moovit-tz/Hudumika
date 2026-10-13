import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { snapshotTenant } from '../services/onsite-backup.service.js';

const DEFAULT_RETENTION_DAYS = 30;

// Platform discovery only; snapshots and retention use the tenant's RLS transaction.
export async function findOnsiteBackupTenants(): Promise<string[]> {
  const groups = await Promise.all([
    dbPlatform.selectFrom('onsite_domains').select('tenant_id').distinct().execute(),
    dbPlatform.selectFrom('onsite_applications').select('tenant_id').distinct().execute(),
    dbPlatform.selectFrom('onsite_websites').select('tenant_id').distinct().execute(),
    dbPlatform.selectFrom('onsite_health_checks').select('tenant_id').distinct().execute(),
    dbPlatform.selectFrom('onsite_provider_connections').select('tenant_id').distinct().execute(),
    dbPlatform.selectFrom('onsite_backups').select('tenant_id').distinct().execute(),
  ]);
  return [...new Set(groups.flat().map(row => row.tenant_id))];
}

export async function maintainOnsiteTenantBackups(tenantId: string): Promise<{ created: number; pruned: number }> {
  try {
    return await withTenant(tenantId, async trx => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`onsite-backup:${tenantId}`}, 0))`.execute(trx);
      const recent = await trx.selectFrom('onsite_backups').select('id')
        .where('tenant_id', '=', tenantId).where('trigger', '=', 'scheduled')
        .where('status', '=', 'completed')
        .where('created_at', '>', new Date(Date.now() - 20 * 60 * 60 * 1000)).executeTakeFirst();
      let created = 0;
      if (!recent) {
        // Avoid borrowing a second pool connection while holding the first.
        const { snapshot, sizeBytes } = await snapshotTenant(tenantId, trx);
        if (Object.values(snapshot).some(rows => rows.length > 0)) {
          await trx.insertInto('onsite_backups').values({
            tenant_id: tenantId, trigger: 'scheduled', status: 'completed',
            snapshot: JSON.stringify(snapshot), size_bytes: sizeBytes,
          }).execute();
          created = 1;
        }
      }
      const row = await trx.selectFrom('tenant_settings').select('settings')
        .where('tenant_id', '=', tenantId).executeTakeFirst();
      const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
      const configuredDays = settings?.['onsite-backup-retention-days'];
      const retentionDays = Number.isInteger(configuredDays) && configuredDays >= 1 && configuredDays <= 365
        ? configuredDays : DEFAULT_RETENTION_DAYS;
      // Prune even when today's successful snapshot already exists.
      const res = await trx.deleteFrom('onsite_backups').where('tenant_id', '=', tenantId)
        .where('created_at', '<', new Date(Date.now() - retentionDays * 86400000)).executeTakeFirst();
      return { created, pruned: Number(res.numDeletedRows ?? 0) };
    });
  } catch (error) {
    // Roll back failed SQL before recording the failure in a fresh transaction.
    await withTenant(tenantId, trx => trx.insertInto('onsite_backups').values({
      tenant_id: tenantId, trigger: 'scheduled', status: 'failed',
      snapshot: JSON.stringify({}), size_bytes: 0,
      error_message: String(error instanceof Error ? error.message : error).slice(0, 500),
    }).execute());
    throw error;
  }
}

export async function runOnsiteBackupJob(): Promise<void> {
  console.log('Running Onsite daily backup sweep...');
  try {
    const tenants = await findOnsiteBackupTenants();
    let created = 0;
    let pruned = 0;
    for (const tenantId of tenants) {
      try {
        const result = await maintainOnsiteTenantBackups(tenantId);
        created += result.created;
        pruned += result.pruned;
      } catch (error) {
        console.error('Onsite tenant backup failed:', tenantId, error);
      }
    }
    console.log(`Onsite backup sweep: ${created} created, ${pruned} pruned.`);
  } catch (error) {
    console.error('Onsite backup discovery failed:', error);
  }
}
