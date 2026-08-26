import { withTenant } from '../db/client.js';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { taxNBV, taxClassFor, resolveCitRate } from './cit.service.js';

/**
 * Deferred tax — fixed-asset timing differences only.
 *
 * **This is explicitly not the whole deferred-tax picture.** Unrelieved tax
 * loss carryforwards and unpaid-provision timing differences are real
 * sources of deferred tax this module does not compute — a business with
 * variable margins can easily have a loss-carryforward deferred tax asset
 * larger than anything fixed assets produce. Any UI or report built on this
 * must say "Deferred Tax — Fixed Asset Timing Differences Only", never an
 * unqualified "Deferred Tax" line — presenting a partial figure as the
 * complete position would misstate the balance sheet by omission.
 *
 * IAS 12 sign convention: temporary difference = book carrying amount minus
 * tax base (tax NBV), per asset, summed. A positive net difference (book
 * NBV > tax NBV — the normal case here, since Tanzania's reducing-balance
 * tax rates front-load depreciation faster than straight-line book
 * schedules) is a taxable temporary difference → Deferred Tax Liability.
 * A negative net difference is a deductible temporary difference →
 * Deferred Tax Asset.
 */

interface AssetForDeferredTax { id: string; name: string; category: string; cost: number; acquisition_date: string; salvage_value: number; }

async function bookNBV(trx: Transaction<Database>, asset: AssetForDeferredTax, asOfDate: string): Promise<number> {
  const rows = await trx.selectFrom('fixed_asset_depreciation_entries').select('amount')
    .where('asset_id', '=', asset.id).where('period_date', '<=', asOfDate).execute();
  const accumulated = rows.reduce((s, r) => s + Number(r.amount), 0);
  return Math.max(0, asset.cost - asset.salvage_value - accumulated);
}

export interface DeferredTaxLine {
  assetId: string; name: string; taxClass: string; taxNBV: number; bookNBV: number; temporaryDifference: number;
}

export interface DeferredTaxPosition {
  asOfDate: string; ratePct: number; grossTemporaryDifference: number;
  targetDtaBalance: number; targetDtlBalance: number; lines: DeferredTaxLine[];
}

/** The deferred tax *position* (a balance, not a movement) as of one date —
 * what 1250/2450 combined should equal if nothing but fixed-asset timing
 * differences existed. computeAndPostDeferredTax() below turns this into
 * the actual GL movement. */
export async function computeDeferredTaxPosition(tenantId: string, asOfDate: string): Promise<DeferredTaxPosition> {
  return withTenant(tenantId, async (trx) => {
    const assets = await trx.selectFrom('fixed_assets').selectAll()
      .where('tenant_id', '=', tenantId).where('acquisition_date', '<=', asOfDate)
      .where(eb => eb.or([eb('status', '=', 'ACTIVE'), eb('disposed_at', '>=', asOfDate)]))
      .execute();

    const lines: DeferredTaxLine[] = [];
    for (const a of assets) {
      const tNBV = taxNBV(a, asOfDate);
      const bNBV = await bookNBV(trx, a, asOfDate);
      lines.push({
        assetId: a.id, name: a.name, taxClass: taxClassFor(a.category).label,
        taxNBV: tNBV, bookNBV: bNBV, temporaryDifference: bNBV - tNBV,
      });
    }
    const grossTemporaryDifference = lines.reduce((s, l) => s + l.temporaryDifference, 0);
    const { rate_pct: ratePct } = await resolveCitRate(trx, tenantId, asOfDate);

    const value = Math.round(Math.abs(grossTemporaryDifference) * (ratePct / 100) * 100) / 100;
    return {
      asOfDate, ratePct, grossTemporaryDifference,
      targetDtlBalance: grossTemporaryDifference > 0 ? value : 0,
      targetDtaBalance: grossTemporaryDifference < 0 ? value : 0,
      lines,
    };
  });
}

/**
 * Posts the movement needed to bring 1250/2450's *actual current GL
 * balances* to the computed target position, and records the computation.
 * Never posts the target balance itself — a manual correction posted
 * directly to 1250/2450 between runs is respected, not overwritten, because
 * the "prior" figure is read live from the ledger, not from the last
 * computation row.
 */
