import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { GLService } from './gl.service.js';
import { reportingCurrency } from './tax-registration.service.js';
import { invoiceGrandTotal } from '../routes/invoices.routes.js';

/**
 * Period-end FX revaluation — open (unpaid/partially-paid) sales invoices
 * and supplier bills whose own currency differs from the tenant's
 * reporting currency.
 *
 * **A deliberate departure from a literal "use the stored exchange_rate as
 * the first comparison rate" reading, found during implementation
 * research, not assumed at design time**: `sales_invoices.exchange_rate`
 * and `supplier_bills.exchange_rate` do not mean the same thing.
 * Invoices': "units of the invoice's own currency per one unit of a
 * *line's* foreign currency" — a line-to-invoice conversion baked into
 * the total the moment the invoice posts, which is why a same-currency
 * invoice already carries its true open balance in its own currency with
 * nothing left to revalue. Bills': "units of the reporting currency per
 * one unit of the bill's currency" — genuinely a bill-to-reporting rate,
 * but confirmed via a full-codebase grep to be collected on create and
 * never read anywhere else, including at posting time (`bills.routes.ts`
 * posts `total` to `1150`/`2000` unconverted). Neither field is a
 * reliable "the rate this monetary item was booked at" fact. Rather than
 * use one document type's field and not the other's — an inconsistency
 * that would be invisible until someone asked why AR and AP revalue
 * differently — every subject's *first-ever* revaluation establishes a
 * clean baseline (comparison_rate = current_rate, zero movement
 * recognized) and only the *second* revaluation onward shows a real
 * gain/loss, off the *prior revaluation's own* rate. This still satisfies
 * the plan's real requirement — never compare against the original
 * booking rate forever, which double-revalues the same balance — just
 * without leaning on a stored field research showed isn't safe to trust.
 *
 * **Scope note, matching this milestone's own stated boundary**: this
 * revalues open AR/AP only. Foreign-currency cash was in the original
 * scope sketch, but this platform's USD cash account (`1011`) has zero
 * real posting call sites anywhere (confirmed via grep) — there being
 * nothing to revalue is not this milestone's decision to fabricate around.
 * Realized FX gain/loss on settlement remains out of scope, per the plan.
 */

interface RevaluationSubject {
  subjectType: 'AR_INVOICE' | 'AP_BILL';
  subjectId: string;
  currency: string;
  openBalanceFc: number;
  glAccountCode: string; // the balance-sheet account this subject's balance sits on
}

async function fxRate(trx: Transaction<Database>, fromCurrency: string, toCurrency: string, asOfDate: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1;

  const direct = await trx.selectFrom('fx_rates').select('rate')
    .where('base_currency', '=', fromCurrency).where('quote_currency', '=', toCurrency)
    .where('rate_date', '<=', asOfDate).orderBy('rate_date', 'desc').executeTakeFirst();
  if (direct) return Number(direct.rate);

  const inverse = await trx.selectFrom('fx_rates').select('rate')
    .where('base_currency', '=', toCurrency).where('quote_currency', '=', fromCurrency)
    .where('rate_date', '<=', asOfDate).orderBy('rate_date', 'desc').executeTakeFirst();
  if (inverse) return 1 / Number(inverse.rate);

  // Cross via USD — fx_rates is fetched USD-based (confirmed live: every
  // row has base_currency='USD'), so a non-USD pair (e.g. EUR->TZS) needs
  // (USD->toCurrency) / (USD->fromCurrency) rather than a direct row.
  if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
    const usdToFrom = await trx.selectFrom('fx_rates').select('rate')
      .where('base_currency', '=', 'USD').where('quote_currency', '=', fromCurrency)
      .where('rate_date', '<=', asOfDate).orderBy('rate_date', 'desc').executeTakeFirst();
    const usdToTarget = await trx.selectFrom('fx_rates').select('rate')
      .where('base_currency', '=', 'USD').where('quote_currency', '=', toCurrency)
      .where('rate_date', '<=', asOfDate).orderBy('rate_date', 'desc').executeTakeFirst();
    if (usdToFrom && usdToTarget) return Number(usdToTarget.rate) / Number(usdToFrom.rate);
  }

  throw new Error(`No FX rate available for ${fromCurrency} -> ${toCurrency} as of ${asOfDate}.`);
}

