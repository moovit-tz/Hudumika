import { withTenant } from '../db/client.js';

/**
 * PO <-> Bill matching (M8 of the corporate-tax build-out).
 *
 * Computed live on read, never stored — the same philosophy
 * vat-return.service.ts already uses for its own return figures, because
 * this is a comparison of two other still-editable records (a PO's
 * received_qty can change after a bill exists, and vice versa); a stored
 * status would drift the moment either side is touched.
 *
 * **Warn, don't block, for v1** — matching is compared at the *aggregate*
 * level (bill total vs. PO total, bill quantity vs. received quantity),
 * not line-by-line, since supplier_bill_lines carries no FK back to a
 * specific purchase_order_lines row to pair against; a false per-line
 * match from guessing by description would be worse than an honest
 * aggregate comparison.
 */

export type PoMatchStatus = 'NOT_LINKED' | 'PO_NOT_FOUND' | 'OVER_BILLED_VS_ORDER' | 'BILLED_BEFORE_RECEIPT' | 'AMOUNT_MISMATCH' | 'MATCHED';

export interface PoMatchResult {
  status: PoMatchStatus;
  poId: string | null;
  poNumber: string | null;
  poOrderedQty: number;
  poReceivedQty: number;
  poTotal: number;
  billQty: number;
  billTotal: number;
  message: string;
}

const AMOUNT_TOLERANCE_PCT = 0.02; // 2% — real freight/duty invoices rarely land exactly on a PO's estimated price

export async function computePoMatch(tenantId: string, billId: string): Promise<PoMatchResult> {
  return withTenant(tenantId, async (trx) => {
    const bill = await trx.selectFrom('supplier_bills').selectAll()
      .where('id', '=', billId).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!bill) throw new Error('Bill not found');

    if (!bill.po_id) {
      return {
        status: 'NOT_LINKED' as const, poId: null, poNumber: bill.po_number,
        poOrderedQty: 0, poReceivedQty: 0, poTotal: 0, billQty: 0, billTotal: Number(bill.total),
        message: bill.po_number ? `PO reference "${bill.po_number}" is not linked to a real purchase order.` : 'No purchase order linked to this bill.',
      };
    }

    const po = await trx.selectFrom('purchase_orders').selectAll()
      .where('id', '=', bill.po_id).where('tenant_id', '=', tenantId).executeTakeFirst();
    if (!po) {
      return {
        status: 'PO_NOT_FOUND' as const, poId: bill.po_id, poNumber: bill.po_number,
        poOrderedQty: 0, poReceivedQty: 0, poTotal: 0, billQty: 0, billTotal: Number(bill.total),
        message: 'The linked purchase order no longer exists.',
      };
    }

    const [billLines, poLines] = await Promise.all([
      trx.selectFrom('supplier_bill_lines').select(['qty']).where('bill_id', '=', billId).execute(),
      trx.selectFrom('purchase_order_lines').select(['qty', 'received_qty', 'line_total']).where('po_id', '=', po.id).execute(),
    ]);

    const billQty = billLines.reduce((s, l) => s + Number(l.qty), 0);
    const billTotal = Number(bill.total);
    const poOrderedQty = poLines.reduce((s, l) => s + Number(l.qty), 0);
    const poReceivedQty = poLines.reduce((s, l) => s + Number(l.received_qty), 0);
    const poTotal = poLines.reduce((s, l) => s + Number(l.line_total), 0);

    // A bill often covers only part of a PO's ordered quantity (partial
    // delivery, partial billing) — comparing its total against the *whole*
    // PO's total would flag every legitimate partial bill as a false
    // mismatch. Compare against the PO's own average unit price scaled to
    // what this bill actually covers instead.
    const poUnitPrice = poOrderedQty > 0 ? poTotal / poOrderedQty : 0;
    const expectedBillTotal = billQty * poUnitPrice;

    let status: PoMatchStatus;
    let message: string;
    if (billQty > poOrderedQty + 0.001) {
      status = 'OVER_BILLED_VS_ORDER';
      message = `This bill covers ${billQty} units, more than the ${poOrderedQty} units ever ordered on ${po.po_number}.`;
    } else if (billQty > poReceivedQty + 0.001) {
      status = 'BILLED_BEFORE_RECEIPT';
      message = `This bill covers ${billQty} units, but only ${poReceivedQty} have been marked received on ${po.po_number} so far.`;
    } else if (expectedBillTotal > 0 && Math.abs(billTotal - expectedBillTotal) / expectedBillTotal > AMOUNT_TOLERANCE_PCT) {
      status = 'AMOUNT_MISMATCH';
      message = `Bill total ${billTotal.toLocaleString()} differs from the expected ${expectedBillTotal.toLocaleString()} (${billQty} units at ${po.po_number}'s own unit price) by more than ${(AMOUNT_TOLERANCE_PCT * 100).toFixed(0)}%.`;
    } else {
      status = 'MATCHED';
      message = `Quantity and amount are consistent with ${po.po_number}.`;
    }

    return { status, poId: po.id, poNumber: po.po_number, poOrderedQty, poReceivedQty, poTotal, billQty, billTotal, message };
  });
}
