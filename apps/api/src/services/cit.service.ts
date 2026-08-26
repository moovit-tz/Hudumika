import { withTenant, type Database, type CitReturnsTable } from '../db/client.js';
import type { Transaction, Selectable } from 'kysely';
import { GLService } from './gl.service.js';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Fixed-asset category -> Tanzania Income Tax Act (Third Schedule) capital
 * allowance class. Real, sourced rates (PwC Worldwide Tax Summaries,
 * "Tanzania - Corporate - Deductions", checked 2026-08-25) — reducing
 * balance for classes 1-3, which is why this is a genuinely different
 * number from the book depreciation fixed-assets.service.ts posts
 * (straight-line only, per that file's own v1 scope).
 *
 * This platform's fixed_assets.category is 6 free-text values with no
 * concept of "buildings" — Class 5/6 (buildings, straight-line 5%/20%) has
 * nothing to map to and is not modeled here. A tenant with real buildings
 * on its asset register will get an inaccurate Class 3 catch-all figure for
 * them; this is a real, disclosed v1 limitation of the category list, not
 * an oversight in this file.
 */
const TAX_CLASS: Record<string, { code: string; label: string; rate: number }> = {
  IT_EQUIPMENT:     { code: '1', label: 'Class 1 — computers & data handling equipment', rate: 0.375 },
  MOTOR_VEHICLE:     { code: '1', label: 'Class 1 — automobiles/buses/minibuses under 30 seats', rate: 0.375 },
  MACHINERY:         { code: '3', label: 'Class 3 — any asset not in another class', rate: 0.125 },
  OFFICE_EQUIPMENT:  { code: '3', label: 'Class 3 — office furniture, fixtures & equipment', rate: 0.125 },
  FURNITURE:         { code: '3', label: 'Class 3 — office furniture, fixtures & equipment', rate: 0.125 },
  OTHER:             { code: '3', label: 'Class 3 — any asset not in another class', rate: 0.125 },
};

export function taxClassFor(category: string) {
  return TAX_CLASS[category] ?? TAX_CLASS.OTHER;
}

/**
 * Tax written-down value of one asset as of a date, via a per-asset
 * reducing-balance approximation of its class rate.
 *
 * The Income Tax Act actually pools assets by class across the whole
 * business rather than depreciating each one individually — a faithful
 * implementation would need class-level pooling with additions/disposals
 * tracked per pool. This computes each asset's own reducing-balance WDV
 * instead, which is close enough for a single asset bought outright and
 * held (the common case here) but will drift from the real pooled figure
 * once a class has multiple assets acquired at different times. Disclosed
 * simplification, not silently assumed exact — matches this program's
 * "state assumptions" discipline (see the deferred-tax scope note, M3).
 */
export function taxNBV(asset: { cost: number; acquisition_date: string; category: string }, asOfDate: string): number {
  const acquired = new Date(asset.acquisition_date).getTime();
  const asOf = new Date(asOfDate).getTime();
  if (asOf <= acquired) return asset.cost;
  const wholeYears = Math.floor((asOf - acquired) / MS_PER_YEAR);
  const { rate } = taxClassFor(asset.category);
  return asset.cost * Math.pow(1 - rate, wholeYears);
}

export interface TaxDepreciationLine {
  assetId: string; name: string; category: string; taxClass: string;
  nbvStart: number; nbvEnd: number; depreciation: number;
}

/** Tax depreciation for every active (or disposed-during-period) fixed
 * asset, for the given period — built once here, reused by M3's deferred
 * tax (temporary difference = this NBV minus the book NBV). */
export async function computeTaxDepreciation(
  trx: Transaction<Database>, tenantId: string, periodStart: string, periodEnd: string,
): Promise<{ total: number; lines: TaxDepreciationLine[] }> {
  const assets = await trx.selectFrom('fixed_assets').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('acquisition_date', '<=', periodEnd)
    .where(eb => eb.or([eb('status', '=', 'ACTIVE'), eb('disposed_at', '>=', periodStart)]))
    .execute();

  const lines: TaxDepreciationLine[] = assets.map(a => {
    const cls = taxClassFor(a.category);
    const nbvStart = taxNBV(a, periodStart);
    const nbvEnd = taxNBV(a, periodEnd);
    return {
      assetId: a.id, name: a.name, category: a.category, taxClass: cls.label,
      nbvStart, nbvEnd, depreciation: Math.max(0, nbvStart - nbvEnd),
    };
  });
  return { total: lines.reduce((s, l) => s + l.depreciation, 0), lines };
}

/** The rate that applies to a tenant for a given date — its own configured
 * cit_rates row if one is effective, else the STANDARD reference default
 * (flagged, never silently assumed). Exported for deferred-tax.service.ts,
 * which needs the same "current rate" to value a temporary difference. */
export async function resolveCitRate(trx: Transaction<Database>, tenantId: string, asOfDate: string) {
  const tenantRate = await trx.selectFrom('cit_rates').selectAll()
    .where('tenant_id', '=', tenantId).where('jurisdiction', '=', 'TZ')
    .where('effective_from', '<=', asOfDate)
    .where(eb => eb.or([eb('effective_to', 'is', null), eb('effective_to', '>=', asOfDate)]))
    .orderBy('effective_from', 'desc').executeTakeFirst();
  if (tenantRate) return { category: tenantRate.category, rate_pct: Number(tenantRate.rate_pct), source: 'TENANT' as const };

  const ref = await trx.selectFrom('cit_rate_reference').selectAll()
    .where('jurisdiction', '=', 'TZ').where('category', '=', 'STANDARD').executeTakeFirst();
  if (!ref) throw new Error('No CIT rate is configured and the reference default is missing.');
  return { category: ref.category, rate_pct: Number(ref.rate_pct), source: 'REFERENCE_DEFAULT' as const };
}

/**
 * Whether this period should use the 1% turnover-based alternative minimum
 * tax instead of the normal rate — Tanzania applies this to companies in
 * "perpetual" loss, defined as three consecutive years of tax losses. Real
 * cit_returns history is what makes this checkable at all; a tenant's first
 * three returns can never trigger it, which is correct (there is no history
 * yet to be perpetual against).
 */
async function isPerpetualLoss(trx: Transaction<Database>, tenantId: string, periodStart: string): Promise<boolean> {
  const priorReturns = await trx.selectFrom('cit_returns').select(['taxable_income', 'period_end'])
    .where('tenant_id', '=', tenantId).where('period_end', '<', periodStart)
    .orderBy('period_end', 'desc').limit(2).execute();
  if (priorReturns.length < 2) return false;
  return priorReturns.every(r => Number(r.taxable_income) <= 0);
}

export interface CitComputation {
  accountingProfit: number; bookDepreciation: number; taxDepreciation: number; adjustmentsTotal: number;
  taxableIncome: number; rateCategory: string; ratePct: number; rateSource: 'TENANT' | 'REFERENCE_DEFAULT';
  isAmt: boolean; turnover: number | null; taxLiability: number; depreciationLines: TaxDepreciationLine[];
}

/** The full CIT computation for one period. Read-only — the caller decides
 * whether to persist it as a DRAFT cit_returns row. */
export async function computeCitReturn(tenantId: string, periodStart: string, periodEnd: string): Promise<CitComputation> {
  const pl = await GLService.profitLoss(tenantId, periodStart, periodEnd);
  const accountingProfit = pl.totals.net;

  return withTenant(tenantId, async (trx) => {
    const bookDepRows = await trx.selectFrom('fixed_asset_depreciation_entries').select('amount')
      .where('tenant_id', '=', tenantId).where('period_date', '>=', periodStart).where('period_date', '<=', periodEnd).execute();
    const bookDepreciation = bookDepRows.reduce((s, r) => s + Number(r.amount), 0);

    const { total: taxDepreciation, lines: depreciationLines } = await computeTaxDepreciation(trx, tenantId, periodStart, periodEnd);

    const adjRows = await trx.selectFrom('cit_adjustments').select('amount')
      .where('tenant_id', '=', tenantId).where('period_start', '=', periodStart).where('period_end', '=', periodEnd).execute();
    const adjustmentsTotal = adjRows.reduce((s, r) => s + Number(r.amount), 0);

    // Book depreciation is added back (the book already deducted it, tax
    // does not allow that deduction); tax depreciation is deducted instead.
    const taxableIncome = accountingProfit + bookDepreciation - taxDepreciation + adjustmentsTotal;

    const perpetualLoss = await isPerpetualLoss(trx, tenantId, periodStart);
    let rateCategory: string, ratePct: number, rateSource: 'TENANT' | 'REFERENCE_DEFAULT', isAmt: boolean, turnover: number | null = null, taxLiability: number;

    if (perpetualLoss) {
      const amtRef = await trx.selectFrom('cit_rate_reference').selectAll()
        .where('jurisdiction', '=', 'TZ').where('category', '=', 'AMT_TURNOVER_BASED').executeTakeFirst();
      if (!amtRef) throw new Error('AMT reference rate is missing.');
      rateCategory = amtRef.category; ratePct = Number(amtRef.rate_pct); rateSource = 'REFERENCE_DEFAULT'; isAmt = true;
      turnover = pl.totals.revenue;
      taxLiability = Math.round(turnover * (ratePct / 100) * 100) / 100;
    } else {
      const resolved = await resolveCitRate(trx, tenantId, periodEnd);
      rateCategory = resolved.category; ratePct = resolved.rate_pct; rateSource = resolved.source; isAmt = false;
      taxLiability = Math.round(Math.max(0, taxableIncome) * (ratePct / 100) * 100) / 100;
    }

    return {
      accountingProfit, bookDepreciation, taxDepreciation, adjustmentsTotal, taxableIncome,
      rateCategory, ratePct, rateSource, isAmt, turnover, taxLiability, depreciationLines,
    };
  });
}

/**
 * Runs computeCitReturn and stores it as a DRAFT cit_returns row (inserting
 * or overwriting an existing DRAFT for the same period — never an ACCRUED
 * one, which the caller must check for first). Shared by the direct
 * "compute" route action and gl-periods.routes.ts's year-end-close
 * auto-compute path, so both persist a return in exactly the same shape.
 */
export async function computeAndSaveDraftCitReturn(
  tenantId: string, periodStart: string, periodEnd: string, actorId: string,
): Promise<Selectable<CitReturnsTable> & { depreciation_lines: TaxDepreciationLine[] }> {
  const computation = await computeCitReturn(tenantId, periodStart, periodEnd);
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('cit_returns').select('id')
      .where('tenant_id', '=', tenantId).where('period_start', '=', periodStart).where('period_end', '=', periodEnd).executeTakeFirst();
    const values = {
      tenant_id: tenantId, period_start: periodStart, period_end: periodEnd,
      accounting_profit: String(computation.accountingProfit),
      book_depreciation: String(computation.bookDepreciation),
      tax_depreciation: String(computation.taxDepreciation),
      adjustments_total: String(computation.adjustmentsTotal),
      taxable_income: String(computation.taxableIncome),
      rate_category: computation.rateCategory,
      rate_pct: String(computation.ratePct),
      rate_source: computation.rateSource,
      is_amt: computation.isAmt,
      turnover: computation.turnover !== null ? String(computation.turnover) : null,
      tax_liability: String(computation.taxLiability),
      status: 'DRAFT' as const,
      computed_by: actorId,
      computed_at: new Date(),
    };
    const row = existing
      ? await trx.updateTable('cit_returns').set(values).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
      : await trx.insertInto('cit_returns').values(values).returningAll().executeTakeFirstOrThrow();
    return { ...row, depreciation_lines: computation.depreciationLines };
  });
}

