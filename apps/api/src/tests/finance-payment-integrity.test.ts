import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import { registerSubscriber } from '../services/domain-events.service.js';
import { generateDueBills, generateDueInvoices } from '../services/recurring-documents.service.js';
import { GLService } from '../services/gl.service.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
let tenant: TestTenant;
const delivered: string[] = [];
registerSubscriber('invoice.payment_recorded', async (tenantId, event) => { if (tenantId === tenant?.tenantId && event.entityId) delivered.push(event.entityId); });
registerSubscriber('bill.payment_recorded', async (tenantId, event) => { if (tenantId === tenant?.tenantId && event.entityId) delivered.push(event.entityId); });
beforeAll(async () => {
 tenant = await createTestTenant('FINANCE');
 await withTenant(tenant.tenantId, async trx => {
  await trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId, settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute();
  await GLService.seedChartOfAccounts(trx,tenant.tenantId);
 });
},120000);
afterAll(async () => { vi.restoreAllMocks(); if(tenant) await tenant.cleanup(); },120000);
async function invoice() {
 return withTenant(tenant.tenantId,async trx=>{
  const row=await sql<{id:string}>`insert into sales_invoices (tenant_id,invoice_number,status,currency,created_by) values (${tenant.tenantId},${crypto.randomUUID()},'Unpaid','TZS',${tenant.userId}) returning id`.execute(trx);
  const id=row.rows[0].id;
  await sql`insert into sales_invoice_lines (invoice_id,name,rate,qty,tax_pct,line_group,currency) values (${id},'Service',1000,1,0,'other','TZS')`.execute(trx);
  return id;
 });
}
async function pay(id:string,key:string,amount=100) {
 const app=await getApp();return app.inject({method:'POST',url:`/v1/invoices/${id}/payment`,headers:{...authHeaders(tenant.token),'idempotency-key':key},payload:{amount,method:'Bank Transfer'}});
}
it('concurrent redelivery records one payment and rejects changed amounts',async()=>{
 const id=await invoice();const key=crypto.randomUUID();const results=await Promise.all([pay(id,key),pay(id,key)]);
 expect(results.map(r=>r.statusCode)).toEqual([200,200]);
 expect((await pay(id,key,101)).statusCode).toBe(409);
 const rows=await withTenant(tenant.tenantId,trx=>trx.selectFrom('invoice_payments').selectAll().where('tenant_id','=',tenant.tenantId).where('invoice_id','=',id).execute());
 expect(rows).toHaveLength(1);
 expect(delivered.filter(entityId => entityId === id)).toHaveLength(1);
},120000);
it('a failure after ledger posting rolls back both the payment and journal',async()=>{
 const id=await invoice();const original=GLService.post;
 const spy=vi.spyOn(GLService,'post').mockImplementation(async (...args)=>{await original.apply(GLService,args);throw new Error('Injected posting failure');});
 try { expect((await pay(id,crypto.randomUUID())).statusCode).toBe(500); } finally {spy.mockRestore();}
 expect(delivered).not.toContain(id);
 await withTenant(tenant.tenantId,async trx=>{
  expect(await trx.selectFrom('domain_events').select('id').where('tenant_id','=',tenant.tenantId).where('entity_id','=',id).execute()).toHaveLength(0);
  expect(await trx.selectFrom('invoice_payments').select('id').where('tenant_id','=',tenant.tenantId).where('invoice_id','=',id).execute()).toHaveLength(0);
  expect(await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',id).execute()).toHaveLength(0);
 });
},120000);
it('supplier payment retries are deduplicated and posting failure is atomic',async()=>{
 const app=await getApp();
 const create=async()=>withTenant(tenant.tenantId,async trx=>{
  const result=await sql<{id:string}>`insert into supplier_bills (tenant_id,bill_number,status,currency,total,created_by) values (${tenant.tenantId},${crypto.randomUUID()},'POSTED','TZS',1000,${tenant.userId}) returning id`.execute(trx);return result.rows[0].id;
 });
 const payment=async(id:string,key:string)=>app.inject({method:'POST',url:`/v1/bills/${id}/payment`,headers:{...authHeaders(tenant.token),'idempotency-key':key},payload:{amount:100,currency:'TZS',method:'Bank Transfer'}});
 const id=await create();const key=crypto.randomUUID();const results=await Promise.all([payment(id,key),payment(id,key)]);
 expect(results.map(r=>r.statusCode)).toEqual([200,200]);
 expect((await app.inject({method:'POST',url:`/v1/bills/${id}/payment`,headers:authHeaders(tenant.token),payload:{amount:901,currency:'TZS'}})).statusCode).toBe(409);
 expect((await app.inject({method:'POST',url:`/v1/bills/${id}/payment`,headers:authHeaders(tenant.token),payload:{amount:100,currency:'USD'}})).statusCode).toBe(400);
 const failedId=await create();const original=GLService.post;
 const spy=vi.spyOn(GLService,'post').mockImplementation(async(...args)=>{await original.apply(GLService,args);throw new Error('Injected supplier posting failure');});
 try{expect((await payment(failedId,crypto.randomUUID())).statusCode).toBe(500);}finally{spy.mockRestore();}
 expect(delivered).not.toContain(failedId);
 expect(delivered.filter(entityId => entityId === id)).toHaveLength(1);
 await withTenant(tenant.tenantId,async trx=>{
  expect(await trx.selectFrom('bill_payments').select('id').where('tenant_id','=',tenant.tenantId).where('bill_id','=',id).execute()).toHaveLength(1);
  expect(await trx.selectFrom('bill_payments').select('id').where('tenant_id','=',tenant.tenantId).where('bill_id','=',failedId).execute()).toHaveLength(0);
  expect(await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',failedId).execute()).toHaveLength(0);
 });
},120000);

it('payment history uses the CRM customer link and rejects non-Finance roles',async()=>{
 const app=await getApp(); const customer=await tenant.addUser('CUSTOMER'); const staff=await tenant.addUser('JUNIOR');
 const customerId=await withTenant(tenant.tenantId,async trx=>{
  const result=await sql<{id:string}>`insert into customers (tenant_id,name) values (${tenant.tenantId},'Payment portal customer') returning id`.execute(trx);
  const id=result.rows[0].id;
  await trx.updateTable('users').set({customer_id:id}).where('id','=',customer.userId).where('tenant_id','=',tenant.tenantId).execute(); return id;
 });
 const own=await invoice(); const other=await invoice();
 await withTenant(tenant.tenantId,trx=>trx.updateTable('sales_invoices').set({customer_id:customerId}).where('id','=',own).where('tenant_id','=',tenant.tenantId).execute());
 expect((await pay(own,crypto.randomUUID())).statusCode).toBe(200); expect((await pay(other,crypto.randomUUID())).statusCode).toBe(200);
 const feed=await app.inject({method:'GET',url:'/v1/payments',headers:authHeaders(customer.token)});
 expect(feed.statusCode).toBe(200); expect(feed.json().map((row:any)=>row.invoice_id)).toEqual([own]);
 expect((await app.inject({method:'GET',url:'/v1/payments',headers:authHeaders(staff.token)})).statusCode).toBe(403);
 const unlinked=await tenant.addUser('CUSTOMER');
 expect((await app.inject({method:'GET',url:'/v1/payments',headers:authHeaders(unlinked.token)})).json()).toEqual([]);
},120000);

it('distinct concurrent payments retain both amounts and reject draft documents',async()=>{
 const app=await getApp();const id=await invoice();
 const results=await Promise.all([pay(id,crypto.randomUUID(),100),pay(id,crypto.randomUUID(),150)]);
 expect(results.map(r=>r.statusCode)).toEqual([200,200]);
 const row=await withTenant(tenant.tenantId,trx=>trx.selectFrom('sales_invoices').select('received').where('id','=',id).where('tenant_id','=',tenant.tenantId).executeTakeFirstOrThrow());
 expect(Number(row.received)).toBe(250);
 const draft=await invoice(); await withTenant(tenant.tenantId,trx=>trx.updateTable('sales_invoices').set({status:'Draft'}).where('id','=',draft).where('tenant_id','=',tenant.tenantId).execute());
 expect((await pay(draft,crypto.randomUUID())).statusCode).toBe(409);
 const other=await createTestTenant('FINANCE');
 try {
  await withTenant(other.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:other.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute());
  expect((await app.inject({method:'POST',url:`/v1/invoices/${id}/payment`,headers:authHeaders(other.token),payload:{amount:1}})).statusCode).toBe(404);
 } finally {await other.cleanup();}
},120000);
it('retry identity includes date and note and rejects invalid dates',async()=>{
 const app=await getApp();const id=await invoice();const key=crypto.randomUUID();
 const submit=(payload:Record<string,unknown>)=>app.inject({method:'POST',url:`/v1/invoices/${id}/payment`,headers:{...authHeaders(tenant.token),'idempotency-key':key},payload});
 const body={amount:100,method:'Bank Transfer',payment_date:'2026-10-08',note:'Receipt A'};
 expect((await submit(body)).statusCode).toBe(200);
 expect((await submit(body)).statusCode).toBe(200);
 expect((await submit({...body,note:'Receipt B'})).statusCode).toBe(409);
 expect((await submit({...body,payment_date:'2026-10-07'})).statusCode).toBe(409);
 expect((await submit({...body,payment_date:'invalid'})).statusCode).toBe(400);
},120000);

it('receivables batching preserves invoice totals and protects Finance aggregates',async()=>{
 const app=await getApp();const id=await invoice();expect((await pay(id,crypto.randomUUID(),100)).statusCode).toBe(200);
 const number=await withTenant(tenant.tenantId,trx=>trx.selectFrom('sales_invoices').select('invoice_number').where('tenant_id','=',tenant.tenantId).where('id','=',id).executeTakeFirstOrThrow());
 const report=await app.inject({method:'GET',url:'/v1/invoices/report?report_type=receivables',headers:authHeaders(tenant.token)});
 expect(report.statusCode).toBe(200);
 const row=report.json().data.find((item:any)=>item.invoice_number===number.invoice_number);
 expect(row).toMatchObject({total_amount:1000,paid_amount:100,balance:900});
 const staff=await tenant.addUser('JUNIOR');
 for(const url of ['/v1/invoices/report','/v1/invoices/stats','/v1/bills/stats','/v1/bills?page=1','/v1/bills/recurring','/v1/bills/payments','/v1/bills/00000000-0000-0000-0000-000000000000']) expect((await app.inject({method:'GET',url,headers:authHeaders(staff.token)})).statusCode).toBe(403);
},120000);

it('invoice pagination is bounded, stable, tenant scoped and filters literal search text', async () => {
 const app = await getApp();
 const marker = `paging-${crypto.randomUUID()}`;
 await withTenant(tenant.tenantId, async trx => {
  for (let index = 0; index < 5; index++) {
   await sql`insert into sales_invoices (tenant_id,invoice_number,client_name,bl_number,status,currency,mode,bill_date,created_by) values (${tenant.tenantId},${`${marker}-${index}`},'Literal 100% customer',${marker},'Draft','TZS','ROAD','2026-10-08',${tenant.userId})`.execute(trx);
  }
 });
 const read = async (query: string) => app.inject({method:'GET',url:`/v1/invoices?${query}`,headers:authHeaders(tenant.token)});
 const stats = await app.inject({method:'GET',url:'/v1/invoices/stats',headers:authHeaders(tenant.token)});
 expect(stats.statusCode).toBe(200);
 expect(stats.json().currency_totals.TZS.count).toBeGreaterThanOrEqual(5);
 const base = `search=${marker}&mode=ROAD&status=Draft&date_from=2026-10-08&date_to=2026-10-08&sort=asc&page_size=2`;
 const first = await read(`${base}&page=1`); expect(first.statusCode).toBe(200);
 const data = first.json(); expect(data.total).toBe(5); expect(data.total_pages).toBe(3); expect(data.items).toHaveLength(2);
 const second = (await read(`${base}&page=2`)).json(); expect(second.items).toHaveLength(2);
 expect(new Set([...data.items,...second.items].map((row: any)=>row.id)).size).toBe(4);
 expect((await read(`${base}&page=4`)).json().items).toEqual([]);
 expect((await read(`search=${marker}&mode=SEA&page=1`)).json().total).toBe(0);
 const literal = (await read('search=100%25&page=1')).json(); expect(literal.total).toBe(5);
 for (const invalid of ['page=0','page=1&page_size=101','page=1.5','date_from=2026-99-01','date_from=2026-10-09&date_to=2026-10-08','customer_id=bad']) expect((await read(invalid)).statusCode).toBe(400);
 expect(Array.isArray((await read(`search=${marker}`)).json())).toBe(true);
},120000);

it('supplier bill pages filter references, limit results and validate inputs', async () => {
 const app = await getApp(); const marker = `bill-pages-${crypto.randomUUID()}`;
 await withTenant(tenant.tenantId, async trx => {
  for(let index=0;index<3;index++) await sql`insert into supplier_bills (tenant_id,bill_number,supplier_name,shipment_ref,status,currency,total,created_by) values (${tenant.tenantId},${`${marker}-${index}`},'Literal 50% vendor',${marker},'DRAFT','TZS',${index+1},${tenant.userId})`.execute(trx);
 });
 const read = (query:string) => app.inject({method:'GET',url:`/v1/bills?${query}`,headers:authHeaders(tenant.token)});
 const stats = await app.inject({method:'GET',url:'/v1/bills/stats',headers:authHeaders(tenant.token)});
 expect(stats.statusCode).toBe(200); expect(stats.json().currency_totals.TZS.count).toBeGreaterThanOrEqual(3);
 const first = await read(`search=${marker}&page=1&page_size=2&sort_by=total&sort_dir=asc`);
 expect(first.statusCode).toBe(200); const data=first.json();
 await withTenant(tenant.tenantId, trx => sql`insert into supplier_bill_lines (bill_id,description,category,qty,unit_price,tax_rate,sort_order) values (${data.items[0].id},'Preserved charge','OTHER',1,1,0,0)`.execute(trx));
 const detail = await app.inject({method:'GET',url:`/v1/bills/${data.items[0].id}`,headers:authHeaders(tenant.token)});
 expect(detail.statusCode).toBe(200); expect(detail.json().items[0].description).toBe('Preserved charge');
 expect(data.total).toBe(3); expect(data.items).toHaveLength(2); expect(Number(data.items[0].total)).toBe(1);
 const second=(await read(`search=${marker}&page=2&page_size=2&sort_by=total&sort_dir=asc`)).json(); expect(second.items).toHaveLength(1); expect(Number(second.items[0].total)).toBe(3);
 expect((await read('search=50%25&page=1')).json().total).toBe(3);
 expect((await read(`search=${marker}&status=OVERDUE&page=1`)).json().total).toBe(0);
 expect(Array.isArray((await read(`search=${marker}`)).json())).toBe(true);
 for(const query of ['page=0','page=1&page_size=101','supplier_id=bad','sort_by=bad']) expect((await read(query)).statusCode).toBe(400);
},120000);

it('invalid withholding-tax references reject the bill without writing its header', async () => {
 const app = await getApp(); const number = `bad-wht-${crypto.randomUUID()}`;
 const response = await app.inject({method:'POST',url:'/v1/bills',headers:authHeaders(tenant.token),payload:{bill_number:number,supplier_name:'Test vendor',items:[{description:'Service',qty:1,unit_price:100,category:'OTHER',wht_rate_id:crypto.randomUUID()}]}});
 expect(response.statusCode).toBe(400);
 await withTenant(tenant.tenantId, async trx => { expect(await trx.selectFrom('supplier_bills').select('id').where('tenant_id','=',tenant.tenantId).where('bill_number','=',number).execute()).toHaveLength(0); });
},120000);

it('unowned supplier references cannot create a payable', async () => {
 const app = await getApp();
 const response = await app.inject({method:'POST',url:'/v1/bills',headers:authHeaders(tenant.token),payload:{supplier_id:crypto.randomUUID(),supplier_name:'Unowned vendor',items:[]}});
 expect(response.statusCode).toBe(400);
 const recurring = await app.inject({method:'POST',url:'/v1/bills/recurring',headers:authHeaders(tenant.token),payload:{supplier_id:crypto.randomUUID()}});
 expect(recurring.statusCode).toBe(400);
},120000);


it('concurrent scheduled generation claims each bill and invoice template once', async () => {
 for (const kind of ['bill','invoice'] as const) {
  const table = kind === 'bill' ? 'recurring_bills' : 'recurring_invoices';
  const generate = kind === 'bill' ? generateDueBills : generateDueInvoices;
  const template = await withTenant(tenant.tenantId, trx => trx.insertInto(table).values({tenant_id:tenant.tenantId,name:'Concurrent schedule',amount:100,currency:'TZS',tax_rate:0,next_due:'2020-01-01',frequency:'MONTHLY',state:'ACTIVE'}).returning('id').executeTakeFirstOrThrow());
  const results = await Promise.all([generate(tenant.tenantId,'2020-01-01',template.id),generate(tenant.tenantId,'2020-01-01',template.id)]);
  expect(results.flatMap(r=>r.generated)).toHaveLength(1);
  await withTenant(tenant.tenantId, async trx => {
   const documents = await trx.selectFrom(kind==='bill'?'supplier_bills':'sales_invoices').select('id').where('tenant_id','=',tenant.tenantId).where('notes','like','%Concurrent schedule%').execute();
   expect(documents).toHaveLength(1);
   expect(await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',documents[0].id).execute()).toHaveLength(1);
  });
 }
},120000);

it('recurring generation rolls back its documents, counters and journals together', async () => {
 for (const kind of ['bill','invoice'] as const) {
  const table = kind === 'bill' ? 'recurring_bills' : 'recurring_invoices';
  const generate = kind === 'bill' ? generateDueBills : generateDueInvoices;
  const name = `rollback-${kind}-${crypto.randomUUID()}`;
  const template = await withTenant(tenant.tenantId, trx => trx.insertInto(table).values({tenant_id:tenant.tenantId,name,amount:100,currency:'TZS',tax_rate:0,next_due:'2020-01-01',frequency:'MONTHLY',state:'ACTIVE'}).returning('id').executeTakeFirstOrThrow());
  const original = GLService.post; let sourceId:string|undefined;
  const spy = vi.spyOn(GLService,'post').mockImplementation(async (...args) => {sourceId=args[1].sourceId;await original.apply(GLService,args);throw new Error('Injected recurring failure');});
  try {await expect(generate(tenant.tenantId,'2020-01-01',template.id)).rejects.toThrow('Injected recurring failure');} finally {spy.mockRestore();}
  await withTenant(tenant.tenantId, async trx => {
   expect(await trx.selectFrom(kind==='bill'?'supplier_bills':'sales_invoices').select('id').where('tenant_id','=',tenant.tenantId).where('notes','like',`%${name}%`).execute()).toHaveLength(0);
   expect(await trx.selectFrom('journal_entries').select('id').where('tenant_id','=',tenant.tenantId).where('source_id','=',sourceId!).execute()).toHaveLength(0);
   const row = await trx.selectFrom(table).select('next_due').where('tenant_id','=',tenant.tenantId).where('id','=',template.id).executeTakeFirstOrThrow();
   expect(row.next_due).toBe('2020-01-01');
  });
 }
},120000);
