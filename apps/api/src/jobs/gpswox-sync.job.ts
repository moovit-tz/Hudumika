import { dbPlatform } from '../db/client.js';
import { gpswoxService } from '../services/gpswox.service.js';

/**
 * Polls GPSWOX on behalf of every tenant that has credentials configured
 * (tenant_settings.settings->'int-gpswox') and syncs positions/alerts into
 * our own vehicle_positions/fleet_alerts tables. Tenants without credentials
 * are skipped silently — no mock/simulated data is ever produced here.
 */
export async function runGpswoxSyncJob(): Promise<void> {
  try {
    const rows = await dbPlatform.selectFrom('tenant_settings')
      .select(['tenant_id', 'settings'])
      .execute();

    for (const row of rows) {
      const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
      const c = settings?.['int-gpswox'];
      if (!c?.base_url || !c?.email || !c?.password) continue;

      try {
        const result = await gpswoxService.syncPositions(row.tenant_id);
        if (result.ok) {
          console.log(`✅ GPSWOX sync: tenant ${row.tenant_id} — ${result.matched} matched, ${result.unmatched.length} unmatched`);
        } else {
          console.warn(`⚠️ GPSWOX sync skipped/failed: tenant ${row.tenant_id} — ${result.reason}`);
        }
      } catch (err) {
        console.error(`❌ GPSWOX sync error for tenant ${row.tenant_id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ GPSWOX sync job failed:', err);
  }
}