/**
 * Posts the Dr 5950 / Cr 2400 accrual for an already-computed return and
 * locks it ACCRUED. Idempotent — a return that's already ACCRUED is left
 * untouched, so gl-periods.routes.ts's year-end close can call this
 * unconditionally without its own already-accrued branch. A nil/zero
 * liability (a loss period) still locks the return; there is nothing to
 * post.
 */
export async function accrueCitReturn(tenantId: string, citReturnId: string, actorId: string): Promise<void> {
  const ret = await withTenant(tenantId, (trx) =>
    trx.selectFrom('cit_returns').selectAll().where('id', '=', citReturnId).where('tenant_id', '=', tenantId).executeTakeFirst()
  );
  if (!ret) throw new Error('CIT return not found');
  if (ret.status === 'ACCRUED') return;

  const liability = Number(ret.tax_liability);
  let journalEntryId: string | null = null;
  if (liability > 0.01) {
    journalEntryId = await GLService.post(tenantId, {
      entryDate: ret.period_end,
      description: `Income tax accrual: ${ret.period_start} to ${ret.period_end}`,
      reference: `CIT-${ret.id.slice(0, 8).toUpperCase()}`,
      sourceModule: 'MANUAL', sourceId: ret.id, createdBy: actorId,
      lines: [
        { accountCode: '5950', debit: liability, credit: 0, description: 'Income tax expense' },
        { accountCode: '2400', debit: 0, credit: liability, description: 'Income tax payable' },
      ],
    });
  }
  await withTenant(tenantId, (trx) =>
    trx.updateTable('cit_returns').set({ status: 'ACCRUED', journal_entry_id: journalEntryId, accrued_at: new Date() }).where('id', '=', citReturnId).execute()
  );
}
