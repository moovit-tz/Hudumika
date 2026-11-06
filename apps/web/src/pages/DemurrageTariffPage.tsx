import { SwitchRow } from '../components/ui/list-item-row.js';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
export function DemurrageTariffPage() {
 const navigate=useNavigate();const {id}=useParams();const [carrier,setCarrier]=useState('');const [size,setSize]=useState('');const [currency,setCurrency]=useState('USD');const [free,setFree]=useState(7);const [date,setDate]=useState('');const [active,setActive]=useState(true);
 const [tiers,setTiers]=useState([{from_day:1,to_day:30,daily_rate:0}]); const [error,setError]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{if(id)apiFetch('/v1/demurrage/').then((rows:any[])=>{const row=rows.find(r=>r.id===id);if(!row)throw new Error('Tariff not found');setCarrier(row.carrier_name);setSize(row.container_size);setCurrency(row.currency);setFree(row.free_days);setActive(row.active);setDate(String(row.effective_from).slice(0,10));setTiers(typeof row.rate_tiers==='string'?JSON.parse(row.rate_tiers):row.rate_tiers);}).catch(e=>setError(e.message));},[id]);
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setError('');try{await apiFetch(id?`/v1/demurrage/tariffs/${id}`:'/v1/demurrage/tariffs',{method:id?'PATCH':'POST',body:JSON.stringify({carrier_name:carrier,container_size:size,currency,free_days:free,rate_tiers:tiers,...(!id?{effective_from:date}:{active})})});navigate('/cargotracker/demurrage?view=tariffs');}catch(err:any){setError(err.message);}finally{setSaving(false);}}
 return <><PageHeader crumbs={['Safetracker','Demurrage']} titlePlain={id?'Edit':'New'} titleEm="tariff" subtitle="UTC calendar days, excluding the discharge date. Tiers start at chargeable day 1; the final tier rate continues afterward. Create a new dated tariff for a rate revision."/>
 <SectionCard title="Tariff rules"><form onSubmit={save} className="grid gap-4 max-w-3xl"><div className="grid sm:grid-cols-2 gap-4">
 <label className="grid gap-2">Facility or carrier schedule<Input required value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label className="grid gap-2">Container size code<Input required placeholder="e.g. 40HC" value={size} onChange={e=>setSize(e.target.value)}/></label>
 <label className="grid gap-2">Currency (ISO code)<Input required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label><label className="grid gap-2">Free days<Input required type="number" min={0} max={3650} value={free} onChange={e=>setFree(Number(e.target.value))}/></label>
 {!id&&<label className="grid gap-2">Effective from<DatePicker date={parseDateOnly(date)} onChange={d=>setDate(toDateOnlyString(d))}/></label>}</div>
 {tiers.map((tier,i)=><fieldset key={i} className="grid grid-cols-3 gap-3 border rounded-lg p-3"><legend>Tier {i+1}</legend>{(['from_day','to_day','daily_rate'] as const).map(key=><label key={key} className="grid gap-2">{key.replaceAll('_',' ')}<Input required type="number" min={key==='daily_rate'?0:1} step={key==='daily_rate'?'0.01':'1'} value={tier[key]} onChange={e=>setTiers(prev=>prev.map((t,n)=>n===i?{...t,[key]:Number(e.target.value)}:t))}/></label>)}</fieldset>)}
 <div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setTiers(prev=>[...prev,{from_day:prev.at(-1)!.to_day+1,to_day:prev.at(-1)!.to_day+30,daily_rate:0}])}>Add tier</Button>{tiers.length>1&&<Button type="button" variant="outline" onClick={()=>setTiers(prev=>prev.slice(0,-1))}>Remove last tier</Button>}</div>
 {id&&<SwitchRow title="Available for new calculations" description="Existing charges retain their saved tariff. Create a new dated version for rate changes." checked={active} onCheckedChange={setActive}/>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-2"><Button disabled={saving}>{saving?'Saving…':'Save tariff'}</Button><Button type="button" variant="outline" onClick={()=>navigate(-1)}>Cancel</Button></div></form></SectionCard></>;
}
