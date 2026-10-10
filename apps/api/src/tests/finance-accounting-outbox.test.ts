import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import { AccountingIntegrationService } from '../services/accounting-integration.service.js';
import * as outbox from '../services/accounting-outbox.service.js';
import { enqueueAccountingSync, processAccountingSyncTask } from '../services/accounting-outbox.service.js';
import { getApp, authHeaders, createTestTenant, type TestTenant } from './helpers.js';
let tenant: TestTenant;
beforeAll(async()=>{
 tenant=await createTestTenant('FINANCE');
 await withTenant(tenant.tenantId,async trx=>{
  await trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute();
  await GLService.seedChartOfAccounts(trx,tenant.tenantId);
  await trx.insertInto('accounting_integrations').values({tenant_id:tenant.tenantId,provider:'QUICKBOOKS',provider_org_id:'test-org',status:'CONNECTED'}).execute();
 });
},120000);
afterAll(async()=>{vi.restoreAllMocks();if(tenant) await tenant.cleanup();},120000);
async function source(){return withTenant(tenant.tenantId,async trx=>{
 const invoice=await trx.insertInto('sales_invoices').values({tenant_id:tenant.tenantId,invoice_number:crypto.randomUUID(),client_address:'[]',currency:'TZS',status:'Unpaid',created_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();
 await trx.insertInto('sales_invoice_lines').values({invoice_id:invoice.id,name:'Service',rate:100,qty:1,tax_pct:0,currency:'TZS',line_group:'other'}).execute();
 await trx.insertInto('accounting_integration_entity_map').values({tenant_id:tenant.tenantId,provider:'QUICKBOOKS',local_type:'customer',local_id:invoice.id,external_id:'customer-1'}).execute();
 return invoice.id;
});}
async function queue(id:string){return withTenant(tenant.tenantId,async trx=>{await enqueueAccountingSync(trx,tenant.tenantId,'INVOICE',id);return trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).executeTakeFirstOrThrow();});}
async function task(id:string){return withTenant(tenant.tenantId,trx=>trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenant.tenantId).where('id','=',id).executeTakeFirstOrThrow());}
it('Xero invoice reconciliation requires matching provider evidence and records an audit',async()=>{
 const invoiceId=await source();const externalId=crypto.randomUUID();
 const seeded=await withTenant(tenant.tenantId,async trx=>{
  await trx.insertInto('accounting_integrations').values({tenant_id:tenant.tenantId,provider:'XERO',provider_org_id:'xero-test',status:'CONNECTED'}).onConflict(oc=>oc.columns(['tenant_id','provider']).doUpdateSet({provider_org_id:'xero-test',status:'CONNECTED'})).execute();
  await trx.insertInto('accounting_integration_entity_map').values({tenant_id:tenant.tenantId,provider:'XERO',local_type:'customer',local_id:invoiceId,external_id:'contact-test'}).execute();
  const invoice=await trx.selectFrom('sales_invoices').select('invoice_number').where('tenant_id','=',tenant.tenantId).where('id','=',invoiceId).executeTakeFirstOrThrow();
  const pending=await trx.insertInto('finance_accounting_outbox').values({tenant_id:tenant.tenantId,provider:'XERO',provider_org_id:'xero-test',entity_type:'INVOICE',entity_id:invoiceId,status:'RECONCILE'}).returning('id').executeTakeFirstOrThrow();
  return {number:invoice.invoice_number,id:pending.id};
 });
 const token=vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'xero-test'});
 let total=99;
 let mismatch: Record<string,unknown> = {};
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({Invoices:[{InvoiceID:externalId,InvoiceNumber:seeded.number,Type:'ACCREC',Status:'AUTHORISED',CurrencyCode:'TZS',Total:total,Contact:{ContactID:'contact-test'},...mismatch}]}),{status:200}));
 try{
  const app=await getApp();
  const endpoint=`/v1/accounting-integrations/deliveries/${seeded.id}/reconcile`;
  expect((await app.inject({method:'POST',url:endpoint,headers:authHeaders(tenant.token),payload:{external_id:externalId}})).statusCode).toBe(409);
  expect((await task(seeded.id)).status).toBe('RECONCILE');
  total=100;
  for (const invalid of [{Type:'ACCPAY'},{Status:'VOIDED'},{InvoiceNumber:'wrong'},{CurrencyCode:'USD'},{Contact:{ContactID:'wrong'}}]) {
   mismatch=invalid;
   expect((await app.inject({method:'POST',url:endpoint,headers:authHeaders(tenant.token),payload:{external_id:externalId}})).statusCode).toBe(409);
   expect((await task(seeded.id)).status).toBe('RECONCILE');
  }
  mismatch={};
  expect((await app.inject({method:'POST',url:endpoint,headers:authHeaders(tenant.token),payload:{external_id:externalId}})).statusCode).toBe(200);
  expect((await task(seeded.id)).status).toBe('SUCCESS');
  await withTenant(tenant.tenantId,async trx=>expect(await trx.selectFrom('invoice_activity_log').select('id').where('tenant_id','=',tenant.tenantId).where('invoice_id','=',invoiceId).where('action','=','accounting_sync_reconciled').execute()).toHaveLength(1));
  expect((await app.inject({method:'POST',url:endpoint,headers:authHeaders(tenant.token),payload:{external_id:externalId}})).statusCode).toBe(409);
  expect(network).toHaveBeenCalledTimes(7);
  expect(network.mock.calls.every(call=>!(call[1] as RequestInit)?.method || (call[1] as RequestInit).method==='GET')).toBe(true);
 } finally {network.mockRestore();token.mockRestore();await withTenant(tenant.tenantId,trx=>trx.updateTable('accounting_integrations').set({status:'DISCONNECTED'}).where('tenant_id','=',tenant.tenantId).where('provider','=','XERO').execute());}
},120000);
it('outbox enqueue rolls back with the financial transaction and deduplicates',async()=>{
 const id=await source();
 await expect(withTenant(tenant.tenantId,async trx=>{await enqueueAccountingSync(trx,tenant.tenantId,'INVOICE',id);throw new Error('Rollback');})).rejects.toThrow('Rollback');
 await withTenant(tenant.tenantId,async trx=>expect(await trx.selectFrom('finance_accounting_outbox').select('id').where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).execute()).toHaveLength(0));
 const first=await queue(id);expect((await queue(id)).id).toBe(first.id);
},120000);
it('outbox competing workers deliver once and persist success',async()=>{
 const pending=await queue(await source());
 const token=vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-org'});
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({Invoice:{Id:'provider-1'}}),{status:200}));
 try{await Promise.all([processAccountingSyncTask(tenant.tenantId,pending.id),processAccountingSyncTask(tenant.tenantId,pending.id)]);expect(network).toHaveBeenCalledTimes(1);expect((await task(pending.id)).status).toBe('SUCCESS');}
 finally{network.mockRestore();token.mockRestore();}
},120000);
it('outbox preflight failures back off and exhaust five attempts',async()=>{
 const pending=await queue(await source());
 const token=vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockRejectedValue(new Error('Token unavailable'));
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected transmission'));
 try{
  for(let attempt=1;attempt<=5;attempt++){
   await processAccountingSyncTask(tenant.tenantId,pending.id);const row=await task(pending.id);
   expect(row.attempts).toBe(attempt);expect(row.status).toBe(attempt<5?'RETRY':'FAILED');expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
   await withTenant(tenant.tenantId,trx=>trx.updateTable('finance_accounting_outbox').set({next_attempt_at:new Date(0)}).where('tenant_id','=',tenant.tenantId).where('id','=',pending.id).execute());
  }
  expect(network).not.toHaveBeenCalled();
 }finally{network.mockRestore();token.mockRestore();}
},120000);
it('outbox uncertain provider writes require reconciliation without redelivery',async()=>{
 const pending=await queue(await source());
 const token=vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-org'});
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Connection lost'));
 try{await processAccountingSyncTask(tenant.tenantId,pending.id);await processAccountingSyncTask(tenant.tenantId,pending.id);expect(network).toHaveBeenCalledTimes(1);expect((await task(pending.id)).status).toBe('RECONCILE');}
 finally{network.mockRestore();token.mockRestore();}
},120000);
it('outbox expired workers recover confirmed outcomes and quarantine unknown outcomes',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected transmission'));
 try{for(const confirmed of [false,true]){
  const pending=await queue(await source());
  await withTenant(tenant.tenantId,async trx=>{
   await trx.updateTable('finance_accounting_outbox').set({status:'RUNNING',attempts:1,updated_at:new Date(Date.now()-6*60_000)}).where('tenant_id','=',tenant.tenantId).where('id','=',pending.id).execute();
   if(confirmed)await trx.insertInto('accounting_sync_logs').values({tenant_id:tenant.tenantId,provider:'QUICKBOOKS',entity_type:'INVOICE',entity_id:pending.entity_id,status:'SUCCESS',external_id:'confirmed'}).execute();
  });
  await processAccountingSyncTask(tenant.tenantId,pending.id);expect((await task(pending.id)).status).toBe(confirmed?'SUCCESS':'RECONCILE');
 }expect(network).not.toHaveBeenCalled();}finally{network.mockRestore();}
},120000);
it('outbox rejects foreign sources and does not deliver foreign tasks',async()=>{
 const other=await createTestTenant('FINANCE');const pending=await queue(await source());
 try{
  await expect(withTenant(other.tenantId,trx=>enqueueAccountingSync(trx,other.tenantId,'INVOICE',pending.entity_id))).rejects.toThrow('does not belong');
  await processAccountingSyncTask(other.tenantId,pending.id);expect((await task(pending.id)).status).toBe('PENDING');
 }finally{await other.cleanup();}
},120000);
it('payment API queues the persisted payment ID exactly once on retry',async()=>{
 const app=await getApp();const id=await source();const key=crypto.randomUUID();
 for(let i=0;i<2;i++)expect((await app.inject({method:'POST',url:`/v1/invoices/${id}/payment`,headers:{...authHeaders(tenant.token),'idempotency-key':key},payload:{amount:10,method:'Bank Transfer'}})).statusCode).toBe(200);
 await withTenant(tenant.tenantId,async trx=>{
  const payment=await trx.selectFrom('invoice_payments').select('id').where('tenant_id','=',tenant.tenantId).where('invoice_id','=',id).executeTakeFirstOrThrow();
  const jobs=await trx.selectFrom('finance_accounting_outbox').selectAll().where('tenant_id','=',tenant.tenantId).where('entity_type','=','INVOICE_PAYMENT').where('entity_id','=',payment.id).execute();
  expect(jobs).toHaveLength(1);expect(jobs[0].entity_id).not.toBe(id);
 });
},120000);

