import React,{useEffect,useMemo,useState,useRef} from 'react';
import {DEFAULT_POS_RECEIPT,POS_RECEIPT_TEMPLATES,receiptTemplateProfile,normalizePosReceiptProfile,type PosReceiptField,type PosReceiptProfile,type PosSale} from '@hudumika/types';
import {PageHeader} from '../components/PageHeader.js';
import {SectionCard} from '../components/SectionCard.js';
import {Button} from '../components/ui/button.js';
import {Label} from '../components/ui/label.js';
import {PosReceiptPreview} from '../components/PosReceiptPreview.js';
import {Input} from '../components/ui/input.js';
import {Textarea} from '../components/ui/textarea.js';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '../components/ui/select.js';
import {SwitchRow} from '../components/ui/list-item-row.js';
import {Banner} from '../components/ui/alert.js';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../components/ui/tabs.js';
import {SectionLoading} from '../components/ui/spinner.js';
import {useAuth} from '../hooks/useAuth.js';
import {useCompany} from '../data/companyStore.js';
import {apiFetch} from '../lib/api.js';
import {DEFAULT_POS_PRINT,loadPosPrintSettings,posPrintKey,printPosReceipt,buildPosReceiptHtml,legacyReceiptProfile,receiptCompanyFromSettings,type ReceiptCompany} from '../lib/pos-print.js';

