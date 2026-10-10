import { it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { withTenant } from '../db/client.js';
import { createTestTenant, getApp, authHeaders } from './helpers.js';
import PDFDocument from 'pdfkit';
import { documentFonts, drawDocumentHeader, documentBranding } from '../services/document-branding.service.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function pdfText(buffer: Buffer) {
 const pdf = await getDocument({data: new Uint8Array(buffer), useSystemFonts: true}).promise;
 const pages: string[] = [];
 try { for(let n=1;n<=pdf.numPages;n++) {const page=await pdf.getPage(n);pages.push((await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' '));} }
 finally {await pdf.destroy();}
 return pages;
}
it('document preferences persist independently and PDF readers preserve tenant and customer isolation',async()=>{
 const tenant=await createTestTenant(); const other=await createTestTenant();
 try {
  const app=await getApp();const headers=authHeaders(tenant.token);
  await withTenant(tenant.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true,crm:true},company:{name:'Document Test Company'}})}).execute());
  expect((await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{documentTemplates:{credit_note:'compact',purchase_order:'classic',quotation:'modern',delivery_note:'modern'}}})).statusCode).toBe(200);
  expect((await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{documentTemplates:{invoice:'compact'}}})).statusCode).toBe(200);
  const logo='data:image/png;base64,'+(await sharp({create:{width:20,height:40,channels:4,background:'#ffffff'}}).png().toBuffer()).toString('base64');
  expect((await app.inject({method:'PUT',url:'/v1/settings/branding',headers,payload:{logoVerticalLight:logo,logoVerticalDark:logo}})).statusCode).toBe(200);
  expect((await app.inject({method:'GET',url:'/v1/settings/branding',headers})).json().logoVerticalLight).toBe(logo);
  expect((await app.inject({method:'PUT',url:'/v1/settings/branding',headers,payload:{logoVerticalLight:''}})).statusCode).toBe(200);
  const branding=(await app.inject({method:'GET',url:'/v1/settings/branding',headers})).json();expect(branding.logoVerticalLight).toBe('');expect(branding.logoVerticalDark).toBe(logo);
  const settings=(await app.inject({method:'GET',url:'/v1/settings',headers})).json().settings;
  expect(settings.documentTemplates.credit_note).toBe('compact');expect(settings.documentTemplates.invoice).toBe('compact');
  expect((await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{documentTemplates:{invoice:'unknown'}}})).statusCode).toBe(400);
  const finance=await tenant.addUser('FINANCE');expect((await app.inject({method:'PATCH',url:'/v1/settings',headers:authHeaders(finance.token),payload:{documentTemplates:{invoice:'modern'}}})).statusCode).toBe(403);
  const ids=await withTenant(tenant.tenantId,async trx=>{
   const customer=await trx.insertInto('customers').values({tenant_id:tenant.tenantId,name:'PDF Customer'}).returning('id').executeTakeFirstOrThrow();
   const cn=await trx.insertInto('credit_notes').values({tenant_id:tenant.tenantId,credit_note_number:'CN-TEMPLATE',client_name:'PDF Customer',currency:'USD'} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('credit_note_lines').values({credit_note_id:cn.id,name:'Service credit',qty:2,rate:50,tax_pct:18} as any).execute();
   const po=await trx.insertInto('purchase_orders').values({tenant_id:tenant.tenantId,po_number:'PO-TEMPLATE',supplier_name:'PDF Vendor',currency:'USD',total:118} as any).returning('id').executeTakeFirstOrThrow();
   const q=await trx.insertInto('quotations').values({tenant_id:tenant.tenantId,quote_number:'Q-TEMPLATE',customer_id:customer.id,title:'Service quote',shipment_type:'ROAD',currency:'USD',total_amount:118} as any).returning('id').executeTakeFirstOrThrow();
   const dn=await trx.insertInto('delivery_documents').values({tenant_id:tenant.tenantId,doc_type:'DELIVERY_NOTE',doc_number:'DN-TEMPLATE',customer_name:'PDF Customer'} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('delivery_document_lines').values(Array.from({length:90},(_,i)=>({document_id:dn.id,description:`Goods ${i} with a wrapped delivery description`,qty_ordered:1,qty_delivered:1,sort_order:i}))).execute();
   const inv=await trx.insertInto('sales_invoices').values({tenant_id:tenant.tenantId,invoice_number:'INV-TEMPLATE',currency:'USD',exchange_rate:2650,received:18,client_name:'PDF Customer'} as any).returning('id').executeTakeFirstOrThrow();
   const work=await trx.insertInto('finance_industry_work').values({tenant_id:tenant.tenantId,industry:'consulting',reference:'WORK-PDF',name:'Client advisory engagement',customer_id:customer.id,currency:'USD',budget:100,created_by:tenant.userId,specifications:JSON.stringify({internal:'PRIVATE COST NOTES'})}).returning('id').executeTakeFirstOrThrow();
   await trx.updateTable('sales_invoices').set({industry_work_id:work.id}).where('tenant_id','=',tenant.tenantId).where('id','=',inv.id).execute();
   await trx.insertInto('sales_invoice_lines').values({invoice_id:inv.id,unit:'hours',name:'USD shipping',currency:'USD',line_group:'shipping',qty:2,rate:50,tax_pct:18} as any).execute();
   return {cn:cn.id,po:po.id,q:q.id,dn:dn.id,inv:inv.id};
  });
  for(const [prefix,id] of [['credit-notes',ids.cn],['purchase-orders',ids.po],['quotations',ids.q],['delivery-documents',ids.dn]]) {
   const response=await app.inject({method:'GET',url:`/v1/${prefix}/${id}/pdf`,headers});expect(response.statusCode,response.body.slice(0,100)).toBe(200);expect(response.rawPayload.subarray(0,4).toString()).toBe('%PDF');
   const pages=await pdfText(response.rawPayload);expect(pages.join(' ')).toContain('Document Test Company');
   if(prefix==='delivery-documents') {expect(pages.length).toBeGreaterThan(2);expect(pages.join(' ')).toContain('Goods 89');expect(pages.join(' ')).toContain('CONFIRMATION SIGNATURES');}
   if(prefix==='credit-notes') expect(pages.join(' ')).toContain('118.00');
   const foreign=await app.inject({method:'GET',url:`/v1/${prefix}/${id}/pdf`,headers:authHeaders(other.token)});expect([403,404]).toContain(foreign.statusCode);
  }
  const customerUser=await tenant.addUser('CUSTOMER');expect((await app.inject({method:'GET',url:`/v1/quotations/${ids.q}/pdf`,headers:authHeaders(customerUser.token)})).statusCode).toBe(404);
  const invoice=(await pdfText(await renderInvoicePdf(tenant.tenantId,ids.inv))).join(' ');expect(invoice).toContain('USD 118.00');expect(invoice).toContain('USD 100.00');expect(invoice).not.toContain('TZS');expect(invoice).toContain('WORK-PDF');expect(invoice).toContain('Client advisory engagement');expect(invoice).toContain('hours');expect(invoice).not.toContain('PRIVATE COST NOTES');
 } finally {
  await withTenant(tenant.tenantId,async trx=>{
   await trx.updateTable('sales_invoices').set({industry_work_id:null}).where('tenant_id','=',tenant.tenantId).execute();
   await trx.deleteFrom('finance_industry_work').where('tenant_id','=',tenant.tenantId).execute();
  });
  await tenant.cleanup();await other.cleanup();
 }
},120000);

