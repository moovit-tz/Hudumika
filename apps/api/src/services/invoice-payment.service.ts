import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { emitDomainEvent, type DomainEvent } from './domain-events.service.js';
import { enqueueAccountingSync } from './accounting-outbox.service.js';
import { invoiceGrandTotal } from './invoice-totals.js';

export interface RecordInvoicePaymentInput {
  amount: number;
  method?: string | null;
  paymentDate?: string | null;
  note?: string | null;
  requestKey?: string | null;
  actorId: string | null;
  actorName?: string | null;
}

export type RecordInvoicePaymentResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_payable' }
  | { outcome: 'request_key_conflict' }
  | { outcome: 'recent_duplicate' }
  | { outcome: 'replayed'; received: number; status: string; paymentId?: string }
  | { outcome: 'recorded'; received: number; status: string; credit_issued: number; paymentId: string; event?: DomainEvent };

/**
 * The single place an invoice payment actually gets written — amount,
 * overpayment-to-credit split, status transition, GL post, activity log,
 * accounting-sync enqueue. Factored out of POST /:id/payment (its original
 * and still only interactive caller) so the gateway-checkout webhook below
 * can call the exact same, already-proven logic rather than a second
 * hand-rolled copy that could drift from it — this code moves real money
 * and determines invoice status, so there is exactly one implementation of
 * it, not two that have to be kept in sync by hand.
 *
 * Idempotency is the caller's contract to honor via `requestKey` (an
 * Idempotency-Key header for the interactive route, a gateway's own
 * tx_ref/transaction id for the webhook route) — this function itself does
 * not know or care which.
 */
