import { it, expect } from 'vitest';
import { withTenant } from '../db/client.js';
import { createTestTenant, getApp, authHeaders } from './helpers.js';
it('invoice payment links require sign-in, enforce customer ownership and keep providers unavailable',async()=>{
 const app=await getApp();const tenant=await createTestTenant();const other=await createTestTenant();
 try {
  const customerUser=await tenant.addUser('CUSTOMER');const wrongCustomer=await tenant.addUser('CUSTOMER');
  const ids=await withTenant(tenant.tenantId,async trx=>{
   await trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({enabledApps:['finops','crm']})}).onConflict(oc=>oc.column('tenant_id').doUpdateSet({settings:JSON.stringify({enabledApps:['finops','crm']})})).execute();
   const customer=await trx.insertInto('customers').values({tenant_id:tenant.tenantId,name:'Payment Customer'}).returning('id').executeTakeFirstOrThrow();
   await trx.updateTable('users').set({customer_id:customer.id}).where('tenant_id','=',tenant.tenantId).where('id','=',customerUser.userId).execute();
   const invoice=await trx.insertInto('sales_invoices').values({tenant_id:tenant.tenantId,invoice_number:'INV-PAY-LINK',customer_id:customer.id,client_name:'Payment Customer',status:'Unpaid',currency:'USD',exchange_rate:1,received:25} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('sales_invoice_lines').values({invoice_id:invoice.id,name:'Payment service',qty:1,rate:100,tax_pct:0,currency:'USD'} as any).execute();
   const draft=await trx.insertInto('sales_invoices').values({tenant_id:tenant.tenantId,invoice_number:'INV-PAY-DRAFT',status:'Draft'} as any).returning('id').executeTakeFirstOrThrow();return {invoice:invoice.id,draft:draft.id};
  });
  const created=await app.inject({method:'POST',url:`/v1/invoices/${ids.invoice}/payment-link`,headers:authHeaders(tenant.token)});expect(created.statusCode).toBe(200);expect(created.json().path).toBe(`/pay/invoice/${ids.invoice}`);
  expect((await app.inject({method:'POST',url:`/v1/invoices/${ids.draft}/payment-link`,headers:authHeaders(tenant.token)})).statusCode).toBe(409);
  const url=`/v1/invoice-payment/${ids.invoice}`;
  expect((await app.inject({method:'GET',url})).statusCode).toBe(401);
  const summary=await app.inject({method:'GET',url,headers:authHeaders(customerUser.token)});expect(summary.statusCode).toBe(200);expect(summary.json().balance).toBe(75);expect(summary.json().providers.every((p:any)=>p.available===false)).toBe(true);expect(summary.headers['cache-control']).toBe('no-store');
  for(const suffix of ['', '/pdf']) {
   expect((await app.inject({method:'GET',url:url+suffix,headers:authHeaders(wrongCustomer.token)})).statusCode).toBe(404);
   expect([403,404]).toContain((await app.inject({method:'GET',url:url+suffix,headers:authHeaders(other.token)})).statusCode);
  }
  const pdf=await app.inject({method:'GET',url:url+'/pdf',headers:authHeaders(customerUser.token)});expect(pdf.statusCode).toBe(200);expect(pdf.rawPayload.subarray(0,4).toString()).toBe('%PDF');
 }finally{await tenant.cleanup();await other.cleanup();}
},120000);
