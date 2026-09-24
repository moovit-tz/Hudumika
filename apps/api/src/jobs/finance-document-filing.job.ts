import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { DocumentService, DocumentQuotaExceededError } from '../services/document.service.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
import {
  renderCreditNotePdf, renderQuotationPdf, renderPurchaseOrderPdf, renderBillPdf,
  renderExpensePdf, renderInvoicePaymentPdf, renderBillPaymentPdf, renderBankStatementPdf,
  renderFixedAssetPdf, renderTrialBalancePdf,
} from '../services/finance-document-pdf.service.js';
import { renderPayeReturnPdf } from '../services/paye-return-pdf.service.js';
import { renderWhtCertificatePdf } from '../services/wht-certificate-pdf.service.js';
import { renderCitReturnPdf } from '../services/cit-return-pdf.service.js';
import { renderVatReturnPdfFromData } from '../services/vat-return-pdf.service.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';

/**
 * Files an immutable PDF of every issued/finalised Finance record into
 * Business Records ▸ Finance ▸ <year> ▸ ..., via DocumentService. Invoices
 * are also filed inline the moment they're issued (invoices.routes.ts); this
 * sweep is how every other document type gets filed, and the backstop for
 * invoices created by paths that don't go through that route (recurring
 * generation, imports).
 *
 * A sweep rather than a hook in each route on purpose: a document reaches
 * its "issued" state through several different routes (create-as-posted,
 * approve, submit, status PATCH, recurring generators), and an inline call
 * from inside those transactions races the commit (see invoices.routes.ts —
 * "Invoice not found"). A sweep sees only committed rows, and DocumentService's
 * idempotency key (`<entity>:<id>:<suffix>`) makes running it repeatedly, or
 * alongside the inline invoice path, a no-op after the first filing.
 *
 * Only records touched in the last 2 days are considered, so turning this
 * on never back-files (and bills against storage quota) a tenant's entire
 * history — that would be a decision for the tenant, not a side effect.
 */
interface Kind {
  entityType: string;
  documentType: string;
  table: string;
  /** SQL expression (over alias `t`) for the filename stem. */
  numExpr: string;
  /** SQL predicate (over alias `t`) selecting rows that are final enough to file. */
  where: string;
  /** Column saying when the row last became relevant (recency window + ordering). */
  tsColumn: string;
  /** Idempotency-key suffix; a record filed once under this key is never re-filed. */
  keySuffix?: string;
  render: (tenantId: string, id: string) => Promise<Buffer>;
}

const inList = (col: string, values: string[]) => `t.${col} IN (${values.map(v => `'${v}'`).join(', ')})`;

async function renderVatPeriodPdf(tenantId: string, id: string): Promise<Buffer> {
  const row = await withTenant(tenantId, (trx) =>
    trx.selectFrom('vat_periods').select('return_snapshot')
      .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow());
  const ret = typeof row.return_snapshot === 'string' ? JSON.parse(row.return_snapshot) : row.return_snapshot;
  return renderVatReturnPdfFromData(tenantId, ret as any);
}

