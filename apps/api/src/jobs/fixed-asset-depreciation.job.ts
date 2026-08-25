// Monthly straight-line depreciation posting — cross-tenant, same
// dbPlatform-then-per-tenant-service-call shape as recurring-documents.job.ts.
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { runDepreciationForTenant } from '../services/fixed-assets.service.js';

export async function runFixedAssetDepreciationJob(): Promise<void> {
  const periodDate = new Date().toISOString().slice(0, 8) + '01';
  try {
    const tenants = await sql<{ tenant_id: string }>`
      SELECT DISTINCT tenant_id FROM fixed_assets WHERE status = 'ACTIVE'
    `.execute(dbPlatform);
    let posted = 0;
    for (const { tenant_id } of tenants.rows) {
      try {
        const result = await runDepreciationForTenant(tenant_id, periodDate);
        posted += result.posted;
      } catch (err) {
        console.error(`❌ Depreciation posting failed for tenant ${tenant_id}:`, err);
      }
    }
    if (posted > 0) console.log(`✅ Posted depreciation for ${posted} asset(s).`);
  } catch (err) {
    console.error('❌ Fixed asset depreciation sweep failed:', err);
  }
}