it('delivery register is paginated and permissions/retry rules protect uncertain outcomes',async()=>{
 const app=await getApp();const pending=await queue(await source());
 const junior=await tenant.addUser('JUNIOR');
 expect((await app.inject({method:'GET',url:'/v1/accounting-integrations/deliveries',headers:authHeaders(junior.token)})).statusCode).toBe(403);
 const read=await app.inject({method:'GET',url:'/v1/accounting-integrations/deliveries?page=1&page_size=2',headers:authHeaders(tenant.token)});expect(read.statusCode).toBe(200);expect(read.json().items).toHaveLength(2);expect(read.json().total).toBeGreaterThan(2);
 expect((await app.inject({method:'GET',url:'/v1/accounting-integrations/deliveries?page_size=101',headers:authHeaders(tenant.token)})).statusCode).toBe(400);
 const retry=()=>app.inject({method:'POST',url:`/v1/accounting-integrations/deliveries/${pending.id}/retry`,headers:authHeaders(tenant.token)});
 await withTenant(tenant.tenantId,trx=>trx.updateTable('finance_accounting_outbox').set({status:'RECONCILE'}).where('tenant_id','=',tenant.tenantId).where('id','=',pending.id).execute());
 expect((await retry()).statusCode).toBe(409);
 await withTenant(tenant.tenantId,trx=>trx.updateTable('finance_accounting_outbox').set({status:'FAILED',attempts:5}).where('tenant_id','=',tenant.tenantId).where('id','=',pending.id).execute());
 expect((await retry()).statusCode).toBe(200);expect((await task(pending.id)).status).toBe('PENDING');
 await withTenant(tenant.tenantId,async trx=>expect(await trx.selectFrom('invoice_activity_log').select('id').where('tenant_id','=',tenant.tenantId).where('invoice_id','=',pending.entity_id).where('action','=','accounting_sync_retry').execute()).toHaveLength(1));
 expect((await app.inject({method:'POST',url:`/v1/accounting-integrations/deliveries/${pending.id}/retry`,headers:authHeaders(junior.token)})).statusCode).toBe(403);
},120000);