export async function computeAndPostDeferredTax(tenantId: string, asOfDate: string, actorId: string) {
  const position = await computeDeferredTaxPosition(tenantId, asOfDate);

  const [dtaLedger, dtlLedger] = await Promise.all([
    GLService.ledger(tenantId, '1250', '1900-01-01', asOfDate),
    GLService.ledger(tenantId, '2450', '1900-01-01', asOfDate),
  ]);
  const priorDtaBalance = dtaLedger.closing_balance;
  const priorDtlBalance = dtlLedger.closing_balance;

  const deltaDta = Math.round((position.targetDtaBalance - priorDtaBalance) * 100) / 100;
  const deltaDtl = Math.round((position.targetDtlBalance - priorDtlBalance) * 100) / 100;

  const lines: { accountCode: string; debit: number; credit: number; description: string }[] = [];
  // A liability increase or an asset decrease is tax expense (more future
  // tax to pay, or less future relief available). A liability decrease or
  // an asset increase is the reverse — a credit to (reduction of) expense.
  if (deltaDtl > 0.01) lines.push({ accountCode: '5951', debit: deltaDtl, credit: 0, description: 'Deferred tax liability increase' }, { accountCode: '2450', debit: 0, credit: deltaDtl, description: 'Deferred tax liability increase' });
  else if (deltaDtl < -0.01) lines.push({ accountCode: '2450', debit: -deltaDtl, credit: 0, description: 'Deferred tax liability decrease' }, { accountCode: '5951', debit: 0, credit: -deltaDtl, description: 'Deferred tax liability decrease' });
  if (deltaDta > 0.01) lines.push({ accountCode: '1250', debit: deltaDta, credit: 0, description: 'Deferred tax asset increase' }, { accountCode: '5951', debit: 0, credit: deltaDta, description: 'Deferred tax asset increase' });
  else if (deltaDta < -0.01) lines.push({ accountCode: '5951', debit: -deltaDta, credit: 0, description: 'Deferred tax asset decrease' }, { accountCode: '1250', debit: 0, credit: -deltaDta, description: 'Deferred tax asset decrease' });

  let journalEntryId: string | null = null;
  if (lines.length > 0) {
    journalEntryId = await GLService.post(tenantId, {
      entryDate: asOfDate,
      description: `Deferred tax movement (fixed-asset timing differences) as of ${asOfDate}`,
      sourceModule: 'MANUAL', createdBy: actorId,
      lines,
    });
  }

  const row = await withTenant(tenantId, (trx) =>
    trx.insertInto('deferred_tax_computations').values({
      tenant_id: tenantId, as_of_date: asOfDate, rate_pct: String(position.ratePct),
      gross_temporary_difference: String(position.grossTemporaryDifference),
      target_dta_balance: String(position.targetDtaBalance),
      target_dtl_balance: String(position.targetDtlBalance),
      prior_dta_balance: String(priorDtaBalance),
      prior_dtl_balance: String(priorDtlBalance),
      journal_entry_id: journalEntryId,
      computed_by: actorId,
    }).onConflict((oc) => oc.columns(['tenant_id', 'as_of_date']).doUpdateSet({
      rate_pct: String(position.ratePct),
      gross_temporary_difference: String(position.grossTemporaryDifference),
      target_dta_balance: String(position.targetDtaBalance),
      target_dtl_balance: String(position.targetDtlBalance),
      prior_dta_balance: String(priorDtaBalance),
      prior_dtl_balance: String(priorDtlBalance),
      // A same-date recompute with no movement posts no new entry
      // (journalEntryId is null) — COALESCE keeps whichever run's entry
      // already exists rather than nulling out a prior real posting.
      journal_entry_id: sql`COALESCE(${journalEntryId}, deferred_tax_computations.journal_entry_id)`,
      computed_by: actorId,
      computed_at: new Date(),
    })).returningAll().executeTakeFirstOrThrow()
  );

  return { ...row, lines: position.lines, deltaDta, deltaDtl };
}
