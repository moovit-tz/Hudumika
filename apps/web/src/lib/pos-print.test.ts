import {describe,it,expect,vi,afterEach} from 'vitest';
import {DEFAULT_POS_RECEIPT,POS_RECEIPT_TEMPLATES,normalizePosReceiptProfile,receiptTemplateProfile,type PosSale} from '@hudumika/types';
import {buildPosReceiptHtml,DEFAULT_POS_PRINT,loadPosPrintSettings} from './pos-print.js';
afterEach(()=>vi.unstubAllGlobals());
const sale={sale_number:'SALE-1',sold_at:'2026-10-24T08:00:00Z',status:'COMPLETED',currency:'TZS',customer_name:'Private customer',subtotal:100,discount_total:10,tax_total:16.2,grand_total:106.2,change_due:3.8,notes:'Private note',lines:[{product_name:'<script>alert(1)</script>',product_code:'SKU-42',qty:1,unit_price:100,line_total:106.2}],payments:[{method:'CASH',amount:110}]} as PosSale;
describe('tenant receipt output',()=>{
 it('escapes sale and custom text and refuses executable logo URLs',()=>{
  const html=buildPosReceiptHtml(sale,DEFAULT_POS_PRINT,{name:'<img onerror=alert(1)>',logoUrl:'javascript:alert(1)'},{...DEFAULT_POS_RECEIPT,header:'<script>bad</script>'});
  expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');expect(html).not.toContain('src="javascript:');expect(html).toContain('&lt;img onerror=alert(1)&gt;');
 });
 it('honors privacy controls while retaining actual total, currency and status',()=>{
  const profile=normalizePosReceiptProfile({...DEFAULT_POS_RECEIPT,visibility:{...DEFAULT_POS_RECEIPT.visibility,customer:false,payments:false,tax:false}});
  const html=buildPosReceiptHtml(sale,DEFAULT_POS_PRINT,'Company',profile);
  expect(html).not.toContain('Private customer');expect(html).not.toContain('Private note');expect(html).not.toContain('>CASH<');expect(html).not.toContain('>Tax<');expect(html).toContain('106.20');expect(html).toContain('COMPLETED');expect(html).toContain('TZS');
 });
 it('supports all presets, safe defaults, physical widths and duplicate marking',()=>{
  for(const template of POS_RECEIPT_TEMPLATES){const profile=receiptTemplateProfile(template.id);const html=buildPosReceiptHtml(sale,{...DEFAULT_POS_PRINT,paper:'58mm',margin:2,copies:2},'Company',profile);expect(html).toContain('width:54mm');expect(html).toContain('DUPLICATE COPY');expect(html).toContain(`class="${template.layout}"`);if(template.id==='wholesale')expect(html).toContain('SKU-42');}
  expect(normalizePosReceiptProfile({template:'not-real',visibility:{tax:'false'}})).toEqual(DEFAULT_POS_RECEIPT);
 });
 it('bounds malformed device options and keeps legacy preferences',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({paper:'oops',margin:-100,copies:200,textSize:'tiny',showCustomer:false,footer:'Legacy policy'})});
  expect(loadPosPrintSettings('x')).toEqual({...DEFAULT_POS_PRINT,showCustomer:false,footer:'Legacy policy'});
 });
});
