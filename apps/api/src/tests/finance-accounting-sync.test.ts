import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { withTenant } from '../db/client.js';
import { AccountingIntegrationService, getAdapter } from '../services/accounting-integration.service.js';
import { getApp, authHeaders, createTestTenant, type TestTenant } from './helpers.js';
let tenant: TestTenant;
beforeAll(async () => {
 tenant = await createTestTenant('FINANCE');
 await withTenant(tenant.tenantId, trx => trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute());
 await withTenant(tenant.tenantId, trx => trx.insertInto('accounting_integrations').values({tenant_id:tenant.tenantId,provider:'QUICKBOOKS',status:'CONNECTED'}).execute());
},120000);
afterAll(async () => {vi.restoreAllMocks();if(tenant) await tenant.cleanup();},120000);
async function invoice() {
 return withTenant(tenant.tenantId, async trx => {
  const row = await trx.insertInto('sales_invoices').values({tenant_id:tenant.tenantId,invoice_number:crypto.randomUUID(),client_address:'[]',status:'Unpaid',currency:'TZS',created_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();
  await trx.insertInto('sales_invoice_lines').values({invoice_id:row.id,name:'Service',rate:100,qty:1,tax_pct:0,line_group:'other',currency:'TZS'}).execute();
  await trx.insertInto('accounting_integration_entity_map').values({tenant_id:tenant.tenantId,provider:'QUICKBOOKS',local_type:'customer',local_id:row.id,external_id:'customer-1'}).execute();
  return row.id;
 });
}
it('accounting provider sync serializes concurrent creates and skips confirmed documents', async () => {
 const id = await invoice();
 const token = vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-only'});
 const network = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({Invoice:{Id:'external-1'}}),{status:200}));
 try {
  await Promise.all([AccountingIntegrationService.syncInvoice(tenant.tenantId,id),AccountingIntegrationService.syncInvoice(tenant.tenantId,id)]);
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  expect(network).toHaveBeenCalledTimes(1);
  await withTenant(tenant.tenantId, async trx => {expect(await trx.selectFrom('accounting_sync_logs').select('id').where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).where('status','=','SUCCESS').execute()).toHaveLength(1);});
 } finally {network.mockRestore();token.mockRestore();}
},120000);
it('accounting provider does not record unconfirmed response as a successful sync', async () => {
 const id = await invoice();
 const token = vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-only'});
 const network = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));
 try {
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  expect(network).toHaveBeenCalledTimes(1);
  await withTenant(tenant.tenantId, async trx => {
   const logs = await trx.selectFrom('accounting_sync_logs').selectAll().where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).execute();
   expect(logs).toHaveLength(1);expect(logs[0].status).toBe('FAILED');expect(logs[0].error_message).toContain('reconcile');
  });
 } finally {network.mockRestore();token.mockRestore();}
},120000);
it('accounting provider refuses unsupported QuickBooks supplier exports without transmitting', async () => {
 const ids = await withTenant(tenant.tenantId, async trx => {
  const bill=await trx.insertInto('supplier_bills').values({tenant_id:tenant.tenantId,bill_number:crypto.randomUUID(),status:'POSTED',currency:'TZS',total:100,created_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();
  const payment=await trx.insertInto('bill_payments').values({tenant_id:tenant.tenantId,bill_id:bill.id,amount:10,currency:'TZS',method:'Bank Transfer',created_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();
  return {bill:bill.id,payment:payment.id};
 });
 const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected provider transmission'));
 try {
  await AccountingIntegrationService.syncBill(tenant.tenantId,ids.bill);
  await AccountingIntegrationService.syncPayment(tenant.tenantId,ids.payment,'BILL');
  expect(network).not.toHaveBeenCalled();
  await withTenant(tenant.tenantId, async trx => {const logs=await trx.selectFrom('accounting_sync_logs').selectAll().where('tenant_id','=',tenant.tenantId).where('entity_id','in',[ids.bill,ids.payment]).execute();expect(logs).toHaveLength(2);expect(logs.every(l=>l.status==='FAILED')).toBe(true);});
 } finally {network.mockRestore();}
},120000);

it('accounting provider invoice amount uses the canonical document-currency calculation', async () => {
 const id = await invoice();
 await withTenant(tenant.tenantId, async trx => {
  await trx.updateTable('sales_invoices').set({exchange_rate:2500}).where('tenant_id','=',tenant.tenantId).where('id','=',id).execute();
  await trx.updateTable('sales_invoice_lines').set({currency:'USD',tax_pct:18}).where('invoice_id','=',id).execute();
 });
 const token = vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-only'});
 const network = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({Invoice:{Id:'external-fx'}}),{status:200}));
 try {
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  const body = JSON.parse(String(network.mock.calls[0][1]?.body));
  expect(body.Line[0].Amount).toBe(295000);expect(body.CurrencyRef.value).toBe('TZS');
 } finally {network.mockRestore();token.mockRestore();}
},120000);

it('accounting provider status and logs deny non-Finance readers', async () => {
 const app=await getApp();const employee=await tenant.addUser('JUNIOR');
 expect((await app.inject({method:'GET',url:'/v1/accounting-integrations',headers:authHeaders(employee.token)})).statusCode).toBe(403);
 expect((await app.inject({method:'GET',url:'/v1/accounting-integrations',headers:authHeaders(tenant.token)})).statusCode).toBe(200);
},120000);

it('accounting provider network uncertainty blocks automatic resubmission', async () => {
 const id=await invoice();
 const token=vi.spyOn(AccountingIntegrationService,'getValidAccessToken').mockResolvedValue({accessToken:'test-only',orgId:'test-only'});
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Connection lost after submission'));
 try {
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  await AccountingIntegrationService.syncInvoice(tenant.tenantId,id);
  expect(network).toHaveBeenCalledTimes(1);
  await withTenant(tenant.tenantId,async trx=>{const log=await trx.selectFrom('accounting_sync_logs').select('error_message').where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).executeTakeFirstOrThrow();expect(log.error_message).toContain('RECONCILIATION_REQUIRED:');});
 } finally {network.mockRestore();token.mockRestore();}
},120000);

it('Xero document adapters explicitly retain invoice and bill currency', () => {
 const adapter=getAdapter('XERO');const args={contactExternalId:'contact',number:'DOC-1',date:'2026-10-08',total:100,currency:'TZS',description:'Service'};
 expect((adapter.createInvoiceBody(args) as any).Invoices[0].CurrencyCode).toBe('TZS');
 expect((adapter.createBillBody({...args,currency:'USD'}) as any).Invoices[0].CurrencyCode).toBe('USD');
});
