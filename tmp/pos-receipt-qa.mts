import {writeFile,mkdir} from 'node:fs/promises';
import {buildPosReceiptHtml,DEFAULT_POS_PRINT} from '../apps/web/src/lib/pos-print.ts';
import {receiptTemplateProfile,POS_RECEIPT_TEMPLATES,type PosSale} from '../packages/types/src/index.ts';
const sale={sale_number:'PREVIEW-0001 · NOT A SALE',sold_at:'2026-10-24T08:00:00Z',status:'COMPLETED',currency:'TZS',customer_name:'Sample customer',subtotal:10000,discount_total:500,tax_total:1710,grand_total:11210,change_due:790,notes:'Collection at the service counter.',lines:[{product_name:'Chocolate gift box — assorted selection',product_code:'CHOC-001',qty:2,unit_price:5000,line_total:11210}],payments:[{method:'CASH',amount:12000}]} as PosSale;
await mkdir('tmp/pos-receipt-preview',{recursive:true});
for(const template of POS_RECEIPT_TEMPLATES){await writeFile(`tmp/pos-receipt-preview/${template.id}.html`,buildPosReceiptHtml(sale,{...DEFAULT_POS_PRINT,paper:'58mm'},{name:'Hudumika Demo Store',address:'Sample business address',phone:'+255 000 000 000',taxId:'DEMO'},receiptTemplateProfile(template.id)));}
