import { sql } from 'kysely';
import { db, withTenant } from '../db/client.js';
import { DeclarationAnchorService, NothingToAnchor } from '../services/declaration-anchor.service.js';

/**
 * Daily stamp pass — anchors every ClearOS-entitled tenant that has at
 * least one declaration. Mirrors runSealLedgerAnchorJob's precedence check
 * (an explicit tenant_settings['enabled-apps'].clearos override wins over
 * the tenant's plan; otherwise fall back to package_features).
 */
export async function runDeclarationLedgerAnchorJob(): Promise<void> {
  try {
    const candidates = await db.selectFrom('tenants as t')
      .leftJoin('tenant_settings as ts', 'ts.tenant_id', 't.id')
      .where(({ exists, selectFrom }) => exists(
        selectFrom('declarations as d').select(sql`1`.as('one')).whereRef('d.tenant_id', '=', 't.id')
      ))
      .select(['t.id as tenant_id', 't.plan', 'ts.settings'])
      .execute();

    const planGrants = new Set(
      (await db.selectFrom('package_features').select('package_code').where('feature_key', '=', 'clearos').execute())
        .map(r => r.package_code)
    );

    const tenants = candidates.filter(t => {
      const settings = t.settings ? (typeof t.settings === 'string' ? JSON.parse(t.settings) : t.settings) : {};
      const override = (settings as any)?.['enabled-apps']?.clearos;
      if (override === false) return false;
      if (override === true) return true;
      return planGrants.has(t.plan);
    });

    for (const t of tenants) {
      try {
        await withTenant(t.tenant_id, trx =>
          DeclarationAnchorService.anchorTenant(trx, t.tenant_id, { trigger: 'scheduled', requestedBy: null })
        );
        console.log(`✅ Declaration ledger anchor: tenant ${t.tenant_id}`);
      } catch (err) {
        if (err instanceof NothingToAnchor) continue; // race with a declaration being deleted between the query and the anchor
        console.error(`❌ Declaration ledger anchor failed for tenant ${t.tenant_id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Declaration ledger anchor job failed:', err);
  }
}

/** Hourly sweep — proof confirmation lags the daily stamp cadence by hours
 *  to days (real Bitcoin block-mining time), independent of the stamp cadence. */
export async function runDeclarationLedgerAnchorConfirmationSweepJob(): Promise<void> {
  try {
    const pending = await db.selectFrom('declaration_ledger_anchors')
      .select(['id', 'tenant_id'])
      .where('status', '=', 'pending')
      .execute();

    for (const anchor of pending) {
      try {
        const updated = await withTenant(anchor.tenant_id, trx => DeclarationAnchorService.checkAnchorConfirmation(trx, anchor.tenant_id, anchor.id));
        if (updated.status === 'confirmed') {
          console.log(`✅ Declaration ledger anchor confirmed: ${anchor.id} (block ${updated.bitcoin_block_height})`);
        }
      } catch (err) {
        console.error(`❌ Declaration ledger anchor confirmation check failed for ${anchor.id}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Declaration ledger anchor confirmation sweep failed:', err);
  }
}
