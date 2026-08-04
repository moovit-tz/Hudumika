import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

// Periodic stock-account submission (spec, deferred from Increment 3) — the
// recurring compliance report a bonded operator files with customs: opening
// balance, receipts, releases, adjustments, and closing balance per lot for
// a compartment over a period. Reconstructed entirely from the append-only
// seal_movements ledger, never hand-entered — same "never a bare total"
// principle the duty engine follows (spec §5.7).
//
// Known simplification: duty_at_risk/tax_at_risk are taken from the lot's
// *current* value, not reconstructed historically. seal_movements has
// duty_delta/tax_delta columns for exactly this purpose, but nothing in the
// codebase populates them yet (confirmed: no writer exists) — reconstructing
// a true historical duty-at-risk time series is future work, not silently
// faked here.

export class StockAccountPeriodExists extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockAccountPeriodExists';
  }
}

interface LotMovement {
  qty_delta: string;
  movement_type: string;
  occurred_at: Date;
  to_customs_status: string | null;
}

function sumDeltas(movements: LotMovement[]): number {
  return movements.reduce((s, m) => s + Number(m.qty_delta), 0);
}

export class SealStockAccountService {
  static async generatePeriod(trx: Transaction<Database>, tenantId: string, actorId: string | null, input: {
    compartmentId: string; periodStart: string; periodEnd: string;
  }) {
    const periodStart = new Date(input.periodStart);
    const periodEndExclusive = new Date(new Date(input.periodEnd).getTime() + 86400000); // end-of-day boundary

    const existing = await trx.selectFrom('seal_stock_account_periods').select('id')
      .where('compartment_id', '=', input.compartmentId)
      .where('period_start', '=', toDateParam(periodStart))
      .where('period_end', '=', toDateParam(new Date(input.periodEnd)))
      .executeTakeFirst();
    if (existing) throw new StockAccountPeriodExists('A stock-account period already exists for this exact date range in this compartment.');

    const lots = await trx.selectFrom('seal_lots')
      .select(['id', 'customs_status', 'duty_at_risk', 'tax_at_risk', 'created_at'])
      .where('compartment_id', '=', input.compartmentId)
      .where('created_at', '<', periodEndExclusive)
      .execute();

    const period = await trx.insertInto('seal_stock_account_periods').values({
      tenant_id: tenantId, compartment_id: input.compartmentId,
      period_start: periodStart, period_end: new Date(input.periodEnd),
      generated_at: new Date(), created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();

    let openingLotCount = 0, closingLotCount = 0, totalDutyAtRisk = 0, totalTaxAtRisk = 0;

    for (const lot of lots) {
      const movements = await trx.selectFrom('seal_movements')
        .select(['qty_delta', 'movement_type', 'occurred_at', 'to_customs_status'])
        .where('lot_id', '=', lot.id)
        .where('occurred_at', '<', periodEndExclusive)
        .orderBy('occurred_at', 'asc')
        .execute();

      const before = movements.filter(m => m.occurred_at < periodStart);
      const within = movements.filter(m => m.occurred_at >= periodStart);

      const openingQty = sumDeltas(before);
      const nonAdjustWithin = within.filter(m => m.movement_type !== 'adjust');
      const adjustWithin = within.filter(m => m.movement_type === 'adjust');
      const receivedQty = nonAdjustWithin.filter(m => Number(m.qty_delta) > 0).reduce((s, m) => s + Number(m.qty_delta), 0);
      const releasedQty = nonAdjustWithin.filter(m => Number(m.qty_delta) < 0).reduce((s, m) => s + Math.abs(Number(m.qty_delta)), 0);
      const adjustedQty = sumDeltas(adjustWithin);
      const closingQty = openingQty + receivedQty - releasedQty + adjustedQty;

      const lastStatusChange = [...movements].reverse().find(m => m.to_customs_status);
      const closingStatus = lastStatusChange?.to_customs_status ?? lot.customs_status;

      if (openingQty === 0 && closingQty === 0 && receivedQty === 0 && releasedQty === 0 && adjustedQty === 0) continue;

      if (openingQty > 0) openingLotCount++;
      if (closingQty > 0) {
        closingLotCount++;
        totalDutyAtRisk += Number(lot.duty_at_risk);
        totalTaxAtRisk += Number(lot.tax_at_risk);
      }

      await trx.insertInto('seal_stock_account_lines').values({
        tenant_id: tenantId, period_id: period.id, lot_id: lot.id,
        opening_qty: String(openingQty), received_qty: String(receivedQty),
        released_qty: String(releasedQty), adjusted_qty: String(adjustedQty),
        closing_qty: String(closingQty), closing_customs_status: closingStatus,
        duty_at_risk: closingQty > 0 ? lot.duty_at_risk : '0',
        tax_at_risk: closingQty > 0 ? lot.tax_at_risk : '0',
      }).execute();
    }

    return trx.updateTable('seal_stock_account_periods').set({
      opening_lot_count: openingLotCount, closing_lot_count: closingLotCount,
      total_duty_at_risk: String(totalDutyAtRisk), total_tax_at_risk: String(totalTaxAtRisk),
    }).where('id', '=', period.id).returningAll().executeTakeFirstOrThrow();
  }

  static async submit(trx: Transaction<Database>, periodId: string, submissionReference: string) {
    const period = await trx.selectFrom('seal_stock_account_periods').selectAll().where('id', '=', periodId).executeTakeFirstOrThrow();
    if (period.status !== 'DRAFT') throw new Error(`Only a DRAFT stock-account period can be submitted (this one is ${period.status}).`);
    return trx.updateTable('seal_stock_account_periods').set({
      status: 'SUBMITTED', submission_reference: submissionReference, submitted_at: new Date(),
    }).where('id', '=', periodId).returningAll().executeTakeFirstOrThrow();
  }
}
