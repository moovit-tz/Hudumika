import { sql, type Transaction } from 'kysely';
import type { AccountingSyncEntity } from '@hudumika/types';
import { dbPlatform, withTenant, type Database } from '../db/client.js';
import { AccountingIntegrationService } from './accounting-integration.service.js';
import { tenantHasEnabledFinanceCapability } from './finance-capability.service.js';
import { invoiceGrandTotal } from './invoice-totals.js';

export async function reconcileXeroInvoice(tenantId: string, taskId: string, externalId: string, actor: { sub: string; name: string; email: string }) {
 return withTenant(tenantId, async trx => {
  const task = await trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenantId).where('id','=',taskId).forUpdate().executeTakeFirst();
  if (!task || task.status !== 'RECONCILE' || task.provider !== 'XERO' || task.entity_type !== 'INVOICE') throw new Error('Only Xero invoices awaiting review can be reconciled here.');
  await sql`select pg_advisory_xact_lock(hashtextextended(${`accounting-sync:${tenantId}:XERO`}, 0))`.execute(trx);
  const connection = await trx.selectFrom('accounting_integrations').select(['status','provider_org_id']).where('tenant_id','=',tenantId).where('provider','=','XERO').executeTakeFirst();
  if (!task.provider_org_id || connection?.status !== 'CONNECTED' || connection.provider_org_id !== task.provider_org_id) throw new Error('Restore the original Xero organization before reconciling.');
  const invoice = await trx.selectFrom('sales_invoices').selectAll().where('tenant_id','=',tenantId).where('id','=',task.entity_id).forUpdate().executeTakeFirst();
  if (!invoice) throw new Error('The source invoice is no longer available.');
  if (invoice.status === 'Void' || invoice.status === 'Draft') throw new Error('A void or draft invoice cannot be reconciled as an issued export.');
  const contact = await trx.selectFrom('accounting_integration_entity_map').select('external_id').where('tenant_id','=',tenantId).where('provider','=','XERO').where('local_type','=','customer').where('local_id','=',invoice.customer_id ?? invoice.id).executeTakeFirst();
  if (!contact) throw new Error('A verified customer mapping is required before reconciliation.');
  const assigned = await trx.selectFrom('accounting_sync_logs').select('entity_id').where('tenant_id','=',tenantId).where('provider','=','XERO').where('status','=','SUCCESS').where('external_id','=',externalId).where('entity_id','!=',task.entity_id).executeTakeFirst();
  if (assigned) throw new Error('That provider record is already linked to another source.');
  const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id','=',invoice.id).execute();
  const expected = invoiceGrandTotal(lines, invoice.currency ?? 'TZS', Number(invoice.exchange_rate ?? 1));
  if (!Number.isFinite(expected) || expected < 0) throw new Error('The source invoice total is invalid.');
  const remote = await AccountingIntegrationService.readXeroInvoice(trx, tenantId, externalId);
  if (remote.Type !== 'ACCREC' || !['AUTHORISED','PAID'].includes(remote.Status) || remote.InvoiceNumber !== invoice.invoice_number || remote.Contact?.ContactID !== contact.external_id || remote.CurrencyCode !== (invoice.currency ?? 'TZS') || !Number.isFinite(Number(remote.Total)) || Math.abs(Number(remote.Total) - expected) > 0.005) throw new Error('Provider invoice does not match the source number, contact, currency, total or status.');
  await trx.insertInto('accounting_sync_logs').values({tenant_id:tenantId,provider:'XERO',entity_type:'INVOICE',entity_id:invoice.id,status:'SUCCESS',external_id:externalId}).execute();
  await trx.insertInto('invoice_activity_log').values({tenant_id:tenantId,invoice_id:invoice.id,actor_id:actor.sub,actor_name:actor.name || actor.email,action:'accounting_sync_reconciled',detail:`Xero delivery ${task.id} matched provider invoice ${externalId} by readback.`}).execute();
  return trx.updateTable('finance_accounting_outbox').set({status:'SUCCESS',last_error:null,updated_at:new Date()}).where('tenant_id','=',tenantId).where('id','=',task.id).returningAll().executeTakeFirstOrThrow();
 });
}

export async function enqueueAccountingSync(trx: Transaction<Database>, tenantId: string, entityType: AccountingSyncEntity, entityId: string): Promise<void> {
 const table = entityType === 'INVOICE' ? 'sales_invoices' : entityType === 'BILL' ? 'supplier_bills' : entityType === 'INVOICE_PAYMENT' ? 'invoice_payments' : 'bill_payments';
 const source = await trx.selectFrom(table).select('id').where('tenant_id','=',tenantId).where('id','=',entityId).executeTakeFirst();
 if (!source) throw new Error('Accounting sync source does not belong to this workspace.');
 const connections = await trx.selectFrom('accounting_integrations').select(['provider','provider_org_id'])
  .where('tenant_id','=',tenantId).where('status','=','CONNECTED').where('provider','in',['QUICKBOOKS','XERO']).execute();
 for (const connection of connections) await trx.insertInto('finance_accounting_outbox').values({
  tenant_id:tenantId,provider:connection.provider as 'QUICKBOOKS'|'XERO',provider_org_id:connection.provider_org_id || '',entity_type:entityType,entity_id:entityId,
 }).onConflict(oc=>oc.columns(['tenant_id','provider','provider_org_id','entity_type','entity_id']).doNothing()).execute();
}

