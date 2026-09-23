import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { DocumentService, DocumentQuotaExceededError } from '../services/document.service.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
import {
  renderCreditNotePdf, renderQuotationPdf, renderPurchaseOrderPdf, renderBillPdf,
} from '../services/finance-document-pdf.service.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';

/**
 * Files an immutable PDF of every issued Finance document into Business
 * Records ▸ Finance ▸ <year> ▸ ..., via DocumentService. Invoices are also
 * filed inline the moment they're issued (invoices.routes.ts); this sweep is
 * how every other document type gets filed, and the backstop for invoices
 * created by paths that don't go through that route (recurring generation,
 * imports).
 *
 * A sweep rather than a hook in each route on purpose: a document reaches
 * its "issued" state through several different routes (create-as-posted,
 * approve, submit, status PATCH, recurring generators), and an inline call
 * from inside those transactions races the commit (see invoices.routes.ts —
 * "Invoice not found"). A sweep sees only committed rows, and DocumentService's
 * idempotency key (`<entity>:<id>:issued`) makes running it repeatedly, or
 * alongside the inline invoice path, a no-op after the first filing.
 *
 * Only documents touched in the last 2 days are considered, so turning this
 * on never back-files (and bills against storage quota) a tenant's entire
 * history — that would be a decision for the tenant, not a side effect.
 */
interface Kind {
  entityType: string;
  documentType: string;
  table: string;
  numberColumn: string;
  issuedStatuses: string[];
  render: (tenantId: string, id: string) => Promise<Buffer>;
}

const KINDS: Kind[] = [
  { entityType: 'invoice', documentType: 'issued_invoice', table: 'sales_invoices', numberColumn: 'invoice_number',
    issuedStatuses: ['Unpaid', 'Partial', 'Paid', 'Overdue', 'Credited'], render: renderInvoicePdf },
  { entityType: 'credit_note', documentType: 'credit_note', table: 'credit_notes', numberColumn: 'credit_note_number',
    issuedStatuses: ['POSTED'], render: renderCreditNotePdf },
  { entityType: 'quotation', documentType: 'quotation', table: 'quotations', numberColumn: 'quote_number',
    issuedStatuses: ['APPROVED', 'CONVERTED'], render: renderQuotationPdf },
  { entityType: 'purchase_order', documentType: 'purchase_order', table: 'purchase_orders', numberColumn: 'po_number',
    issuedStatuses: ['SENT', 'PARTIAL', 'RECEIVED'], render: renderPurchaseOrderPdf },
  { entityType: 'bill', documentType: 'bill', table: 'supplier_bills', numberColumn: 'bill_number',
    issuedStatuses: ['POSTED', 'PARTIAL', 'PAID'], render: renderBillPdf },
];

const BATCH = 25;

export async function runFinanceDocumentFilingJob(): Promise<void> {
  const entitled = new Map<string, boolean>();
  const overQuota = new Set<string>();
  let filed = 0, failed = 0;

  for (const kind of KINDS) {
    try {
      const rows = await sql<{ id: string; tenant_id: string; num: string }>`
        SELECT t.id, t.tenant_id, t.${sql.ref(kind.numberColumn)} AS num
        FROM ${sql.table(kind.table)} t
        WHERE t.status IN (${sql.join(kind.issuedStatuses)})
          AND t.updated_at >= now() - interval '2 days'
          AND NOT EXISTS (
            SELECT 1 FROM cloud_files f
            WHERE f.tenant_id = t.tenant_id
              AND f.idempotency_key = ${kind.entityType}::text || ':' || t.id::text || ':issued'
          )
        ORDER BY t.updated_at DESC
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
            idempotencyKey: `${kind.entityType}:${row.id}:issued`,
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
