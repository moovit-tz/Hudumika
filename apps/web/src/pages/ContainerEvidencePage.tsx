import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';

export function ContainerEvidencePage() {
 const { number, kind } = useParams(); const navigate = useNavigate(); const survey = kind === 'survey'; const stage = kind === 'stage'; const [params]=useSearchParams(); const [location,setLocation]=useState('');
 const [grade,setGrade]=useState(''); const [surveyor,setSurveyor]=useState(''); const [date,setDate]=useState('');
 const [notes,setNotes]=useState(''); const [photos,setPhotos]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 async function save(event: React.FormEvent) {
  event.preventDefault(); setSaving(true); setError('');
  try {
   await apiFetch(`/v1/tracker/containers/${encodeURIComponent(number || '')}/${stage?'stage':survey?'surveys':'repairs'}`, {method:stage?'PATCH':'POST',body:JSON.stringify(stage?{stage:params.get('next'),notes,location}:survey?{grade,surveyor_name:surveyor,survey_date:date,surveyor_notes:notes,photos:photos.split('\n').map(s=>s.trim()).filter(Boolean)}:{description:notes,repair_type:'cosmetic',...(date?{repair_date:`${date}T12:00:00.000Z`}:{})})});
   navigate(`/cargotracker/containers/${number}`);
  } catch(err:any) {setError(err.message || 'Could not save evidence');} finally {setSaving(false);}
 }
 return <><PageHeader crumbs={['Safetracker','Containers',number || '']} titlePlain="Record" titleEm={stage?'movement':survey?'survey':'repair'} subtitle="Record observations from an actual inspection. Saved reports do not independently certify regulatory compliance." />
 <SectionCard title={number || 'Container'}><form onSubmit={save} className="grid gap-4 max-w-2xl">
 {survey&&<><label className="grid gap-2">Inspection grade<Input required value={grade} onChange={e=>setGrade(e.target.value)} maxLength={100}/></label><label className="grid gap-2">Surveyor name<Input required value={surveyor} onChange={e=>setSurveyor(e.target.value)} maxLength={200}/></label></>}
 {stage&&<label className="grid gap-2">Actual location<Input required value={location} onChange={e=>setLocation(e.target.value)} maxLength={300}/></label>}
 {!stage&&<label className="grid gap-2">{survey?'Survey date':'Repair date'}<DatePicker date={parseDateOnly(date)} onChange={d=>setDate(toDateOnlyString(d))}/></label>}
 <label className="grid gap-2">{stage?'Movement evidence / document references':survey?'Inspection observations':'Repair description'}<Textarea required value={notes} onChange={e=>setNotes(e.target.value)} maxLength={survey?10000:4000}/></label>
 {survey&&<label className="grid gap-2">Inspection photo URLs (one HTTPS URL per line)<Textarea value={photos} onChange={e=>setPhotos(e.target.value)}/></label>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving?'Saving…':'Save record'}</Button><Button type="button" variant="outline" onClick={()=>navigate(-1)}>Cancel</Button></div>
 </form></SectionCard></>;
}
