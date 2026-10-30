import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {objectStore} from '../integrations/object-storage.js';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {withTenant} from '../db/client.js';
import {createTestTenant,getApp,authHeaders} from './helpers.js';

it('generates finance PDFs, isolates tenants and claim owners, and reports batch failures',async()=>{
 const tenant=await createTestTenant();const other=await createTestTenant();
 try{
  const app=await getApp();const headers=authHeaders(tenant.token);
  await withTenant(tenant.tenantId,trx=>trx.insertInto('tenant_settings').values({tenant_id:tenant.tenantId,settings:JSON.stringify({'enabled-apps':{finops:true},company:{name:'Output Review Company'},documentTemplates:{bill:'compact',expense:'modern',expense_report:'modern',vendor_statement:'classic'}})}).execute());
  expect((await app.inject({method:'PATCH',url:'/v1/settings',headers,payload:{documentTemplates:{bill:'compact',expense:'modern',expense_report:'modern',vendor_statement:'classic'}}})).statusCode).toBe(200);
  const docs=await withTenant(tenant.tenantId,async (trx): Promise<{kind:string;id:string}[]>=>{
   const t=tenant.tenantId;
   const customer=await trx.insertInto('customers').values({tenant_id:t,name:'Output Buyer'}).returning('id').executeTakeFirstOrThrow();
   const vendor=await trx.insertInto('suppliers').values({tenant_id:t,name:'=SUM(1+1) <script>literal</script>',currency:'USD'} as any).returning('id').executeTakeFirstOrThrow();
   const invoice=await trx.insertInto('sales_invoices').values({tenant_id:t,invoice_number:'INV-OUTPUT',client_name:'Buyer',currency:'USD'} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('sales_invoice_lines').values({invoice_id:invoice.id,name:'Chocolate boxes',qty:2,rate:12.34,tax_pct:18,currency:'USD',sort_order:0} as any).execute();
   const cn=await trx.insertInto('credit_notes').values({tenant_id:t,credit_note_number:'CN-OUTPUT',currency:'USD'} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('credit_note_lines').values({credit_note_id:cn.id,name:'Returned chocolate box',qty:1,rate:12.34,tax_pct:18} as any).execute();
   const quote=await trx.insertInto('quotations').values({tenant_id:t,quote_number:'QT-OUTPUT',title:'Quote',customer_id:customer.id,currency:'USD',prepared_by:tenant.userId,shipment_type:'SEA_FCL',subtotal:24.68,tax_amount:4.44,total_amount:29.12} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('quotation_lines').values({quotation_id:quote.id,line_number:1,description:'Chocolate boxes',category:'OTHER',quantity:2,unit_price:12.34,tax_rate:18,tax_amount:4.44,line_total:24.68} as any).execute();
   const po=await trx.insertInto('purchase_orders').values({tenant_id:t,po_number:'PO-OUTPUT',supplier_id:vendor.id,supplier_name:'Output Vendor',currency:'USD',subtotal:24.68,tax_amount:4.44,total:29.12} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('purchase_order_lines').values({po_id:po.id,description:'Cocoa powder',qty:2,unit_price:12.34,tax_rate:18,line_total:29.12} as any).execute();
   const bill=await trx.insertInto('supplier_bills').values({tenant_id:t,bill_number:'BILL-OUTPUT',supplier_id:vendor.id,supplier_name:'Vendor',currency:'USD',subtotal:24.68,tax_amount:4.44,total:29.12,created_by:tenant.userId} as any).returning('id').executeTakeFirstOrThrow();
   await trx.insertInto('supplier_bill_lines').values({bill_id:bill.id,description:'Cocoa powder',qty:2,unit_price:12.34,tax_rate:18,category:'OTHER',tax_code_id:null,wht_rate_id:null} as any).execute();
   const expense=await trx.insertInto('finance_expenses').values({tenant_id:t,name:'Expense output',amount:12.34,expense_date:'2026-10-23',category:'OTHER',created_by:tenant.userId} as any).returning('id').executeTakeFirstOrThrow();
   const report=await trx.insertInto('finance_expense_reports').values({tenant_id:t,name:'Owner report',owner_id:tenant.userId,review_note:null,reviewed_by:null,reviewed_at:null,reimbursement_journal_id:null,payment_reference:null}).returning('id').executeTakeFirstOrThrow();
   return [{kind:'invoice',id:invoice.id},{kind:'credit_note',id:cn.id},{kind:'quotation',id:quote.id},{kind:'purchase_order',id:po.id},{kind:'bill',id:bill.id},{kind:'expense',id:expense.id},{kind:'expense_report',id:report.id},{kind:'vendor_statement',id:vendor.id}];
  });
  const delivery=await app.inject({method:'POST',url:'/v1/delivery-documents',headers,payload:{docType:'DELIVERY_NOTE',subjectType:'adhoc',customerName:'Output Buyer',lines:[{description:'Chocolate box',qty_ordered:1,qty_delivered:1}]}});
  expect(delivery.statusCode,delivery.body).toBe(201);docs.push({kind:'delivery_note',id:delivery.json().id});
  for(const doc of docs){
   const exported=await app.inject({method:'GET',url:`/v1/finance/documents/${doc.kind}/export`,headers});
   expect(exported.statusCode,exported.body).toBe(200);expect(exported.headers['content-type']).toContain('text/csv');
   const url=`/v1/finance/documents/${doc.kind}/${doc.id}/pdf`;
   const response=await app.inject({method:'GET',url:url+'?download=1',headers});
   expect(response.statusCode,response.body.slice(0,300)).toBe(200);expect(response.rawPayload.subarray(0,5).toString()).toBe('%PDF-');expect(response.headers['content-disposition']).toContain('attachment;');
   if(process.env.FINANCE_DOCUMENT_SAMPLE_DIR){await mkdir(process.env.FINANCE_DOCUMENT_SAMPLE_DIR,{recursive:true});await writeFile(join(process.env.FINANCE_DOCUMENT_SAMPLE_DIR,doc.kind+'.pdf'),response.rawPayload);}
   expect((await app.inject({method:'GET',url,headers:authHeaders(other.token)})).statusCode).toBe(404);
  }
  const csv=await app.inject({method:'GET',url:'/v1/finance/documents/vendor_statement/export',headers});expect(csv.statusCode,csv.body).toBe(200);expect(csv.body).toContain("'=SUM(1+1) <script>literal</script>");
  const manager=await tenant.addUser('MANAGER');const report=docs.find(d=>d.kind==='expense_report')!;
  expect((await app.inject({method:'GET',url:`/v1/finance/documents/expense_report/${report.id}/pdf`,headers:authHeaders(manager.token)})).statusCode).toBe(404);
  const customer=await tenant.addUser('CUSTOMER');
  expect((await app.inject({method:'GET',url:`/v1/finance/documents/invoice/${docs[0].id}/pdf`,headers:authHeaders(customer.token)})).statusCode).toBe(403);
  const batch=await app.inject({method:'POST',url:'/v1/finance/documents/batch',headers,payload:{documents:[docs[0],{kind:'invoice',id:randomUUID()}]}});
  expect(batch.statusCode,batch.body).toBe(200);const files=unzipSync(batch.rawPayload);expect(Object.keys(files).filter(n=>n.endsWith('.pdf'))).toHaveLength(1);expect(strFromU8(files['export-summary.txt'])).toContain('Exported 1 of 2');
  const sendBody={email:'fixture@example.invalid',message:'Document review <unsafe>',requestKey:randomUUID()};const sendUrl=`/v1/finance/documents/invoice/${docs[0].id}/send`;
  const replies=await Promise.all([app.inject({method:'POST',url:sendUrl,headers,payload:sendBody}),app.inject({method:'POST',url:sendUrl,headers,payload:sendBody})]);
  expect(replies.map(r=>r.statusCode)).toEqual([202,202]);expect(replies[0].json().outbox_id).toBe(replies[1].json().outbox_id);
  const mail=await withTenant(tenant.tenantId,trx=>trx.selectFrom('email_outbox').selectAll().where('tenant_id','=',tenant.tenantId).where('id','=',replies[0].json().outbox_id).executeTakeFirstOrThrow());
  expect(mail.status).toBe('pending');expect(mail.attachment_storage_key).toContain(`tenants/${tenant.tenantId}/finance-deliveries/`);expect(mail.body_html).toContain('&lt;unsafe&gt;');expect(mail.in_reply_to_message_id).toBeNull();
 }finally{const keys=await withTenant(tenant.tenantId,trx=>trx.selectFrom('email_outbox').select('attachment_storage_key').where('tenant_id','=',tenant.tenantId).execute());for(const row of keys){if(row.attachment_storage_key)await objectStore.del(row.attachment_storage_key);}await tenant.cleanup();await other.cleanup();}
},120000);
