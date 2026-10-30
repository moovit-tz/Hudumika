import { csvText } from '@hudumika/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
import { renderDeliveryDocumentPdf } from '../services/delivery-document.service.js';
import { renderCreditNotePdf, renderQuotationPdf, renderPurchaseOrderPdf, renderBillPdf, renderExpensePdf, renderExpenseReportPdf, renderVendorStatementPdf } from '../services/finance-document-pdf.service.js';
import { MailService } from '../services/mail.service.js';
import { MinioIntegration } from '../integrations/minio.js';

const kinds = ['invoice', 'credit_note', 'quotation', 'purchase_order', 'delivery_note', 'bill', 'expense', 'expense_report', 'vendor_statement'] as const;
const recordParams = z.object({ kind: z.enum(kinds), id: z.string().uuid() });
type Kind = typeof kinds[number];
const records = {
  invoice: ['sales_invoices', 'invoice_number'], credit_note: ['credit_notes', 'credit_note_number'], quotation: ['quotations', 'quote_number'],
  purchase_order: ['purchase_orders', 'po_number'], delivery_note: ['delivery_documents', 'doc_number'], bill: ['supplier_bills', 'bill_number'],
  expense: ['finance_expenses', 'name'], expense_report: ['finance_expense_reports', 'name'], vendor_statement: ['suppliers', 'name'],
} as const;
const renderers = { invoice: renderInvoicePdf, credit_note: renderCreditNotePdf, quotation: renderQuotationPdf, purchase_order: renderPurchaseOrderPdf,
  delivery_note: renderDeliveryDocumentPdf, bill: renderBillPdf, expense: renderExpensePdf, expense_report: renderExpenseReportPdf, vendor_statement: renderVendorStatementPdf };
