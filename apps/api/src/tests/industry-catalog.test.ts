import {afterAll,beforeAll,expect,it} from 'vitest';
import {FINANCE_INDUSTRY_KEYS,FINANCE_CATALOG_PROFILES} from '@hudumika/types';
import {withTenant} from '../db/client.js';
import {GLService} from '../services/gl.service.js';
import {getApp,createTestTenant,authHeaders,type TestTenant} from './helpers.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
let tenant:TestTenant;let other:TestTenant;
beforeAll(async()=>{
 tenant=await createTestTenant('FINANCE');other=await createTestTenant('FINANCE');
 for(const t of [tenant,other])await withTenant(t.tenantId,async trx=>{
  await trx.insertInto('tenant_settings').values({tenant_id:t.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true}})}).execute();
  await trx.insertInto('tenant_finance_profiles').values({tenant_id:t.tenantId,industries:JSON.stringify(t===tenant?FINANCE_INDUSTRY_KEYS:['retail']),updated_by:t.userId}).execute();
  await GLService.seedChartOfAccounts(trx,t.tenantId);
 });
},120000);
afterAll(async()=>{for(const t of [tenant,other].filter(Boolean)){
 await withTenant(t.tenantId,async trx=>{
  await trx.deleteFrom('finance_expenses').where('tenant_id','=',t.tenantId).execute();
  await trx.deleteFrom('finance_industry_work').where('tenant_id','=',t.tenantId).execute();
 });
 await t.cleanup();
}},120000);
async function request(method:'POST'|'PATCH'|'GET',url:string,payload?:object,t=tenant){return(await getApp()).inject({method,url,headers:authHeaders(t.token),...(payload?{payload}:{})});}
it.each(FINANCE_INDUSTRY_KEYS)('round-trips %s catalogue fields and produces billing text',async industry=>{
 const profile=FINANCE_CATALOG_PROFILES[industry];const field=profile.fields[0];
 const result=await request('POST','/v1/products',{name:`Audit ${industry}`,code:industry,industry_key:industry,industry_attributes:{[field.key]:'Specification A'},type:profile.defaultType,category:profile.categories[0],unit:profile.units[0],sale_price:100,purchase_price:60,notes:'Audit notes',track_inventory:profile.defaultType==='product',brand:'Brand A',channels:['pos'],variants:[{name:'Size',values:['A','B']}],image_urls:[],currency:'TZS',tax_code_id:null});
 expect(result.statusCode,result.body).toBe(201);const item=result.json();expect(item.industry_attributes[field.key]).toBe('Specification A');expect(item.notes).toBe('Audit notes');expect(item.channels).toEqual(['pos']);expect(item.variants[0].values).toEqual(['A','B']);
 const read=await request('GET',`/v1/products/${item.id}`);expect(read.json().billing_description).toContain(`${field.label}: Specification A`);
 const filtered=await request('GET',`/v1/products?page=1&industry=${industry}`);expect(filtered.json().items.every((row:{industry_key:string})=>row.industry_key===industry)).toBe(true);
 const patch=await request('PATCH',`/v1/products/${item.id}`,{industry_attributes:{[field.key]:'Specification B'},brand:'Brand B',channels:['invoice']});expect(patch.statusCode,patch.body).toBe(200);expect(patch.json().brand).toBe('Brand B');expect(patch.json().channels).toEqual(['invoice']);
 expect((await request('GET',`/v1/products/${item.id}`,undefined,other)).statusCode).toBe(404);
},120000);
it('rejects unknown/unconfigured industry fields and invalid values',async()=>{
 expect((await request('POST','/v1/products',{name:'Invalid',industry_key:'invented'})).statusCode).toBe(400);
 expect((await request('POST','/v1/products',{name:'Invalid',industry_key:'construction',industry_attributes:{patient_id:'secret'}})).statusCode).toBe(422);
 expect((await request('POST','/v1/products',{name:'Invalid',industry_key:'construction'},other)).statusCode).toBe(422);
 expect((await request('POST','/v1/products',{name:'Invalid',sale_price:-1})).statusCode).toBe(400);
});
it('snapshots industry descriptions on invoice lines without following catalogue edits',async()=>{
 const product=(await request('POST','/v1/products',{name:'BOQ concrete',industry_key:'construction',industry_attributes:{material_specification:'C30'},unit:'m3',sale_price:100,currency:'TZS'})).json();
 const billing=(await request('GET',`/v1/products/${product.id}`)).json();
 const invoice=await request('POST','/v1/invoices',{client_name:'Industry buyer',status:'Draft',currency:'TZS',items:[{name:product.name,description:billing.billing_description,unit:'m3',rate:100,qty:2,tax_pct:0,line_group:'other',currency:'TZS'}]});expect(invoice.statusCode,invoice.body).toBe(201);
 await request('PATCH',`/v1/products/${product.id}`,{industry_attributes:{material_specification:'C40'}});
 const read=await request('GET',`/v1/invoices/${invoice.json().id}`);expect(read.json().items[0].description).toContain('C30');expect(read.json().items[0].description).not.toContain('C40');
 const pdf=await getDocument({data:new Uint8Array(await renderInvoicePdf(tenant.tenantId,invoice.json().id)),useSystemFonts:true}).promise;
 try{const page=await pdf.getPage(1);const text=(await page.getTextContent()).items.map(item=>'str' in item?item.str:'').join(' ');expect(text).toContain('Material specification: C30');}finally{await pdf.destroy();}
});
it('attributes expenses to the correct industry work and refuses foreign work IDs',async()=>{
 const own=await withTenant(tenant.tenantId,async trx=>{
  const customer=await trx.insertInto('customers').values({tenant_id:tenant.tenantId,name:'Site owner'}).returning('id').executeTakeFirstOrThrow();
  return trx.insertInto('finance_industry_work').values({tenant_id:tenant.tenantId,industry:'construction',currency:'TZS',budget:0,specifications:JSON.stringify({}),reference:'SITE-A',name:'Site A',customer_id:customer.id,created_by:tenant.userId}).returning('id').executeTakeFirstOrThrow();
 });
 const result=await request('POST','/v1/finance/expenses',{name:'Site supplies',amount:100,category:'Site overhead',industry_key:'construction',industry_work_id:own.id});expect(result.statusCode,result.body).toBe(201);
 expect(result.json().industry_work_id).toBe(own.id);
 expect((await request('POST','/v1/finance/expenses',{name:'Wrong industry',amount:100,industry_key:'pharmaceutical',industry_work_id:own.id})).statusCode).toBe(422);
 expect((await request('POST','/v1/finance/expenses',{name:'Foreign work',amount:100,industry_work_id:own.id},other)).statusCode).toBe(422);
});