it('payment and ledger roll back when durable enqueue fails after insertion',async()=>{
 const app=await getApp();const id=await source();const original=outbox.enqueueAccountingSync;
 const spy=vi.spyOn(outbox,'enqueueAccountingSync').mockImplementation(async(...args)=>{await original(...args);throw new Error('Injected outbox failure');});
 try{expect((await app.inject({method:'POST',url:`/v1/invoices/${id}/payment`,headers:authHeaders(tenant.token),payload:{amount:10,method:'Bank Transfer'}})).statusCode).toBe(500);}finally{spy.mockRestore();}
 await withTenant(tenant.tenantId,async trx=>{
  expect(await trx.selectFrom('invoice_payments').select('id').where('tenant_id','=',tenant.tenantId).where('invoice_id','=',id).execute()).toHaveLength(0);
  expect(await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',id).execute()).toHaveLength(0);
  expect(await trx.selectFrom('finance_accounting_outbox').select('id').where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).execute()).toHaveLength(0);
 });
},120000);

it('outbox never retargets a queued delivery to a changed provider organization',async()=>{
 const pending=await queue(await source());
 await withTenant(tenant.tenantId,trx=>trx.updateTable('finance_accounting_outbox').set({provider_org_id:'previous-organization'}).where('tenant_id','=',tenant.tenantId).where('id','=',pending.id).execute());
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected transmission'));
 try{await processAccountingSyncTask(tenant.tenantId,pending.id);expect(network).not.toHaveBeenCalled();expect((await task(pending.id)).status).toBe('RECONCILE');}finally{network.mockRestore();}
},120000);
