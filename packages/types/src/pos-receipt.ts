export const POS_RECEIPT_TEMPLATES = [
  {id:'retail',name:'Everyday retail',industry:'Retail & ecommerce collection',description:'Clear item details, savings and payment breakdown.',layout:'classic'},
  {id:'grocery',name:'Grocery express',industry:'Groceries & minimarts',description:'Compact lines with quantities and unit prices.',layout:'compact'},
  {id:'hospitality',name:'Hospitality',industry:'Cafés & restaurants',description:'A welcoming header and spacious item presentation.',layout:'hospitality'},
  {id:'bakery',name:'Artisan counter',industry:'Bakeries & confectionery',description:'A centered brand presentation for counter sales.',layout:'artisan'},
  {id:'wholesale',name:'Trade counter',industry:'Wholesale & distribution',description:'Product codes, quantities and customer details.',layout:'trade'},
  {id:'service',name:'Service desk',industry:'Salons, repairs & professional services',description:'Readable service lines and customer notes.',layout:'service'},
] as const;
export type PosReceiptTemplate = typeof POS_RECEIPT_TEMPLATES[number]['id'];
export const POS_RECEIPT_FIELDS = ['businessName','logo','contact','taxId','receiptNumber','date','customer','productCode','unitPrice','subtotal','discount','tax','payments','change','notes'] as const;
export type PosReceiptField = typeof POS_RECEIPT_FIELDS[number];
export interface PosReceiptProfile { template:PosReceiptTemplate; header:string; footer:string; heading:string; footerTitle:string; code:'none'|'qr'; typography:'brand'|'mono'; visibility:Record<PosReceiptField,boolean> }
export const DEFAULT_POS_RECEIPT:PosReceiptProfile={template:'retail',header:'',heading:'SALE RECEIPT',footerTitle:'THANK YOU',code:'none',typography:'brand',footer:'Thank you for your business.',visibility:{businessName:true,logo:true,contact:true,taxId:true,receiptNumber:true,date:true,customer:true,productCode:false,unitPrice:true,subtotal:true,discount:true,tax:true,payments:true,change:true,notes:false}};
export function receiptTemplateProfile(template:PosReceiptTemplate):PosReceiptProfile {
  return {...DEFAULT_POS_RECEIPT,template,typography:template==='grocery'?'mono':'brand',heading:template==='service'?'SERVICE RECEIPT':template==='wholesale'?'TRADE RECEIPT':'SALE RECEIPT',visibility:{...DEFAULT_POS_RECEIPT.visibility,productCode:template==='wholesale',notes:template==='service'}};
}
export function normalizePosReceiptProfile(raw:unknown):PosReceiptProfile {
  const value=raw && typeof raw==='object'?raw as Partial<PosReceiptProfile>:{};
  const template=POS_RECEIPT_TEMPLATES.some(t=>t.id===value.template)?value.template!:'retail';
  const defaults=receiptTemplateProfile(template);
  return {template,heading:typeof value.heading==='string'?value.heading.slice(0,80):defaults.heading,footerTitle:typeof value.footerTitle==='string'?value.footerTitle.slice(0,100):defaults.footerTitle,code:value.code==='qr'?'qr':'none',typography:value.typography==='mono'||value.typography==='brand'?value.typography:defaults.typography,header:typeof value.header==='string'?value.header.slice(0,500):defaults.header,footer:typeof value.footer==='string'?value.footer.slice(0,500):defaults.footer,visibility:Object.fromEntries(POS_RECEIPT_FIELDS.map(key=>[key,typeof value.visibility?.[key]==='boolean'?value.visibility[key]:defaults.visibility[key]])) as Record<PosReceiptField,boolean>};
}
