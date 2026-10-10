import { useRef } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table.js';
import { apiFetch } from '../../lib/api.js';
import { formatAmount } from '../../lib/currency.js';
import type { EditItem } from './shared.js';

export function InvoiceLinesEditor({items,onChange,currency,customerId}:{items:EditItem[];onChange:(items:EditItem[])=>void;currency:string;customerId?:string}) {
 const products=useRef(new Map<string,{name:string;unit:string;currency:string;sale_price:number;tax_rate:number}>());
 async function search(query:string):Promise<PickerItem[]> {
  const params=new URLSearchParams({status:'active',search:query,page:'1',page_size:'25'});if(customerId)params.set('customer_id',customerId);
  const response=await apiFetch(`/v1/products?${params}`);const rows=Array.isArray(response)?response:response.items ?? response.data ?? [];
  rows.forEach((row:any)=>products.current.set(row.id,row));
  return rows.slice(0,25).map((row:any)=>({id:row.id,label:row.name,sublabel:`${formatAmount(Number(row.sale_price),row.currency || currency)} / ${row.unit || 'unit'}`}));
 }
 const update=(id:string,patch:Partial<EditItem>)=>onChange(items.map(item=>item.uid===id?{...item,...patch}:item));
 return <div className="min-w-0 space-y-4">
  <EntityPicker label="Add from products and services" value={null} search={search} onChange={selection=>{if(!selection)return;const product=products.current.get(selection.id);if(product)onChange([...items,{uid:crypto.randomUUID(),name:product.name,unit:product.unit || 'UNIT',rate:Number(product.sale_price)||0,qty:1,taxPct:Number(product.tax_rate)||0,group:'other',currency:product.currency || currency}]);}} placeholder="Search your catalog…" />
  <Table className="max-sm:[&_thead]:hidden max-sm:[&_tr]:grid max-sm:[&_tr]:grid-cols-2 max-sm:[&_td]:min-w-0 max-sm:[&_td]:static"><TableHeader><TableRow>{['Item','Qty','Unit','Currency','Rate','Tax %','Amount',''].map((label,index)=><TableHead key={index}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{items.map((item,index)=><TableRow key={item.uid}>
   <TableCell className="min-w-56 max-sm:col-span-2"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Item</span><Input aria-label={`Item ${index+1} name`} value={item.name} onChange={event=>update(item.uid,{name:event.target.value})} placeholder="Product or service" /></TableCell>
   <TableCell className="min-w-24"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Quantity</span><Input aria-label={`Item ${index+1} quantity`} type="number" min="0.001" step="any" value={item.qty} onChange={event=>update(item.uid,{qty:Number(event.target.value)})}/></TableCell>
   <TableCell className="min-w-28"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Unit</span><Input aria-label={`Item ${index+1} unit`} value={item.unit} onChange={event=>update(item.uid,{unit:event.target.value})}/></TableCell>
   <TableCell className="min-w-28"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Currency</span><Select value={item.currency} onValueChange={value=>update(item.uid,{currency:value})}><SelectTrigger aria-label={`Item ${index+1} currency`}><SelectValue/></SelectTrigger><SelectContent>{Array.from(new Set([currency,item.currency,'TZS','USD','EUR','GBP','KES','ZAR','AED'])).map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></TableCell>
   <TableCell className="min-w-32"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Rate</span><Input aria-label={`Item ${index+1} rate`} type="number" min="0" step="any" value={item.rate} onChange={event=>update(item.uid,{rate:Number(event.target.value)})}/></TableCell>
   <TableCell className="min-w-24"><span className="mb-2 block text-xs font-medium text-muted-foreground sm:hidden">Tax %</span><Input aria-label={`Item ${index+1} tax percent`} type="number" min="0" max="100" step="any" value={item.taxPct} onChange={event=>update(item.uid,{taxPct:Number(event.target.value)})}/></TableCell>
   <TableCell className="whitespace-nowrap font-medium">{formatAmount(item.qty*item.rate*(1+item.taxPct/100),item.currency)}</TableCell>
   <TableCell><Button variant="ghost" size="sm" aria-label={`Remove item ${index+1}`} onClick={()=>onChange(items.filter(row=>row.uid!==item.uid))}>Remove</Button></TableCell>
  </TableRow>)}{!items.length&&<TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Add a product, service or custom line.</TableCell></TableRow>}</TableBody></Table>
  <Button variant="outline" onClick={()=>onChange([...items,{uid:crypto.randomUUID(),name:'',unit:'UNIT',qty:1,rate:0,taxPct:0,group:'other',currency}])}>Add line</Button>
 </div>;
}