export interface FxRevaluationResult {
  periodDate: string; subjectsRevalued: number; totalGain: number; totalLoss: number; netMovement: number; journalEntryId: string | null;
  subjects: { subjectType: string; subjectId: string; currency: string; openBalanceFc: number; comparisonRate: number; currentRate: number; gainLoss: number }[];
}

export async function computeAndPostFxRevaluation(tenantId: string, periodDate: string, actorId: string): Promise<FxRevaluationResult> {
  const reportingCcy = await withTenant(tenantId, (trx) => reportingCurrency(trx, tenantId));

  const subjects: RevaluationSubject[] = await withTenant(tenantId, async (trx) => {
    // INVOICE_STATUS (invoices.routes.ts) is 'Draft'|'Partial'|'Paid'|
    // 'Credited'|'Unpaid'|'Overdue' — no 'Void' exists on this document
    // type. 'Paid' is excluded here as an optimization only (its own open
    // balance already computes to ~0 below); 'Credited' is excluded for
    // real correctness — its own lines still sum to a nonzero total even
    // once a separate credit_notes record has economically settled it.
    const invoices = await trx.selectFrom('sales_invoices').selectAll()
      .where('tenant_id', '=', tenantId).where('currency', '!=', reportingCcy)
      .where('status', 'not in', ['Paid', 'Credited']).execute();
    const invoiceIds = invoices.map(i => i.id);
    const invLines = invoiceIds.length
      ? await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', 'in', invoiceIds).execute() : [];
    const invPayments = invoiceIds.length
      ? await trx.selectFrom('invoice_payments').select(['invoice_id', 'amount']).where('invoice_id', 'in', invoiceIds).execute() : [];
    const linesByInvoice = new Map<string, typeof invLines>();
    for (const l of invLines) { const arr = linesByInvoice.get(l.invoice_id) ?? []; arr.push(l); linesByInvoice.set(l.invoice_id, arr); }
    const paidByInvoice = new Map<string, number>();
    for (const p of invPayments) paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));

    const arSubjects: RevaluationSubject[] = [];
    for (const inv of invoices) {
      const lines = linesByInvoice.get(inv.id) ?? [];
      const grandTotal = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const openFc = grandTotal - paid;
      if (openFc > 0.01) arSubjects.push({ subjectType: 'AR_INVOICE', subjectId: inv.id, currency: inv.currency, openBalanceFc: openFc, glAccountCode: '1100' });
    }

    const bills = await trx.selectFrom('supplier_bills').selectAll()
      .where('tenant_id', '=', tenantId).where('currency', '!=', reportingCcy)
      .where('status', 'not in', ['VOID']).execute();
    const apSubjects: RevaluationSubject[] = [];
    for (const bill of bills) {
      const openFc = Number(bill.total) - Number(bill.paid_amount);
      if (openFc > 0.01) apSubjects.push({ subjectType: 'AP_BILL', subjectId: bill.id, currency: bill.currency, openBalanceFc: openFc, glAccountCode: '2000' });
    }

    return [...arSubjects, ...apSubjects];
  });

  const resultSubjects: FxRevaluationResult['subjects'] = [];
  const postedSubjectIds: string[] = [];
  const lines: { accountCode: string; debit: number; credit: number; description: string }[] = [];
  let totalGain = 0, totalLoss = 0;

  await withTenant(tenantId, async (trx) => {
    for (const s of subjects) {
      const currentRate = await fxRate(trx, s.currency, reportingCcy, periodDate);
      const priorReval = await trx.selectFrom('fx_revaluations').select('current_rate')
        .where('tenant_id', '=', tenantId).where('subject_type', '=', s.subjectType).where('subject_id', '=', s.subjectId)
        .where('period_date', '<', periodDate).orderBy('period_date', 'desc').executeTakeFirst();
      const comparisonRate = priorReval ? Number(priorReval.current_rate) : currentRate;

      // AR: a higher rate means the receivable is now worth more in
      // reporting-currency terms — a gain. AP: a higher rate means the
      // payable now costs more to settle — a loss, the opposite sign.
      const gainLoss = s.subjectType === 'AR_INVOICE'
        ? Math.round(s.openBalanceFc * (currentRate - comparisonRate) * 100) / 100
        : Math.round(s.openBalanceFc * (comparisonRate - currentRate) * 100) / 100;

      resultSubjects.push({ subjectType: s.subjectType, subjectId: s.subjectId, currency: s.currency, openBalanceFc: s.openBalanceFc, comparisonRate, currentRate, gainLoss });

      // A re-run for the *same* period_date must post only the incremental
      // change since that date's own last computation, not the full
      // gain/loss again — otherwise calling this twice for one date
      // silently doubles the movement (caught live: a same-date re-run
      // posted a second identical journal entry before this fix).
      const existingForThisDate = await trx.selectFrom('fx_revaluations').select('gain_loss')
        .where('tenant_id', '=', tenantId).where('subject_type', '=', s.subjectType).where('subject_id', '=', s.subjectId)
        .where('period_date', '=', periodDate).executeTakeFirst();
      const previouslyPosted = existingForThisDate ? Number(existingForThisDate.gain_loss) : 0;
      const movement = Math.round((gainLoss - previouslyPosted) * 100) / 100;

      await trx.insertInto('fx_revaluations').values({
        tenant_id: tenantId, period_date: periodDate, subject_type: s.subjectType, subject_id: s.subjectId,
        currency: s.currency, open_balance_fc: String(s.openBalanceFc), comparison_rate: String(comparisonRate),
        current_rate: String(currentRate), gain_loss: String(gainLoss), created_by: actorId,
      }).onConflict((oc) => oc.columns(['tenant_id', 'subject_type', 'subject_id', 'period_date']).doUpdateSet({
        currency: s.currency, open_balance_fc: String(s.openBalanceFc), comparison_rate: String(comparisonRate),
        current_rate: String(currentRate), gain_loss: String(gainLoss), created_by: actorId, created_at: new Date(),
      })).execute();

      if (Math.abs(movement) < 0.01) continue;
      postedSubjectIds.push(s.subjectId);
      if (movement > 0) { totalGain += movement; } else { totalLoss += -movement; }

      // The balance-sheet side moves with the accounting-value change
      // (asset up on an AR gain, liability up on an AP loss); 5202 takes
      // the offsetting P&L side.
      if (s.subjectType === 'AR_INVOICE') {
        if (movement > 0) lines.push({ accountCode: s.glAccountCode, debit: movement, credit: 0, description: `FX revaluation gain` }, { accountCode: '5202', debit: 0, credit: movement, description: `FX revaluation gain` });
        else lines.push({ accountCode: '5202', debit: -movement, credit: 0, description: `FX revaluation loss` }, { accountCode: s.glAccountCode, debit: 0, credit: -movement, description: `FX revaluation loss` });
      } else {
        if (movement < 0) lines.push({ accountCode: '5202', debit: -movement, credit: 0, description: `FX revaluation loss` }, { accountCode: s.glAccountCode, debit: 0, credit: -movement, description: `FX revaluation loss` });
        else lines.push({ accountCode: s.glAccountCode, debit: movement, credit: 0, description: `FX revaluation gain` }, { accountCode: '5202', debit: 0, credit: movement, description: `FX revaluation gain` });
      }
    }
  });

  let journalEntryId: string | null = null;
  if (lines.length > 0) {
    journalEntryId = await GLService.post(tenantId, {
      entryDate: periodDate, description: `FX revaluation as of ${periodDate}`,
      sourceModule: 'MANUAL', createdBy: actorId, lines,
    });
    await withTenant(tenantId, (trx) =>
      trx.updateTable('fx_revaluations').set({ journal_entry_id: journalEntryId })
        .where('tenant_id', '=', tenantId).where('period_date', '=', periodDate)
        .where('subject_id', 'in', postedSubjectIds).execute()
    );
  }

  return {
    periodDate, subjectsRevalued: subjects.length, totalGain, totalLoss, netMovement: totalGain - totalLoss,
    journalEntryId, subjects: resultSubjects,
  };
}
