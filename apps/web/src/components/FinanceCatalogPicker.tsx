import { useRef } from 'react';
import { EntityPicker, type PickerItem } from './EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { formatAmount } from '../lib/currency.js';

export interface FinanceCatalogSelection { id:string; name:string; unit:string; currency:string; sale_price:number; purchase_price:number; tax_rate:number; tax_code_id?:string|null; billing_description?:string; category?:string }
export function FinanceCatalogPicker({currency,purchase=false,onSelect}:{currency?:string;purchase?:boolean;onSelect:(item:FinanceCatalogSelection)=>void}) {
  const cache=useRef(new Map<string,FinanceCatalogSelection>());
  async function search(search:string):Promise<PickerItem[]> {
    const result=await apiFetch(`/v1/products?${new URLSearchParams({status:'active',search,page:'1',page_size:'25'})}`);
    const rows:FinanceCatalogSelection[]=Array.isArray(result)?result:result.items ?? [];
    const matches=rows.filter(item=>!currency || item.currency===currency);
    matches.forEach(item=>cache.current.set(item.id,item));
    return matches.map(item=>({id:item.id,label:item.name,sublabel:`${formatAmount(Number(purchase?item.purchase_price:item.sale_price),item.currency)} / ${item.unit}`}));
  }
  return <EntityPicker label="Add from industry catalogue" value={null} search={search} onChange={selection=>{const item=selection&&cache.current.get(selection.id);if(item)onSelect(item);}} placeholder="Search products and services…"/>;
}
