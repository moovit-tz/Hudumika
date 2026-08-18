import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { SealAnchorService, NothingToAnchor } from '../services/seal-anchor.service.js';

/**
 * Daily stamp pass — anchors every active, non-empty compartment belonging
 * to a SEAL-entitled tenant. Mirrors checkEntitlement()'s precedence
 * (middleware/entitlement.ts) minus the SUPER_ADMIN/app-status/API-key-scope
 * checks, which don't apply to a background job with no acting request:
 * an explicit tenant_settings['enabled-apps'].seal override (true or false)
 * wins over the tenant's plan; otherwise fall back to package_features. In
 * practice every tenant's SEAL access today is granted via that per-tenant
 * override rather than a plan-level package_features row, so the override
 * check is not optional here.
 */
export async function runSealLedgerAnchorJob(): Promise<void> {
  try {
    const candidates = await dbPlatform.selectFrom('seal_compartments as c')
      .innerJoin('tenants as t', 't.id', 'c.tenant_id')
      .leftJoin('tenant_settings as ts', 'ts.tenant_id', 't.id')
      .where('c.active', '=', true)
      .where(({ exists, selectFrom }) => exists(
        selectFrom('seal_lots as l').select(sql`1`.as('one')).whereRef('l.compartment_id', '=', 'c.id')
      ))
      .select(['c.id as compartment_id', 'c.tenant_id', 't.plan', 'ts.settings'])
      .execute();

    const planGrants = new Set(
      (await dbPlatform.selectFrom('package_features').select('package_code').where('feature_key', '=', 'seal').execute())
        .map(r => r.package_code)
    );

    const compartments = candidates.filter(c => {
      const settings = c.settings ? (typeof c.settings === 'string' ? JSON.parse(c.settings) : c.settings) : {};
      const override = (settings as any)?.['enabled-apps']?.seal;
      if (override === false) return false;
      if (override === true) return true;
      return planGrants.has(c.plan);
    });

    for (const c of compartments) {
      try {
        await withTenant(c.tenant_id, trx =>
          SealAnchorService.anchorCompartment(trx, c.tenant_id, c.compartment_id, { trigger: 'scheduled', requestedBy: null })
        );
        console.log(`✅ SEAL ledger anchor: compartment ${c.compartment_id} (tenant ${c.tenant_id})`);
      } catch (err) {
        if (err instanceof NothingToAnchor) continue; // race with a lot being removed between the query and the anchor
        console.error(`❌ SEAL ledger anchor failed for compartment ${c.compartment_id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ SEAL ledger anchor job failed:', err);
  }
}

/** Hourly sweep — proof confirmation lags the daily stamp cadence by
 *  hours to days (real Bitcoin block-mining time), so pending anchors need
 *  their own, more frequent re-check independent of when they were stamped. */
export async function runSealLedgerAnchorConfirmationSweepJob(): Promise<void> {
  try {
    const pending = await dbPlatform.selectFrom('seal_ledger_anchors')
      .select(['id', 'tenant_id'])
      .where('status', '=', 'pending')
      .execute();

    for (const anchor of pending) {
      try {
        const updated = await withTenant(anchor.tenant_id, trx => SealAnchorService.checkAnchorConfirmation(trx, anchor.tenant_id, anchor.id));
        if (updated.status === 'confirmed') {
          console.log(`✅ SEAL ledger anchor confirmed: ${anchor.id} (block ${updated.bitcoin_block_height})`);
        }
      } catch (err) {
        console.error(`❌ SEAL ledger anchor confirmation check failed for ${anchor.id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ SEAL ledger anchor confirmation sweep failed:', err);
  }
}