it('PDF branding fits embedded vertical variants and never loads external URLs',async()=>{
 const png=await sharp({create:{width:12,height:24,channels:4,background:'#1257c6'}}).png().toBuffer();
 const upload=`data:image/png;base64,${png.toString('base64')}`;
 const dark=await documentBranding({documentTemplates:{invoice:'compact'},company:{logoVerticalDark:upload}},'invoice');expect(dark.logo).toBeInstanceOf(Buffer);expect(dark.layout).toBe('compact');
 expect((await documentBranding({company:{logoUrl:'http://127.0.0.1/private'}},'invoice')).logo).toBe(null);
 expect((await documentBranding({company:{logoUrl:'data:image/png;base64,invalid'}},'invoice')).logo).toBe(null);
});


it('embeds the bundled design font with distinct regular and bold faces',async()=>{
 const fonts=await documentFonts('atlassian-sans');expect(fonts).toBeDefined();
 expect(await documentFonts('inter')).toBeUndefined();
 const buffer=await new Promise<Buffer>((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:40});const chunks:Buffer[]=[];
  doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  drawDocumentHeader(doc,{layout:'modern',accent:'#1257c6',logo:null,fonts},{name:'Résumé Company',address:'Dar es Salaam'},'INVOICE','INV-FONTS',40,40,515);
  doc.font('Document-Regular').text('Ushauri wa biashara',40,180);doc.font('Document-Bold').text('Total due',40,210);doc.end();
 });
 expect(buffer.toString('latin1')).toContain('AtlassianSans-Regular');
 expect(buffer.toString('latin1')).toContain('AtlassianSans-Bold');
 expect((await pdfText(buffer)).join(' ')).toContain('Résumé Company');
 expect((await pdfText(buffer)).join(' ')).toContain('Ushauri wa biashara');
});
