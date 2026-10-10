import { it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { withTenant } from '../db/client.js';
import { createTestTenant, getApp, authHeaders } from './helpers.js';

it('catalog pagination preserves search, stable ordering, currency totals and tenant isolation',async()=>{
 const tenant=await createTestTenant('FINANCE');const other=await createTestTenant('FINANCE');
 try{
  await withTenant(tenant.tenantId,async trx=>{
   await trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute();
   await trx.insertInto('products').values(Array.from({length:30},(_,index)=>({id:randomUUID(),tenant_id:tenant.tenantId,code:`CAT-${index}`,name:`Item ${String(index).padStart(2,'0')}`,description:index===29?'literal 10% fee':'service',category:index<20?'FREIGHT':'OTHER',type:'product',status:index<28?'active':'inactive',currency:index<20?'TZS':'USD',sale_price:index<20?100:10,track_inventory:true,stock_quantity:2,low_stock_threshold:5}))).execute();
  });
  await withTenant(other.tenantId,trx=>trx.insertInto('products').values({id:randomUUID(),tenant_id:other.tenantId,name:'Foreign item',code:'FOREIGN',sale_price:999999}).execute());
  const app=await getApp();const headers=authHeaders(tenant.token);
  const a=(await app.inject({method:'GET',url:'/v1/products?page=1&page_size=25&sort=name&direction=asc',headers})).json();
  expect(a.total).toBe(30);expect(a.items).toHaveLength(25);expect(a.items[0].name).toBe('Item 00');
  const b=(await app.inject({method:'GET',url:'/v1/products?page=2&page_size=25&sort=name&direction=asc',headers})).json();
  expect(b.items).toHaveLength(5);expect(b.items.some((row:{id:string})=>a.items.some((first:{id:string})=>first.id===row.id))).toBe(false);
  const filtered=(await app.inject({method:'GET',url:'/v1/products?page=1&category=OTHER&status=inactive&search=10%25',headers})).json();expect(filtered.total).toBe(1);expect(filtered.items[0].name).toBe('Item 29');
  expect((await app.inject({method:'GET',url:'/v1/products?page=1&page_size=101',headers})).statusCode).toBe(400);
  expect((await app.inject({method:'GET',url:'/v1/products',headers})).json()).toHaveLength(30);
  const customer=await withTenant(tenant.tenantId,trx=>trx.insertInto('customers').values({tenant_id:tenant.tenantId,name:'Contract customer'}).returning('id').executeTakeFirstOrThrow());
  const foreignCustomer=await withTenant(other.tenantId,trx=>trx.insertInto('customers').values({tenant_id:other.tenantId,name:'Foreign customer'}).returning('id').executeTakeFirstOrThrow());
  await withTenant(tenant.tenantId,trx=>trx.insertInto('customer_product_prices').values({tenant_id:tenant.tenantId,customer_id:customer.id,product_id:a.items[0].id,price:75,currency:'TZS'}).execute());
  const priced=(await app.inject({method:'GET',url:`/v1/products?page=1&page_size=1&sort=name&direction=asc&customer_id=${customer.id}`,headers})).json();
  expect(priced.items[0].sale_price).toBe(75);expect(Number(priced.items[0].list_price)).toBe(100);expect(priced.items[0].has_agreed_price).toBe(true);
  expect((await app.inject({method:'GET',url:`/v1/products?page=1&customer_id=${foreignCustomer.id}`,headers})).statusCode).toBe(404);
  expect((await app.inject({method:'GET',url:`/v1/products?page=1&search=no-match&customer_id=${foreignCustomer.id}`,headers})).statusCode).toBe(404);
  const stats=(await app.inject({method:'GET',url:'/v1/products/stats',headers})).json();expect(stats.total).toBe(30);expect(stats.active).toBe(28);expect(stats.low_stock).toBe(30);
  expect(stats.currencies).toEqual([{currency:'TZS',average_price:100,inventory_value:4000},{currency:'USD',average_price:10,inventory_value:200}]);
 }finally{await tenant.cleanup();await other.cleanup();}
},120000);