export async function recordInvoicePayment(
  trx: Transaction<Database>, tenantId: string, invoiceId: string, input: RecordInvoicePaymentInput,
): Promise<RecordInvoicePaymentResult> {
  const { amount, method, paymentDate, note, requestKey, actorId, actorName } = input;
  const inv = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoiceId).where('tenant_id', '=', tenantId).forUpdate().executeTakeFirst();
  if (!inv) return { outcome: 'not_found' };
  if (!['Unpaid', 'Partial', 'Paid', 'Overdue'].includes(inv.status)) return { outcome: 'not_payable' };

  if (requestKey) {
    const prior = await trx.selectFrom('invoice_payments').select(['id', 'amount', 'method', 'payment_date', 'note']).where('tenant_id', '=', tenantId).where('invoice_id', '=', invoiceId).where('request_key', '=', requestKey).executeTakeFirst();
    if (prior) {
      if (Number(prior.amount) !== amount || (prior.method || '') !== (method || '') || (prior.note || '') !== (note || '') || (prior.payment_date ? new Date(prior.payment_date as any).toISOString().slice(0, 10) : null) !== (paymentDate || null)) {
        return { outcome: 'request_key_conflict' };
      }
      return { outcome: 'replayed', received: Number(inv.received), status: inv.status, paymentId: prior.id };
    }
  } else {
    const recentDup = await trx.selectFrom('invoice_payments')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('invoice_id', '=', invoiceId)
      .where('amount', '=', Number(amount))
      .where('created_at', '>', sql<Date>`now() - interval '60 seconds'`)
      .executeTakeFirst();
    if (recentDup) return { outcome: 'recent_duplicate' };
  }

  const payment = await trx.insertInto('invoice_payments').values({
    request_key: requestKey ?? null,
    tenant_id: tenantId,
    invoice_id: invoiceId,
    amount: Number(amount),
    method: method || null,
    payment_date: paymentDate || null,
    note: note || null,
    created_by: actorId,
  }).returning('id').executeTakeFirstOrThrow();

  // Money received against an invoice — the closing leg of a consignment's
  // journey, and the trigger downstream apps care about.
  const event = await emitDomainEvent(trx, tenantId, {
    type: 'invoice.payment_recorded', sourceApp: 'finops', entityType: 'invoice', entityId: invoiceId,
    payload: { amount: Number(amount), method: method || null, customerId: (inv as any).customer_id ?? null },
  }, { deferDispatch: true });

  const payments = await trx.selectFrom('invoice_payments').select('amount').where('invoice_id', '=', invoiceId).where('tenant_id', '=', tenantId).execute();
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoiceId).execute();
  // The old fallback here was `|| 2650` - a hardcoded TZS/USD rate invented
  // at the point of use. 1 is the only honest default: it means "no
  // conversion", not "guess".
  const grandTotal = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);

  // An overpayment used to just vanish into "Paid" — the excess was never
  // tracked anywhere, so it disappeared from both the balance sheet and the
  // customer's own running balance (M10). The amount that actually clears
  // *this* invoice's AR is capped at what was still outstanding before this
  // payment; anything beyond that becomes a real customer_credits row
  // against 2150, not a phantom reduction of AR that was never owed in the
  // first place. Subtract linked credit notes from outstanding so credits
  // reduce what can be cleared.
  const cnTotalPay = await sql<{ credited: string }>`
    SELECT coalesce(round(sum(cl.rate * cl.qty * (1 + coalesce(cl.tax_pct, 0) / 100)), 2), 0) credited
    FROM credit_note_lines cl JOIN credit_notes cn ON cn.id = cl.credit_note_id
    WHERE cn.original_invoice_id = ${invoiceId}::uuid AND cn.status = 'POSTED' AND cn.tenant_id = ${tenantId}
  `.execute(trx);
  const creditedAmtPay = Number(cnTotalPay.rows[0]?.credited) || 0;
  const previouslyPaid = totalPaid - Number(amount);
  const outstandingBefore = Math.max(0, grandTotal - previouslyPaid - creditedAmtPay);
  const clearAmount = Math.min(Number(amount), outstandingBefore);
  const excessAmount = Math.round((Number(amount) - clearAmount) * 100) / 100;

  let newStatus: string;
  const effectiveTotal = Math.max(0, grandTotal - creditedAmtPay);
  if (totalPaid <= 0) newStatus = effectiveTotal <= 0 ? 'Credited' : 'Unpaid';
  else if (totalPaid >= effectiveTotal) newStatus = 'Paid';
  else newStatus = 'Partial';
  await trx.updateTable('sales_invoices').set({ received: totalPaid, status: newStatus, updated_at: new Date() }).where('id', '=', invoiceId).where('tenant_id', '=', tenantId).execute();

  // Post payment to GL — amounts arrive in the invoice's currency; convert
  // to reporting currency for the ledger.
  const payFx = Number(inv.exchange_rate) || 1;
  const payFxMeta = { currency: inv.currency, exchangeRate: payFx };
  const payDims = inv.business_line_id ? { business_line_id: inv.business_line_id } : undefined;

  const tsPay = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const sPay = tsPay ? (typeof tsPay.settings === 'string' ? JSON.parse(tsPay.settings) : tsPay.settings) : {};
  const reportingCcyPay = (sPay?.company?.currency || 'TZS').toUpperCase();
  const invCcyPay = inv.currency.toUpperCase();
  const needsPayConversion = invCcyPay !== reportingCcyPay && payFx !== 1 && payFx > 0;
  const glPayAmount = needsPayConversion ? Math.round(Number(amount) * payFx * 100) / 100 : Number(amount);
  const glClearAmt = needsPayConversion ? Math.round(clearAmount * payFx * 100) / 100 : clearAmount;
  const glExcessAmt = needsPayConversion ? Math.round(excessAmount * payFx * 100) / 100 : excessAmount;

  const journalEntryId = await GLService.post(tenantId, {
    entryDate: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
    description: `Payment received: ${inv.invoice_number}`,
    reference: inv.invoice_number,
    sourceModule: 'AR',
    sourceId: inv.id,
    createdBy: actorId ?? undefined,
    lines: [
      { accountCode: '1010', debit: glPayAmount, credit: 0, description: 'Cash received', dimensions: payDims, ...payFxMeta },
      ...(glClearAmt > 0.01 ? [{ accountCode: '1100', debit: 0, credit: glClearAmt, description: `Clear AR: ${inv.invoice_number}`, dimensions: payDims, ...payFxMeta }] : []),
      ...(glExcessAmt > 0.01 ? [{ accountCode: '2150', debit: 0, credit: glExcessAmt, description: `Overpayment credit: ${inv.invoice_number}`, dimensions: payDims, ...payFxMeta }] : []),
    ],
  }, trx);

  if (excessAmount > 0.01) {
    await trx.insertInto('customer_credits').values({
      tenant_id: tenantId, customer_id: inv.customer_id ?? null, amount: String(excessAmount),
      source_invoice_id: inv.id, reason: `Overpayment on ${inv.invoice_number}`,
      journal_entry_id: journalEntryId, created_by: actorId,
    }).execute();
  }

  await trx.insertInto('invoice_activity_log').values({
    tenant_id: tenantId, invoice_id: invoiceId, actor_id: actorId, actor_name: actorName ?? null,
    action: 'payment_recorded',
    detail: `${method || 'Payment'} of ${Number(amount).toLocaleString()} recorded${excessAmount > 0.01 ? ` (${excessAmount.toLocaleString()} credited to customer account as overpayment)` : ''}`,
    created_at: new Date(),
  }).execute();

  await enqueueAccountingSync(trx, tenantId, 'INVOICE', invoiceId);
  await enqueueAccountingSync(trx, tenantId, 'INVOICE_PAYMENT', payment.id);

  return { outcome: 'recorded', received: totalPaid, status: newStatus, credit_issued: excessAmount, paymentId: payment.id, event };
}