const KINDS: Kind[] = [
  { entityType: 'invoice', documentType: 'issued_invoice', table: 'sales_invoices', numExpr: 't.invoice_number',
    where: inList('status', ['Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited']), tsColumn: 'updated_at', render: renderInvoicePdf },
  { entityType: 'credit_note', documentType: 'credit_note', table: 'credit_notes', numExpr: 't.credit_note_number',
    where: inList('status', ['POSTED']), tsColumn: 'updated_at', render: renderCreditNotePdf },
  { entityType: 'quotation', documentType: 'quotation', table: 'quotations', numExpr: 't.quote_number',
    where: inList('status', ['APPROVED', 'CONVERTED']), tsColumn: 'updated_at', render: renderQuotationPdf },
  { entityType: 'purchase_order', documentType: 'purchase_order', table: 'purchase_orders', numExpr: 't.po_number',
    where: inList('status', ['SENT', 'PARTIAL', 'RECEIVED']), tsColumn: 'updated_at', render: renderPurchaseOrderPdf },
  { entityType: 'bill', documentType: 'bill', table: 'supplier_bills', numExpr: 't.bill_number',
    where: inList('status', ['POSTED', 'PARTIAL', 'PAID']), tsColumn: 'updated_at', render: renderBillPdf },
  // Approved spend only — a submitted/rejected claim is not yet a record — and not revenue rows.
  { entityType: 'expense', documentType: 'expense', table: 'finance_expenses',
    numExpr: `'EXP-' || to_char(t.expense_date, 'YYYYMMDD') || '-' || left(t.id::text, 8)`,
    where: `t.status = 'APPROVED' AND NOT t.is_revenue`, tsColumn: 'created_at', render: renderExpensePdf },
  { entityType: 'invoice_payment', documentType: 'payment_incoming', table: 'invoice_payments',
    numExpr: `'RCPT-' || left(t.id::text, 8)`, where: 'TRUE', tsColumn: 'created_at', render: renderInvoicePaymentPdf },
  { entityType: 'bill_payment', documentType: 'payment_outgoing', table: 'bill_payments',
    numExpr: `'PAY-' || left(t.id::text, 8)`, where: 'TRUE', tsColumn: 'created_at', render: renderBillPaymentPdf },
  { entityType: 'bank_statement', documentType: 'bank_statement', table: 'bank_statements',
    numExpr: `'STMT-' || t.account_code || '-' || to_char(t.statement_date_to, 'YYYYMMDD')`,
    where: 'TRUE', tsColumn: 'created_at', keySuffix: 'imported', render: renderBankStatementPdf },
  { entityType: 'fixed_asset', documentType: 'fixed_asset', table: 'fixed_assets',
    numExpr: `'FA-' || left(t.id::text, 8)`, where: 'TRUE', tsColumn: 'created_at', keySuffix: 'registered', render: renderFixedAssetPdf },
  // Tax filings — filed once final (closed / approved / accrued / certificate issued).
  { entityType: 'vat_period', documentType: 'tax_filing', table: 'vat_periods',
    numExpr: `'VAT-' || to_char(t.period_start, 'YYYYMMDD') || '-' || to_char(t.period_end, 'YYYYMMDD')`,
    where: `t.status = 'closed' AND t.return_snapshot IS NOT NULL`, tsColumn: 'closed_at', keySuffix: 'closed', render: renderVatPeriodPdf },
  { entityType: 'payroll_run', documentType: 'tax_filing', table: 'payroll_runs',
    numExpr: `'PAYE-' || t.period_year || '-' || lpad(t.period_month::text, 2, '0')`,
    where: inList('status', ['APPROVED', 'PAID']), tsColumn: 'updated_at', keySuffix: 'approved', render: renderPayeReturnPdf },
  { entityType: 'wht_deduction', documentType: 'tax_filing', table: 'wht_deductions',
    numExpr: `'WHT-' || t.certificate_number`, where: 't.certificate_number IS NOT NULL',
    tsColumn: 'certificate_issued_at', keySuffix: 'certified', render: renderWhtCertificatePdf },
  { entityType: 'cit_return', documentType: 'tax_filing', table: 'cit_returns',
    numExpr: `'CIT-' || to_char(t.period_start, 'YYYYMMDD') || '-' || to_char(t.period_end, 'YYYYMMDD')`,
    where: inList('status', ['ACCRUED']), tsColumn: 'accrued_at', keySuffix: 'accrued', render: renderCitReturnPdf },
  { entityType: 'gl_period', documentType: 'financial_report', table: 'gl_periods',
    numExpr: `'TB-' || to_char(t.period_start, 'YYYYMMDD') || '-' || to_char(t.period_end, 'YYYYMMDD')`,
    where: `t.status = 'closed' AND t.trial_balance_snapshot IS NOT NULL`, tsColumn: 'closed_at', keySuffix: 'closed',
    render: renderTrialBalancePdf },
];

const BATCH = 25;

export async function runFinanceDocumentFilingJob(): Promise<void> {
  const entitled = new Map<string, boolean>();
  const overQuota = new Set<string>();
  let filed = 0, failed = 0;

  for (const kind of KINDS) {
    const suffix = kind.keySuffix ?? 'issued';
    try {
      // All interpolated SQL fragments come from the static KINDS table above.
      const rows = await sql<{ id: string; tenant_id: string; num: string }>`
        SELECT t.id, t.tenant_id, ${sql.raw(kind.numExpr)} AS num
        FROM ${sql.table(kind.table)} t
        WHERE ${sql.raw(kind.where)}
          AND EXISTS (SELECT 1 FROM tenants tn WHERE tn.id = t.tenant_id)
          AND t.${sql.ref(kind.tsColumn)} >= now() - interval '2 days'
          AND NOT EXISTS (
            SELECT 1 FROM cloud_files f
            WHERE f.tenant_id = t.tenant_id
              AND f.idempotency_key = ${kind.entityType}::text || ':' || t.id::text || ':' || ${suffix}::text
          )
        ORDER BY t.${sql.ref(kind.tsColumn)} DESC
        LIMIT ${BATCH}
      `.execute(dbPlatform);

      for (const row of rows.rows) {
        if (overQuota.has(row.tenant_id)) continue;
        if (!entitled.has(row.tenant_id)) entitled.set(row.tenant_id, await tenantHasEntitlement(row.tenant_id, 'finops'));
        if (!entitled.get(row.tenant_id)) continue;
        try {
          const pdf = await kind.render(row.tenant_id, row.id);
          await DocumentService.saveDocument({
            tenantId: row.tenant_id, sourceApp: 'finops', entityType: kind.entityType, entityId: row.id,
            documentType: kind.documentType, filename: `${row.num || row.id}.pdf`,
            content: pdf, mimeType: 'application/pdf', retentionClass: 'financial_record',
            idempotencyKey: `${kind.entityType}:${row.id}:${suffix}`,
          });
          filed++;
        } catch (err: any) {
          if (err instanceof DocumentQuotaExceededError) { overQuota.add(row.tenant_id); continue; }
          failed++;
          console.error(`❌ Finance document filing failed (${kind.entityType} ${row.id}):`, err.message);
        }
      }
    } catch (err: any) {
      console.error(`❌ Finance document filing sweep failed for ${kind.entityType}:`, err.message);
    }
  }

  if (filed || failed) console.log(`🗂️ Finance document filing — filed: ${filed}, failed: ${failed}`);
}