const exportColumns: Record<Kind, string[]> = {
 invoice:['invoice_number','client_name','currency','bill_date','due_date','status','received'],
 credit_note:['credit_note_number','client_name','currency','credit_date','status','reason'],
 quotation:['quote_number','title','currency','status','subtotal','tax_amount','total_amount'],
 purchase_order:['po_number','supplier_name','currency','order_date','expected_date','status','subtotal','tax_amount','total'],
 delivery_note:['doc_number','doc_type','customer_name','status','created_at'],
 bill:['bill_number','supplier_name','currency','bill_date','due_date','status','subtotal','tax_amount','total'],
 expense:['name','expense_date','category','amount','status','payment_mode','reference'],
 expense_report:['name','status','created_at','review_note','payment_reference'],
 vendor_statement:['name','contact_name','email','phone','currency','status','payment_terms'],
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
function filename(kind: Kind, label: string) { return `${kind}_${label.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0,100)}.pdf`; }
async function identity(tenantId: string, kind: Kind, id: string, actor: { sub: string; role: string }) {
  const [table, number] = records[kind];
  return withTenant(tenantId, async trx => {
    const result = await sql<{label: string; owner_id: string | null}>`select ${sql.ref(number)}::text as label, ${kind === 'expense_report' ? sql.ref('owner_id') : sql`null::text`} as owner_id from ${sql.table(table)} where tenant_id = ${tenantId} and id = ${id}`.execute(trx);
    const row = result.rows[0];
    if (!row || (kind === 'expense_report' && row.owner_id !== actor.sub && !['SUPER_ADMIN','ADMIN','TENANT_ADMIN','FINANCE'].includes(actor.role))) {
      throw Object.assign(new Error('Document not found.'), { statusCode: 404 });
    }
    return { label: row.label || id, filename: filename(kind, row.label || id) };
  });
}
export async function financeDocumentsRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('finops'));
  server.addHook('preHandler', requireRole('SUPER_ADMIN','ADMIN','TENANT_ADMIN','MANAGER','FINANCE','SALES'));
  server.addHook('preHandler', async (request, reply) => {
    if ((request.params as {kind?: string})?.kind === 'purchase_order') await requireFinanceCapability('finance.procurement', {preserveReadAccess: true})(request, reply);
  });
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.status(400).send({error: error.issues.map(i => i.message).join('; ')});
    const failure=error as {statusCode?:number;message?:string};
    if (failure.statusCode && failure.statusCode < 500) return reply.status(failure.statusCode).send({error: failure.message || 'Document request failed.'});
    request.log.error(error); return reply.status(500).send({error:'Could not generate the document.'});
  });
  server.get('/:kind/export', async (request,reply)=>{
    const {kind}=z.object({kind:z.enum(kinds)}).parse(request.params);
    const [table]=records[kind];const columns=exportColumns[kind];
    const rows=await withTenant(request.user.tenant_id, async trx=>{
      const result=await sql<Record<string,unknown>>`select ${sql.join(columns.map(c=>sql.ref(c)))} from ${sql.table(table)} where tenant_id = ${request.user.tenant_id} ${kind==='expense_report' && !['SUPER_ADMIN','ADMIN','TENANT_ADMIN','FINANCE'].includes(request.user.role)?sql`and owner_id = ${request.user.sub}`:sql``} order by id limit 10001`.execute(trx);
      return result.rows;
    });
    if(rows.length>10000)return reply.status(413).send({error:'More than 10,000 records. Use a narrower export from the list.'});
    return reply.header('Cache-Control','private, no-store').header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition',`attachment; filename="${kind}-all-records.csv"`).send(csvText([columns,...rows.map(row=>columns.map(c=>row[c] instanceof Date?(row[c] as Date).toISOString():['amount','received','subtotal','tax_amount','total','total_amount'].includes(c) && row[c]!=null?Number(row[c]):row[c]))]));
  });
  server.get('/:kind/:id/deliveries', async request => { const {kind,id}=recordParams.parse(request.params); await identity(request.user.tenant_id,kind,id,request.user); return withTenant(request.user.tenant_id,trx=>trx.selectFrom('email_outbox').select(['id','status','created_at','sent_at','attempts']).where('tenant_id','=',request.user.tenant_id).where('attachment_storage_key','like',`tenants/${request.user.tenant_id}/finance-deliveries/${id}/%`).orderBy('created_at','desc').limit(20).execute()); });
  server.get('/:kind/:id/metadata', async request => { const {kind,id}=recordParams.parse(request.params); return identity(request.user.tenant_id,kind,id,request.user); });
  server.get('/:kind/:id/pdf', async (request, reply) => {
    const {kind,id} = recordParams.parse(request.params);
    const meta = await identity(request.user.tenant_id, kind, id, request.user);
    const pdf = await renderers[kind](request.user.tenant_id, id);
    const {download} = z.object({download:z.enum(['1']).optional()}).parse(request.query);
    return reply.header('Cache-Control','private, no-store').header('Content-Type','application/pdf')
      .header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${meta.filename}"`).send(pdf);
  });
  server.post('/batch', {bodyLimit: 32_000, config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async (request, reply) => {
    const {documents} = z.object({documents:z.array(recordParams).min(1).max(30)}).parse(request.body);
    const files: Record<string, Uint8Array> = {}; const failures: string[] = [];
    let size = 0;
    for (const {kind,id} of documents) {
      try {
        const meta = await identity(request.user.tenant_id, kind, id, request.user);
        // Read-preserving procurement policy applies equally to batch output.
        if (kind === 'purchase_order' && request.apiKeyScopes && !request.apiKeyScopes.includes('finance.procurement')) throw new Error('Not accessible.');
        const pdf = await renderers[kind](request.user.tenant_id,id); size += pdf.length;
        if (size > 25 * 1024 * 1024) throw Object.assign(new Error('Batch exceeds 25 MB. Select fewer documents.'),{statusCode:413});
        files[`${id}_${meta.filename}`] = pdf;
      } catch (error) {
        if ((error as {statusCode?:number}).statusCode === 413) throw error;
        failures.push(`${kind}/${id}: could not export this record.`);
      }
    }
    files['export-summary.txt'] = strToU8(`Exported ${Object.keys(files).length} of ${documents.length} requested documents.\n${failures.join('\n')}`);
    return reply.header('Cache-Control','private, no-store').header('Content-Type','application/zip').header('Content-Disposition','attachment; filename="finance-documents.zip"').send(Buffer.from(zipSync(files)));
  });
  server.post('/:kind/:id/send', {bodyLimit:16_000, config:{rateLimit:{max:20,timeWindow:'1 minute'}}}, async (request, reply) => {
    const {kind,id} = recordParams.parse(request.params);
    const {email,message,requestKey} = z.object({email:z.string().email().max(320),message:z.string().trim().max(5000).default(''),requestKey:z.string().uuid()}).parse(request.body);
    const tenantId = request.user.tenant_id;
    const meta = await identity(tenantId,kind,id,request.user);
    const digest = createHash('sha256').update(JSON.stringify([request.user.sub,kind,id,email.toLowerCase(),message,requestKey])).digest('hex');
    const pdf = await renderers[kind](tenantId,id);
    if(pdf.length>10*1024*1024) throw Object.assign(new Error('This PDF exceeds the 10 MB email attachment limit. Download it instead.'),{statusCode:413});
    const outboxId = await withTenant(tenantId, async trx => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${tenantId + digest},0))`.execute(trx);
      const subject = `${kind.replaceAll('_',' ')}: ${meta.label}`;
      const marker = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
      const existing = await trx.selectFrom('email_outbox').select('id').where('tenant_id','=',tenantId).where('id','=',marker).executeTakeFirst();
      if (existing) return existing.id;
      const stored = await MinioIntegration.uploadFinanceDocument(tenantId,id,meta.filename,pdf);
      return MailService.enqueueInTransaction(trx,tenantId,{to:email,subject,bodyHtml:`<p>${escapeHtml(message).replace(/\n/g,'<br>')}</p><p>Please find ${escapeHtml(meta.label)} attached.</p>`,sourceApp:'finops',attachmentStorageKey:stored.storageKey,attachmentFilename:meta.filename,outboxId:marker});
    });
    return reply.status(202).send({queued:true,outbox_id:outboxId});
  });
}
