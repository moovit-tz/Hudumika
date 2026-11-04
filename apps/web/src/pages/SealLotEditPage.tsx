import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SealLot, SealLotUpdate, SealCatalogProduct } from '@hudumika/types';
import { PageHeader } from '../components/PageHeader.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Banner } from '../components/ui/alert.js';
import { SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { Combobox } from '../components/ui/combobox.js';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

type Draft = {
  description: string; productId: string; hsCode: string; countryOfOrigin: string; marksAndNumbers: string;
  batch: string; serial: string; expiryDate: string; expiresOn: string; volumeCbm: string; grossWeightKg: string;
  destinationLabel: string; isDangerousGoods: boolean; unNumber: string; imdgClass: string;
  requiresReefer: boolean; reeferSetpointC: string;
};
const labels: Record<keyof Draft,string> = {
  description:'Description',productId:'Catalogue product',hsCode:'HS code',countryOfOrigin:'Country of origin',marksAndNumbers:'Marks and numbers',
  batch:'Batch',serial:'Serial number',expiryDate:'Product expiry',expiresOn:'Storage deadline',volumeCbm:'Volume (CBM)',grossWeightKg:'Gross weight (kg)',
  destinationLabel:'Destination',isDangerousGoods:'Dangerous goods',unNumber:'UN number',imdgClass:'IMDG class',requiresReefer:'Refrigerated goods',reeferSetpointC:'Temperature setpoint (°C)',
};
const asDate = (value:string|null) => value ? new Date(value).toISOString().slice(0,10) : '';
function fromLot(lot:SealLot):Draft {
  return {description:lot.description,productId:lot.productId??'',hsCode:lot.hsCode??'',countryOfOrigin:lot.countryOfOrigin??'',marksAndNumbers:lot.marksAndNumbers??'',
    batch:lot.batch??'',serial:lot.serial??'',expiryDate:asDate(lot.expiryDate),expiresOn:asDate(lot.expiresOn),volumeCbm:lot.volumeCbm==null?'':String(lot.volumeCbm),
    grossWeightKg:lot.grossWeightKg==null?'':String(lot.grossWeightKg),destinationLabel:lot.destinationLabel??'',isDangerousGoods:lot.isDangerousGoods,
    unNumber:lot.unNumber??'',imdgClass:lot.imdgClass??'',requiresReefer:lot.requiresReefer,reeferSetpointC:lot.reeferSetpointC==null?'':String(lot.reeferSetpointC)};
}

export function SealLotEditPage() {
  const {id}=useParams(); const navigate=useNavigate();
  const [lot,setLot]=useState<SealLot|null>(null); const [draft,setDraft]=useState<Draft|null>(null);
  const [products,setProducts]=useState<SealCatalogProduct[]>([]); const [catalogError,setCatalogError]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [reason,setReason]=useState(''); const [step,setStep]=useState(0); const [version,setVersion]=useState(0);
  const backTo=`/seal/lots/${id}`;
  useEffect(()=>{
    let active=true;setLoading(true);
    Promise.all([apiFetch(`/v1/seal/lots/${id}`),apiFetch('/v1/seal/catalog-products').catch(e=>{if(active)setCatalogError(e.message);return [];})])
      .then(([data,catalog])=>{if(active){setLot(data);setDraft(fromLot(data));setProducts(catalog);setError(null);setStep(0);}})
      .catch(e=>{if(active){setLot(null);setDraft(null);setError(e.message);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[id,version]);
  function update<K extends keyof Draft>(field:K,value:Draft[K]){setDraft(current=>current?{...current,[field]:value}:current);}
  function validate():boolean {
    if(!draft)return false;
    if(!draft.description.trim()){setError('Enter a description.');return false;}
    if(draft.countryOfOrigin&&!/^[A-Z]{2}$/.test(draft.countryOfOrigin)){setError('Country of origin must be a two-letter country code.');return false;}
    if(step===0){setError(null);return true;}
    for(const field of ['volumeCbm','grossWeightKg','reeferSetpointC'] as const){if(draft[field]&&!Number.isFinite(Number(draft[field]))){setError(`Enter a valid ${labels[field].toLowerCase()}.`);return false;}}
    if(draft.volumeCbm&&Number(draft.volumeCbm)<=0){setError('Volume must be greater than zero.');return false;}
    if(draft.grossWeightKg&&Number(draft.grossWeightKg)<0){setError('Gross weight cannot be negative.');return false;}
    if(draft.isDangerousGoods&&(!draft.unNumber.trim()||!draft.imdgClass.trim())){setError('Enter the UN number and IMDG class for dangerous goods.');return false;}
    if(draft.requiresReefer&&!draft.reeferSetpointC.trim()){setError('Enter the refrigerated temperature setpoint.');return false;}
    setError(null);return true;
  }
  async function submit(){
    if(!draft||!lot||!validate())return;
    if(step<2){setStep(s=>s+1);return;}
    if(!reason.trim()){setError('Enter a reason for these corrections.');return;}
    const text=(value:string)=>value.trim()||null;
    const number=(value:string)=>value.trim()===''?null:Number(value);
    const payload:SealLotUpdate={expectedUpdatedAt:lot.updatedAt,reason:reason.trim(),description:draft.description.trim(),productId:text(draft.productId),
      hsCode:text(draft.hsCode),countryOfOrigin:text(draft.countryOfOrigin),marksAndNumbers:text(draft.marksAndNumbers),batch:text(draft.batch),serial:text(draft.serial),
      expiryDate:text(draft.expiryDate),expiresOn:text(draft.expiresOn),volumeCbm:number(draft.volumeCbm),grossWeightKg:number(draft.grossWeightKg),destinationLabel:text(draft.destinationLabel),
      isDangerousGoods:draft.isDangerousGoods,unNumber:text(draft.unNumber),imdgClass:text(draft.imdgClass),requiresReefer:draft.requiresReefer,reeferSetpointC:number(draft.reeferSetpointC)};
    setSaving(true);
    try{await apiFetch(`/v1/seal/lots/${id}`,{method:'PATCH',body:JSON.stringify(payload)});navigate(backTo);}
    catch(e){setError(e instanceof Error?e.message:'Lot update failed.');}
    finally{setSaving(false);}
  }
  const textField=(field:keyof Draft,type:'text'|'number'='text')=><div className="space-y-2" key={field}><Label htmlFor={`lot-${field}`}>{labels[field]}</Label><Input id={`lot-${field}`} type={type} step={type==='number'?'any':undefined} value={String(draft?.[field]??'')} onChange={e=>update(field,field==='countryOfOrigin'?e.target.value.toUpperCase():e.target.value)} /></div>;
  const initial=lot?fromLot(lot):null;
  const changes=draft&&initial?(Object.keys(labels) as Array<keyof Draft>).filter(key=>draft[key]!==initial[key]):[];
  return <div className="seal-page">
    <PageHeader crumbs={[{label:'SEAL',to:'/seal'},{label:'Lots',to:'/seal/lots'},{label:'Lot',to:backTo},'Edit']} titlePlain="Edit" titleEm="lot" subtitle={lot?.description} variant="create" backTo={backTo} backLabel="Back to lot" />
    {error&&<Banner variant="error">{error}<Button variant="outline" size="sm" className="ml-3" disabled={saving} onClick={()=>setVersion(v=>v+1)}>Reload latest details</Button></Banner>}
    {catalogError&&<Banner variant="warning">Catalogue products could not be loaded: {catalogError}</Banner>}
    {loading?<SectionLoading label="Loading lot details…"/>:draft&&lot&&<form onSubmit={e=>{e.preventDefault();void submit();}}>
      <Card>
        <CardHeader><CardTitle>Edit lot details</CardTitle><nav aria-label="Edit lot steps" className="flex flex-wrap gap-2 mt-3">{['Details','Storage & handling','Review changes'].map((label,i)=><Button key={label} type="button" variant={step===i?'default':'outline'} size="sm" disabled={saving||i>step} aria-current={i===step?'step':undefined} onClick={()=>setStep(i)}>{i+1}. {label}</Button>)}</nav></CardHeader>
        <CardContent className="space-y-6">
          {step===0&&<div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">{textField('description')}</div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Catalogue product</legend><Combobox value={draft.productId||'__none__'} onChange={value=>update('productId',value==='__none__'?'':value)} options={[{value:'__none__',label:'No linked product'},...products.map(p=>({value:p.id,label:p.name,sublabel:p.code})),...draft.productId&&!products.some(p=>p.id===draft.productId)?[{value:draft.productId,label:'Current linked product'}]:[]]} placeholder="Choose product"/></fieldset>
            {textField('batch')}{textField('serial')}{textField('hsCode')}{textField('countryOfOrigin')}{textField('marksAndNumbers')}{textField('destinationLabel')}
          </div>}
          {step===1&&<div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">{textField('volumeCbm','number')}{textField('grossWeightKg','number')}
              {(['expiryDate','expiresOn'] as const).map(field=><fieldset className="space-y-2" key={field}><legend className="text-sm font-medium">{labels[field]}</legend><DatePicker date={parseDateOnly(draft[field])} onChange={date=>update(field,date?toDateOnlyString(date):'')} placeholder={`Choose ${labels[field].toLowerCase()}`} /><Button type="button" variant="ghost" size="sm" onClick={()=>update(field,'')}>Clear {labels[field].toLowerCase()}</Button></fieldset>)}
            </div>
            <SwitchRow title="Dangerous goods" description="Validate the classification against goods sharing this location." checked={draft.isDangerousGoods} onCheckedChange={value=>update('isDangerousGoods',value)}/>
            {draft.isDangerousGoods&&<div className="grid gap-5 md:grid-cols-2">{textField('unNumber')}{textField('imdgClass')}</div>}
            <SwitchRow title="Refrigerated goods" checked={draft.requiresReefer} onCheckedChange={value=>update('requiresReefer',value)}/>
            {draft.requiresReefer&&textField('reeferSetpointC','number')}
            <p className="text-sm text-muted-foreground">Volume corrections affect unbilled storage charges. Previously generated invoices retain their recorded amounts.</p>
          </div>}
          {step===2&&<div className="space-y-5">
            <h2 className="text-lg font-semibold">Review corrections</h2>
            {changes.length?<dl className="divide-y"><div className="hidden md:grid md:grid-cols-3 gap-2 pb-2 text-sm text-muted-foreground"><dt>Detail</dt><dd>Before</dd><dd>After</dd></div>{changes.map(key=><div key={key} className="grid gap-2 py-3 md:grid-cols-3"><dt className="font-medium">{labels[key]}</dt><dd className="text-muted-foreground break-words">{String(initial?.[key]??'')||'Not set'}</dd><dd className="break-words">{String(draft[key])||'Not set'}</dd></div>)}</dl>:<p>No details have changed.</p>}
            <div className="space-y-2"><Label htmlFor="lot-edit-reason">Reason for corrections</Label><Textarea id="lot-edit-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} placeholder="Explain why these details need correcting" required /></div>
            <Banner variant="info">Quantity, units, owner, receipt date, location and customs status stay with their warehouse and customs actions.</Banner>
          </div>}
          <div className="flex flex-wrap justify-between gap-3 border-t pt-5"><Button variant="outline" type="button" asChild disabled={saving}><Link to={backTo}>Cancel</Link></Button><div className="flex gap-3">{step>0&&<Button type="button" variant="outline" disabled={saving} onClick={()=>{setStep(s=>s-1);setError(null);}}>Back</Button>}<Button type="submit" disabled={saving||(step===2&&(!reason.trim()||!changes.length))}>{saving&&<ButtonSpinner/>}{saving?'Saving…':step===2?'Save Changes':'Next'}</Button></div></div>
        </CardContent>
      </Card>
    </form>}
  </div>;
}
