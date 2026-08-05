import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

// Bonded storage/handling fee billing (FinOps link) — the original spec
// deliberately deferred "no billing" from Increment 1; this is that gap
// closed. Same reproducibility discipline as the duty engine: every
// invoice traces to a stored day count and a stored rate, and a lot's
// storage_billed_through watermark means re-running this after an invoice
// exists only bills the days that haven't been billed yet — never a
// silent double-charge.

export interface StorageAccrualResult {
  lotId: string;
  fromDate: string;
  toDate: string;
  days: number;
  billingMethod: 'flat_per_lot' | 'per_cbm';
  storageFeePerDay: number;
  volumeCbm: number | null;
  storageFeeCurrency: string;
  storageAmount: number;
  handlingFeeFlat: number;
  includesHandling: boolean;
  totalAmount: number;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class LotHasNoVolume extends Error {
  constructor() {
    super('This compartment bills storage per CBM, but this lot has no recorded volume — record its volume or switch the compartment to flat per-lot billing.');
    this.name = 'LotHasNoVolume';
  }
}

export function computeStorageAccrual(input: {
  lotId: string;
  warehousedOn: Date;
  billedThrough: Date | null;
  asOfDate: Date;
  billingMethod: 'flat_per_lot' | 'per_cbm';
  storageFeePerDay: number;
  storageFeePerCbmPerDay: number;
  volumeCbm: number | null;
  storageFeeCurrency: string;
  handlingFeeFlat: number;
}): StorageAccrualResult {
  const fromDate = input.billedThrough
    ? new Date(input.billedThrough.getTime() + 86400000)
    : input.warehousedOn;
  const days = Math.max(0, Math.floor((input.asOfDate.getTime() - fromDate.getTime()) / 86400000) + 1);

  let storageFeePerDay = input.storageFeePerDay;
  if (input.billingMethod === 'per_cbm') {
    if (input.volumeCbm == null) throw new LotHasNoVolume();
    storageFeePerDay = Math.round(input.volumeCbm * input.storageFeePerCbmPerDay * 10000) / 10000;
  }
  const storageAmount = Math.round(days * storageFeePerDay * 100) / 100;
  const includesHandling = input.billedThrough === null; // handling fee is one-time, only on the first invoice
  const handlingFeeFlat = includesHandling ? input.handlingFeeFlat : 0;

  return {
    lotId: input.lotId,
    fromDate: dateOnly(fromDate),
    toDate: dateOnly(input.asOfDate),
    days,
    billingMethod: input.billingMethod,
    storageFeePerDay,
    volumeCbm: input.volumeCbm,
    storageFeeCurrency: input.storageFeeCurrency,
    storageAmount,
    handlingFeeFlat,
    includesHandling,
    totalAmount: Math.round((storageAmount + handlingFeeFlat) * 100) / 100,
  };
}

export class NothingToBill extends Error {
  constructor() {
    super('This lot has already been billed through today — nothing new has accrued.');
    this.name = 'NothingToBill';
  }
}

export class SealBillingService {
  static async previewAccrual(trx: Transaction<Database>, lotId: string, asOfDate?: Date) {
    const lot = await trx.selectFrom('seal_lots')
      .innerJoin('seal_compartments', 'seal_compartments.id', 'seal_lots.compartment_id')
      .select([
        'seal_lots.id', 'seal_lots.warehoused_on', 'seal_lots.storage_billed_through', 'seal_lots.volume_cbm',
        'seal_compartments.storage_fee_per_day', 'seal_compartments.storage_fee_currency', 'seal_compartments.handling_fee_flat',
        'seal_compartments.storage_fee_per_cbm_per_day', 'seal_compartments.billing_method',
      ])
      .where('seal_lots.id', '=', lotId)
      .executeTakeFirstOrThrow();

    return computeStorageAccrual({
      lotId: lot.id,
      // Both are DATE columns, so they arrive as 'YYYY-MM-DD' strings; the
      // accrual calculator works in Dates.
      warehousedOn: lot.warehoused_on ? new Date(lot.warehoused_on) : new Date(),
      billedThrough: lot.storage_billed_through ? new Date(lot.storage_billed_through) : null,
      asOfDate: asOfDate ?? new Date(),
      billingMethod: lot.billing_method as 'flat_per_lot' | 'per_cbm',
      storageFeePerDay: Number(lot.storage_fee_per_day),
      storageFeePerCbmPerDay: Number(lot.storage_fee_per_cbm_per_day),
      volumeCbm: lot.volume_cbm != null ? Number(lot.volume_cbm) : null,
      storageFeeCurrency: lot.storage_fee_currency,
      handlingFeeFlat: Number(lot.handling_fee_flat),
    });
  }

  /** Creates a DRAFT sales invoice for the accrued storage/handling fees and
   *  advances the lot's storage_billed_through watermark. Left as DRAFT
   *  deliberately — invoice finalization (GL posting, accounting sync) stays
   *  entirely inside FinOps's own POST /v1/invoices flow, not duplicated
   *  here, so there's exactly one place that logic lives. */
  static async generateStorageInvoice(trx: Transaction<Database>, tenantId: string, actorId: string | null, lotId: string) {
    const lot = await trx.selectFrom('seal_lots').selectAll().where('id', '=', lotId).executeTakeFirstOrThrow();
    const accrual = await SealBillingService.previewAccrual(trx, lotId);
    if (accrual.days <= 0 || accrual.totalAmount <= 0) throw new NothingToBill();

    const invoice = await trx.insertInto('sales_invoices').values({
      tenant_id: tenantId,
      invoice_number: `SEAL-STG-${Date.now()}`,
      shipment_ref: lot.entry_reference ?? lot.id,
      customer_id: lot.owner_id,
      client_name: null,
      client_address: '[]',
      bl_number: null,
      origin: null,
      destination: null,
      bill_date: new Date(),
      due_date: null,
      sale_agent: null,
      payment_terms: null,
      status: 'Draft',
      received: 0,
      version: 1,
      ref_code: null,
      notes: `Bonded storage fee — lot ${lot.description} (${accrual.fromDate} to ${accrual.toDate}, ${accrual.days} day(s)).`,
      created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();

    const lines = [{
      invoice_id: invoice.id,
      name: accrual.billingMethod === 'per_cbm'
        ? `Bonded Storage — ${lot.description} (${accrual.volumeCbm} CBM, ${accrual.days}d @ ${accrual.storageFeePerDay}/day effective)`
        : `Bonded Storage — ${lot.description} (${accrual.days}d @ ${accrual.storageFeePerDay}/day)`,
      unit: 'PER DAY',
      rate: accrual.storageFeePerDay,
      qty: accrual.days,
      line_group: 'other',
      currency: accrual.storageFeeCurrency,
      sort_order: 0,
    }];
    if (accrual.includesHandling && accrual.handlingFeeFlat > 0) {
      lines.push({
        invoice_id: invoice.id, name: `Warehousing Handling Fee — ${lot.description}`,
        unit: 'FLAT', rate: accrual.handlingFeeFlat, qty: 1, line_group: 'other',
        currency: accrual.storageFeeCurrency, sort_order: 1,
      });
    }
    await trx.insertInto('sales_invoice_lines').values(lines).execute();

    await trx.updateTable('seal_lots').set({ storage_billed_through: new Date(accrual.toDate), updated_at: new Date() })
      .where('id', '=', lotId).execute();

    return { invoice, accrual };
  }
}
