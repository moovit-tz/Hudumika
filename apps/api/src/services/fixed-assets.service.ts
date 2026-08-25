import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { GLService } from './gl.service.js';

const DEPRECIATION_EXPENSE_ACCOUNT = '5111';
const ACCUMULATED_DEPRECIATION_ACCOUNT = '1503';

/** Straight-line only for v1 — (cost - salvage) spread evenly over the
 *  useful life in months. */
function monthlyDepreciation(cost: number, salvage: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return Math.round(((cost - salvage) / usefulLifeMonths) * 100) / 100;
}

async function accumulatedDepreciation(trx: Transaction<Database>, assetId: string): Promise<number> {
  const rows = await trx.selectFrom('fixed_asset_depreciation_entries').select('amount').where('asset_id', '=', assetId).execute();
  return rows.reduce((s, r) => s + Number(r.amount), 0);
}

/**
 * Posts one month of depreciation for every ACTIVE asset that hasn't
 * already had this period posted (UNIQUE(asset_id, period_date) is the
 * idempotency key — same shape as cost-posting.service.ts's own
 * (source_module, source_id) check on journal_entries). Depreciation
 * never posts past (cost - salvage_value): a fully depreciated asset is
 * simply skipped from then on, not over-depreciated.
 */
export async function runDepreciationForTenant(tenantId: string, periodDate = new Date().toISOString().slice(0, 8) + '01'): Promise<{ posted: number; skipped: number }> {
  return withTenant(tenantId, async (trx) => {
    const assets = await trx.selectFrom('fixed_assets').selectAll()
      .where('tenant_id', '=', tenantId).where('status', '=', 'ACTIVE').execute();

    let posted = 0, skipped = 0;
    for (const asset of assets) {
      const already = await trx.selectFrom('fixed_asset_depreciation_entries').select('id')
        .where('asset_id', '=', asset.id).where('period_date', '=', periodDate).executeTakeFirst();
      if (already) { skipped++; continue; }

      const depreciableBase = Number(asset.cost) - Number(asset.salvage_value);
      const accumulated = await accumulatedDepreciation(trx, asset.id);
      const remaining = depreciableBase - accumulated;
      if (remaining <= 0) { skipped++; continue; }

      const amount = Math.min(monthlyDepreciation(Number(asset.cost), Number(asset.salvage_value), asset.useful_life_months), remaining);
      if (amount <= 0) { skipped++; continue; }

      const entryId = await GLService.post(tenantId, {
        entryDate: periodDate,
        description: `Depreciation: ${asset.name}`,
        reference: asset.id,
        sourceModule: 'MANUAL',
        sourceId: asset.id,
        lines: [
          { accountCode: DEPRECIATION_EXPENSE_ACCOUNT, debit: amount, credit: 0, description: asset.name },
          { accountCode: ACCUMULATED_DEPRECIATION_ACCOUNT, debit: 0, credit: amount, description: asset.name },
        ],
      });

      await trx.insertInto('fixed_asset_depreciation_entries').values({
        tenant_id: tenantId, asset_id: asset.id, period_date: periodDate, amount, journal_entry_id: entryId,
      }).execute();
      posted++;
    }
    return { posted, skipped };
  });
}

/** Writes off an asset's remaining net book value against real disposal
 *  proceeds — a genuine gain/loss on disposal, not just a status flip. */
export async function disposeFixedAsset(tenantId: string, assetId: string, disposedAt: string, proceeds: number): Promise<void> {
  return withTenant(tenantId, async (trx) => {
    const asset = await trx.selectFrom('fixed_assets').selectAll().where('id', '=', assetId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!asset) throw new Error('Fixed asset not found');
    if (asset.status === 'DISPOSED') throw new Error('This asset has already been disposed.');

    const accumulated = await accumulatedDepreciation(trx, assetId);
    const netBookValue = Number(asset.cost) - accumulated;
    const gainLoss = proceeds - netBookValue;

    const lines = [
      { accountCode: ACCUMULATED_DEPRECIATION_ACCOUNT, debit: accumulated, credit: 0, description: `Disposal: ${asset.name}` },
      { accountCode: '1010', debit: proceeds, credit: 0, description: `Disposal proceeds: ${asset.name}` },
      { accountCode: asset.asset_account_code, debit: 0, credit: Number(asset.cost), description: `Disposal: ${asset.name}` },
      ...(gainLoss > 0
        ? [{ accountCode: '4500', debit: 0, credit: gainLoss, description: `Gain on disposal: ${asset.name}` }]
        : gainLoss < 0
          ? [{ accountCode: '5900', debit: -gainLoss, credit: 0, description: `Loss on disposal: ${asset.name}` }]
          : []),
    ];

    await GLService.post(tenantId, {
      entryDate: disposedAt,
      description: `Asset disposal: ${asset.name}`,
      // source_id is UUID-typed — can't suffix it to distinguish this from
      // the asset's own depreciation entries (which also key off asset.id).
      // They share the key; nothing currently calls reverseBySource() for
      // fixed assets, so this isn't live-harmful, but a real "undo a
      // disposal" feature would need to disambiguate first.
      reference: `${asset.id} (disposal)`,
      sourceModule: 'MANUAL',
      sourceId: asset.id,
      lines,
    });

    await trx.updateTable('fixed_assets').set({
      status: 'DISPOSED', disposed_at: disposedAt, disposal_proceeds: proceeds, updated_at: new Date(),
    }).where('id', '=', assetId).execute();
  });
}
