import { it, expect } from 'vitest';
import { withTenant } from '../db/client.js';
import { createTestTenant, getApp, authHeaders } from './helpers.js';

it('recurring bill pages are bounded and totals keep unlike currencies separate',async()=>{
 const tenant=await createTestTenant('FINANCE');const other=await createTestTenant('FINANCE');
 try{
  await withTenant(tenant.tenantId,async trx=>{
   await trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute();
   for(let index=0;index<26;index++)await trx.insertInto('recurring_bills').values({tenant_id:tenant.tenantId,name:`Template ${index}`,frequency:'MONTHLY',currency:index<24?'TZS':'USD',amount:100,tax_rate:0,state:'ACTIVE',bills_generated:index}).execute();
  });
  await withTenant(other.tenantId,trx=>trx.insertInto('recurring_bills').values({tenant_id:other.tenantId,name:'Foreign template',amount:999999,currency:'TZS'}).execute());
  const app=await getApp();const headers=authHeaders(tenant.token);
  const first=await app.inject({method:'GET',url:'/v1/bills/recurring?page=1&page_size=25',headers});
  expect(first.statusCode).toBe(200);const a=first.json();expect(a.items).toHaveLength(25);expect(a.total).toBe(26);expect(a.summary.active).toBe(26);expect(a.summary.generated).toBe(325);
  expect(a.summary.monthly).toEqual(expect.arrayContaining([{currency:'TZS',amount:2400},{currency:'USD',amount:200}]));
  const second=(await app.inject({method:'GET',url:'/v1/bills/recurring?page=2&page_size=25',headers})).json();
  expect(second.items).toHaveLength(1);expect(a.items.some((row:{id:string})=>row.id===second.items[0].id)).toBe(false);
  expect((await app.inject({method:'GET',url:'/v1/bills/recurring?page=1&page_size=101',headers})).statusCode).toBe(400);
  expect((await app.inject({method:'GET',url:'/v1/bills/recurring',headers})).json()).toHaveLength(26);
 }finally{await tenant.cleanup();await other.cleanup();}
},120000);