export async function processAccountingSyncTask(tenantId: string, taskId: string): Promise<void> {
 const task = await withTenant(tenantId, async trx => {
  const row=await trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenantId).where('id','=',taskId).forUpdate().skipLocked().executeTakeFirst();
  if (!row || !['PENDING','RETRY','RUNNING'].includes(row.status)) return null;
  if (row.status==='RUNNING') {
   if (new Date(row.updated_at).getTime()>Date.now()-5*60_000) return null;
   const log=await trx.selectFrom('accounting_sync_logs').select(['status','external_id']).where('tenant_id','=',tenantId).where('provider','=',row.provider)
    .where('entity_type','=',row.entity_type.endsWith('_PAYMENT')?'PAYMENT':row.entity_type as 'INVOICE'|'BILL').where('entity_id','=',row.entity_id).orderBy(sql`CASE WHEN status='SUCCESS' AND external_id IS NOT NULL THEN 0 WHEN error_message LIKE 'RECONCILIATION_REQUIRED:%' THEN 1 ELSE 2 END`).orderBy('synced_at','desc').executeTakeFirst();
   // An expired lease might have reached the provider before the process stopped.
   await trx.updateTable('finance_accounting_outbox').set({status:log?.status==='SUCCESS'&&log.external_id?'SUCCESS':'RECONCILE',last_error:log?.status==='SUCCESS'&&log.external_id?null:'Worker stopped during delivery; reconcile before resubmitting.',updated_at:new Date()}).where('tenant_id','=',tenantId).where('id','=',taskId).execute();
   return null;
  }
  if (new Date(row.next_attempt_at).getTime()>Date.now()) return null;
  return trx.updateTable('finance_accounting_outbox').set({status:'RUNNING',attempts:row.attempts+1,updated_at:new Date()}).where('tenant_id','=',tenantId).where('id','=',taskId).returningAll().executeTakeFirstOrThrow();
 });
 if (!task) return;
 let status: 'SUCCESS'|'RETRY'|'RECONCILE'|'FAILED'='FAILED'; let error: string|null=null;
 try {
  if (!(await tenantHasEnabledFinanceCapability(tenantId,'finance.core'))) throw new Error('Core Finance is not available for this workspace.');
  const connection=await withTenant(tenantId,trx=>trx.selectFrom('accounting_integrations').select(['status','provider_org_id']).where('tenant_id','=',tenantId).where('provider','=',task.provider).executeTakeFirst());
  if (!task.provider_org_id || !connection || connection.status!=='CONNECTED' || connection.provider_org_id!==task.provider_org_id) {
   status='RECONCILE'; error='Provider connection changed or disconnected; review the queued destination.';
  } else {
   if(task.entity_type==='INVOICE') await AccountingIntegrationService.syncInvoice(tenantId,task.entity_id,task.provider);
   else if(task.entity_type==='BILL') await AccountingIntegrationService.syncBill(tenantId,task.entity_id,task.provider);
   else await AccountingIntegrationService.syncPayment(tenantId,task.entity_id,task.entity_type==='INVOICE_PAYMENT'?'INVOICE':'BILL',task.provider);
   const log=await withTenant(tenantId,trx=>trx.selectFrom('accounting_sync_logs').select(['status','external_id','error_message']).where('tenant_id','=',tenantId).where('provider','=',task.provider)
    .where('entity_type','=',task.entity_type.endsWith('_PAYMENT')?'PAYMENT':task.entity_type as 'INVOICE'|'BILL').where('entity_id','=',task.entity_id).orderBy(sql`CASE WHEN status='SUCCESS' AND external_id IS NOT NULL THEN 0 WHEN error_message LIKE 'RECONCILIATION_REQUIRED:%' THEN 1 ELSE 2 END`).orderBy('synced_at','desc').executeTakeFirst());
   if(log?.status==='SUCCESS'&&log.external_id) status='SUCCESS';
   else if(log?.error_message?.startsWith('RECONCILIATION_REQUIRED:')) {status='RECONCILE';error=log.error_message;}
   else if(log?.status==='FAILED') {
    error=log.error_message || 'Provider preflight failed.';
    status=task.provider==='QUICKBOOKS'&&['BILL','BILL_PAYMENT'].includes(task.entity_type)?'FAILED':task.attempts<5?'RETRY':'FAILED';
   } else {status='FAILED';error='No source record or delivery result was found.';}
  }
 } catch (cause) {
  // An unexpected failure can happen after a provider write/local commit failure.
  status='RECONCILE';error=cause instanceof Error?cause.message:'Unknown delivery failure; reconcile before retrying.';
 }
 await withTenant(tenantId,trx=>trx.updateTable('finance_accounting_outbox').set({status,last_error:error,updated_at:new Date(),next_attempt_at:new Date(Date.now()+Math.min(2**task.attempts,60)*60_000)})
  .where('tenant_id','=',tenantId).where('id','=',taskId).where('status','=','RUNNING').where('attempts','=',task.attempts).execute());
}

export async function runAccountingOutboxJob(): Promise<void> {
 // Narrow platform enumeration for scheduling; all claims and deliveries use tenant transactions.
 const due=await dbPlatform.selectFrom('finance_accounting_outbox').select(['id','tenant_id'])
  .where(sql<boolean>`(status IN ('PENDING','RETRY') AND next_attempt_at<=now()) OR (status='RUNNING' AND updated_at<now()-interval '5 minutes')`)
  .orderBy('next_attempt_at').orderBy('id').limit(50).execute();
 for(const task of due) await processAccountingSyncTask(task.tenant_id,task.id);
}