const labels:Record<PosReceiptField,string>={businessName:'Business name',logo:'Company logo',contact:'Address & contact details',taxId:'Tax identification number',receiptNumber:'Receipt number',date:'Date & time',customer:'Customer name',productCode:'Product / service code',unitPrice:'Unit price',subtotal:'Subtotal',discount:'Discount',tax:'Tax breakdown',payments:'Payment methods',change:'Change due',notes:'Sale notes'};
function sample(currency:string):PosSale{return {id:'sample',sale_number:'SAMPLE-0001 · NOT A SALE',sold_at:new Date().toISOString(),currency,customer_name:'Sample customer',status:'COMPLETED',subtotal:10000,discount_total:500,tax_total:1710,grand_total:11210,amount_paid:12000,change_due:790,notes:'Sample sale note — replace with your customer-facing instructions.',lines:[{product_name:'Sample product / service',product_code:'ITEM-001',qty:2,unit_price:5000,line_total:11210}],payments:[{method:'CASH',amount:12000}]} as PosSale;}
export function FinancePosSettings(){
 const {user}=useAuth();const company=useCompany();const key=posPrintKey(user?.tenant_id,user?.id);
 const [device,setDevice]=useState(()=>loadPosPrintSettings(key));const [profile,setProfile]=useState<PosReceiptProfile>(()=>normalizePosReceiptProfile(DEFAULT_POS_RECEIPT));
 const [font,setFont]=useState(()=>getComputedStyle(document.documentElement).getPropertyValue('--font').trim());
 const [receiptCompany,setReceiptCompany]=useState<ReceiptCompany>({name:''});
 const [loaded,setLoaded]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [saving,setSaving]=useState(false);const [revision,setRevision]=useState(0);
 const [source,setSource]=useState<'sample'|'latest'>('sample');const [latest,setLatest]=useState<PosSale|null>(null);const [saleError,setSaleError]=useState('');const [saleLoading,setSaleLoading]=useState(false);
 const saleRequest=useRef<AbortController|null>(null);
 const canManage=['SUPER_ADMIN','ADMIN','TENANT_ADMIN'].includes(user?.role||'');
 useEffect(()=>{saleRequest.current?.abort();setLatest(null);setSource('sample');setSaleLoading(false);setReceiptCompany({name:''});setProfile(normalizePosReceiptProfile(DEFAULT_POS_RECEIPT));setDevice(loadPosPrintSettings(key));let active=true;setLoaded(false);setError('');apiFetch<{settings:{posReceipt?:PosReceiptProfile;company?:unknown};tenant?:{name:string}}>('/v1/settings').then(data=>{if(active){setReceiptCompany(receiptCompanyFromSettings(data.settings.company,data.tenant?.name||'Business'));setProfile(normalizePosReceiptProfile(data.settings.posReceipt||legacyReceiptProfile(loadPosPrintSettings(key))));setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;saleRequest.current?.abort();};},[key,revision]);
 useEffect(()=>{let frame=0;const update=()=>{frame=requestAnimationFrame(()=>setFont(getComputedStyle(document.documentElement).getPropertyValue('--font').trim()));};window.addEventListener('hudumika-ds-updated',update);return()=>{cancelAnimationFrame(frame);window.removeEventListener('hudumika-ds-updated',update);};},[]);
 const example=useMemo(()=>sample(company.currency||'TZS'),[company.currency]);const sale=source==='latest'&&latest?latest:example;
 const html=useMemo(()=>buildPosReceiptHtml(sale,device,receiptCompany,profile,font),[sale,device,receiptCompany,profile,font]);
 async function loadLatest(){saleRequest.current?.abort();const controller=new AbortController();saleRequest.current=controller;setSource('latest');setLatest(null);setSaleError('');setSaleLoading(true);try{const result=await apiFetch<{items:PosSale[]}>('/v1/finance/pos/sales?page=1&page_size=5',{signal:controller.signal});if(!result.items.length){setSaleError('No sales yet. Showing sample data.');return;}setLatest(await apiFetch<PosSale>(`/v1/finance/pos/sales/${result.items[0].id}`,{signal:controller.signal}));}catch(e){if(controller.signal.aborted)return;setSaleError(e instanceof Error?e.message:'Could not load the latest sale.');}finally{if(!controller.signal.aborted)setSaleLoading(false);}}
 async function saveReceipt(){setSaving(true);setError('');setNotice('');try{await apiFetch('/v1/settings',{method:'PATCH',body:JSON.stringify({posReceipt:profile})});window.dispatchEvent(new Event('hudumika-pos-receipt-saved'));setNotice('Receipt template and visibility saved for this tenant. All tills use these settings when printing.');}catch(e){setError(e instanceof Error?e.message:'Could not save receipt settings.');}finally{setSaving(false);}}
 function saveDevice(){try{localStorage.setItem(key,JSON.stringify(device));setNotice('Printer preferences saved for this browser, tenant and account.');}catch{setError('Browser storage is unavailable. Printer preferences were not saved.');}}
 function testPrint(){printPosReceipt({...example,sale_number:'TEST PRINT · NOT A SALE'},device,receiptCompany,profile,setError);}
 return <div className="space-y-5 min-w-0">
  <PageHeader crumbs={['FinOps','POS','Settings']} titlePlain="Receipt & printer" titleEm="settings" subtitle="Choose a tenant receipt template, control what customers see, and configure this till’s print layout." backTo="/finance/pos" backLabel="Return to POS" actions={<><Button variant="outline" onClick={testPrint} disabled={!loaded}>Print test receipt</Button>{canManage&&<Button disabled={!loaded||saving} onClick={saveReceipt}>{saving?'Saving…':'Save tenant receipt'}</Button>}</>}/>
  {error&&<Banner variant="error">{error}{!loaded&&<Button variant="outline" size="sm" onClick={()=>setRevision(r=>r+1)}>Retry settings</Button>}</Banner>}
  {notice&&<div role="status"><Banner>{notice}</Banner></div>}
  <Tabs defaultValue="settings"><div className="xl:hidden"><TabsList className="mb-4" aria-label="Receipt settings view"><TabsTrigger value="settings">Settings</TabsTrigger><TabsTrigger value="preview">Receipt preview</TabsTrigger></TabsList></div><div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2 items-start">
   <TabsContent value="settings" forceMount className="min-w-0 space-y-5 data-[state=inactive]:hidden xl:data-[state=inactive]:block">
    <SectionCard title="Industry receipt templates" collapsible={false}>
     <p className="text-sm text-muted-foreground mb-4">Tenant settings apply across tills. Selecting a preset changes its layout and visibility defaults; your header and footer are kept.</p>
     {!canManage&&<Banner variant="info">A workspace administrator can change tenant receipt settings. You can configure this device below.</Banner>}
     {!loaded&&!error?<SectionLoading/>:<fieldset disabled={!canManage||!loaded||saving} className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3">{POS_RECEIPT_TEMPLATES.map(t=><Button key={t.id} type="button" variant={profile.template===t.id?'default':'outline'} aria-pressed={profile.template===t.id} className="h-auto whitespace-normal justify-start text-left p-4" onClick={()=>setProfile(current=>({...receiptTemplateProfile(t.id),header:current.header,footer:current.footer}))}><span><span className="block font-semibold">{t.name}</span><span className="block text-xs mt-1">{t.industry}</span><span className="block text-xs font-normal mt-2">{t.description}</span></span></Button>)}</fieldset>}
    </SectionCard>
    <SectionCard title="Receipt content & visibility" collapsible={false} action={<Button size="sm" variant="ghost" disabled={!canManage||!loaded} onClick={()=>setProfile(receiptTemplateProfile(profile.template))}>Reset content</Button>}>
     <fieldset disabled={!canManage||!loaded||saving} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
       <div className="space-y-2"><Label htmlFor="receipt-heading">Receipt heading</Label><Input id="receipt-heading" maxLength={80} value={profile.heading} onChange={e=>setProfile(p=>({...p,heading:e.target.value}))}/></div>
       <div className="space-y-2"><Label htmlFor="receipt-footer-title">Closing heading</Label><Input id="receipt-footer-title" maxLength={100} value={profile.footerTitle} onChange={e=>setProfile(p=>({...p,footerTitle:e.target.value}))}/></div>
       <div className="space-y-2"><Label htmlFor="receipt-typography">Receipt typography</Label><Select value={profile.typography} onValueChange={value=>setProfile(p=>({...p,typography:value as 'brand'|'mono'}))}><SelectTrigger id="receipt-typography"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="brand">Hudumika brand font</SelectItem><SelectItem value="mono">Thermal monospace</SelectItem></SelectContent></Select></div>
       <div className="space-y-2"><Label htmlFor="receipt-code">Receipt reference code</Label><Select value={profile.code} onValueChange={value=>setProfile(p=>({...p,code:value as 'none'|'qr'}))}><SelectTrigger id="receipt-code"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No code</SelectItem><SelectItem value="qr">QR · receipt number</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="receipt-header">Additional header</Label><Textarea id="receipt-header" maxLength={500} rows={3} value={profile.header} onChange={e=>setProfile(p=>({...p,header:e.target.value}))}/><p className="text-xs text-muted-foreground">Company identity and logo come from tenant company settings.</p></div>
      <div className="space-y-2"><Label htmlFor="receipt-footer">Footer / returns policy</Label><Textarea id="receipt-footer" maxLength={500} rows={3} value={profile.footer} onChange={e=>setProfile(p=>({...p,footer:e.target.value}))}/></div>
      <div className="divide-y">{Object.entries(labels).map(([key,label])=><SwitchRow key={key} title={label} checked={profile.visibility[key as PosReceiptField]} onCheckedChange={value=>setProfile(p=>({...p,visibility:{...p.visibility,[key]:value}}))}/>)}</div>
      <p className="text-xs text-muted-foreground">Item names, quantities, total, currency and sale status remain visible. This sales receipt is not a replacement for an authorized fiscal receipt.</p>
     </fieldset>
    </SectionCard>
    <SectionCard title="Printer preferences · this device" collapsible={false} action={<Button size="sm" variant="ghost" onClick={()=>setDevice({...DEFAULT_POS_PRINT})}>Reset printer</Button>}>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2"><Label htmlFor="pos-paper">Paper format</Label><Select value={device.paper} onValueChange={paper=>setDevice(d=>({...d,paper:paper as typeof d.paper}))}><SelectTrigger id="pos-paper"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="58mm">58 mm thermal</SelectItem><SelectItem value="80mm">80 mm thermal</SelectItem><SelectItem value="A4">A4 / Save as PDF</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="pos-size">Text size</Label><Select value={device.textSize} onValueChange={textSize=>setDevice(d=>({...d,textSize:textSize as typeof d.textSize}))}><SelectTrigger id="pos-size"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="small">Small</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Large</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="pos-margin">Margins</Label><Select value={String(device.margin)} onValueChange={margin=>setDevice(d=>({...d,margin:Number(margin)}))}><SelectTrigger id="pos-margin"><SelectValue/></SelectTrigger><SelectContent>{[2,4,6].map(n=><SelectItem key={n} value={String(n)}>{n} mm</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="pos-copies">Copies</Label><Select value={String(device.copies)} onValueChange={copies=>setDevice(d=>({...d,copies:Number(copies) as 1|2}))}><SelectTrigger id="pos-copies"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">One copy</SelectItem><SelectItem value="2">Customer + duplicate</SelectItem></SelectContent></Select></div>
     </div>
     <SwitchRow title="Print after checkout" description="Open the browser print dialog after a saved sale. You still confirm printing." checked={device.autoPrint} onCheckedChange={autoPrint=>setDevice(d=>({...d,autoPrint}))}/>
     <Button className="mt-4" variant="outline" onClick={saveDevice}>Save device preferences</Button>
     <p className="text-sm text-muted-foreground mt-4">Choose your USB, network or paired Bluetooth printer in the browser print dialog. Match paper size, use 100% scale and disable browser headers and footers. The browser controls printer destination; silent printing, ESC/POS and drawer pulses are not connected.</p>
    </SectionCard>
   </TabsContent>
   <TabsContent value="preview" forceMount className="min-w-0 xl:sticky xl:top-4 data-[state=inactive]:hidden xl:data-[state=inactive]:block">
    <SectionCard title="Live receipt preview" collapsible={false}>
     <div className="flex flex-wrap gap-2 mb-3"><Button size="sm" variant={source==='sample'?'default':'outline'} onClick={()=>setSource('sample')}>Sample sale</Button><Button size="sm" variant={source==='latest'?'default':'outline'} disabled={saleLoading} onClick={loadLatest}>{saleLoading?'Loading…':'Most recent sale'}</Button></div>
     <p className="text-xs text-muted-foreground mb-3">{source==='latest'&&latest?'Real sale data with your current unsaved layout. No sale is changed.':'Sample data — not a transaction. Preview reflects unsaved settings.'} {device.paper} · {device.textSize} text · {device.copies} {device.copies===1?'copy':'copies'}</p>
     {saleError&&<Banner variant="info">{saleError}</Banner>}
     {!loaded?<SectionLoading/>:<PosReceiptPreview html={html} title="Live receipt preview"/>}
     <p className="text-xs text-muted-foreground mt-3">Preview and print use the same renderer. Physical margins and printable area depend on the selected printer driver.</p>
    </SectionCard>
   </TabsContent>
  </div></Tabs>
 </div>;
}
