import type { Transaction } from 'kysely';
import { createHash } from 'node:crypto';
import type { Database } from '../db/client.js';
import { computeVatReturn } from './vat-return.service.js';
import { reportingCurrency } from './tax-registration.service.js';
import { IndustryWorkError } from './finance-industry-work.service.js';
import type { FinanceTaxPreparationView } from '@hudumika/types';

export const TAX_PREPARATION_CHECKS = ['jurisdiction', 'registration', 'sales', 'purchases', 'currency', 'reconciliation'];
export async function taxPreparationContext(trx: Transaction<Database>, tenantId: string, periodId: string) {
  const period = await trx.selectFrom('vat_periods').selectAll().where('tenant_id', '=', tenantId).where('id', '=', periodId).forUpdate().executeTakeFirst();
  if (!period) throw new IndustryWorkError('VAT period not found.', 404);
  const currency = await reportingCurrency(trx, tenantId);
  const snapshot = await computeVatReturn(trx, tenantId, String(period.period_start).slice(0, 10), String(period.period_end).slice(0, 10), currency, period.jurisdiction);
  const sources = await trx.selectFrom('sales_invoices').select(['id', 'updated_at']).where('tenant_id', '=', tenantId).where('bill_date', '>=', period.period_start).where('bill_date', '<=', period.period_end).orderBy('id').execute();
  const purchases = await trx.selectFrom('supplier_bills').select(['id', 'updated_at']).where('tenant_id', '=', tenantId).where('bill_date', '>=', period.period_start).where('bill_date', '<=', period.period_end).orderBy('id').execute();
  const stableSnapshot = { ...snapshot, outputs: [...snapshot.outputs].sort((a,b) => `${a.kind}:${a.code}`.localeCompare(`${b.kind}:${b.code}`)), inputs: [...snapshot.inputs].sort((a,b) => `${a.kind}:${a.code}`.localeCompare(`${b.kind}:${b.code}`)) };
  const hash = createHash('sha256').update(JSON.stringify({ snapshot: stableSnapshot, sources, purchases })).digest('hex');
  const diagnostics: FinanceTaxPreparationView['diagnostics'] = [];
  if (snapshot.unclassified.salesLines + snapshot.unclassified.purchaseLines > 0) diagnostics.push({ severity: 'blocking', message: 'Classify all sales and purchase lines before preparing the return.' });
  if (snapshot.fxSkipped.invoices + snapshot.fxSkipped.bills > 0) diagnostics.push({ severity: 'blocking', message: 'Supply the missing exchange rates for every source document.' });
  if (!snapshot.registration.mayChargeVat) diagnostics.push({ severity: 'blocking', message: snapshot.registration.advisory || 'Confirm effective VAT registration for this jurisdiction and period.' });
  if (Math.abs(snapshot.ledger.difference) > 0.01) diagnostics.push({ severity: 'review', message: 'Explain the return-to-ledger difference, including any partial-exemption adjustment.' });
  return { period, snapshot, hash, diagnostics };
}
