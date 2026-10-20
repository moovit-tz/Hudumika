import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';
import { CheckboxRow } from '../components/ui/list-item-row.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Banner } from '../components/ui/alert.js';
import { Progress } from '../components/ui/progress.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import './TrackingNewExpense.css';

interface Vehicle { id: string; name: string; plate_number: string | null; ownership?: string }
interface Vendor { id: string; name: string; active: boolean }
interface Trip { id: string; vehicle_id: string; origin: string | null; destination: string | null; customer_id: string | null; shipment_ref: string | null }
const categories = [['FUEL','Fuel'],['MAINTENANCE','Maintenance / parts'],['TOLL','Toll'],['PARKING','Parking'],['FINE','Fine / ticket'],['WASH','Wash / cleaning'],['INSURANCE','Insurance'],['REGISTRATION','Registration / tax'],['OTHER','Other']] as const;
const steps = ['Expense details', 'Amount & date', 'Links & recovery', 'Review'];

export const TrackingNewExpense: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [form, setForm] = useState({ vehicle_id:'',category:'',vendor_id:'',amount:'',date:toDateOnlyString(new Date()),notes:'',trip_id:'',billable:false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  async function loadOptions() {
    setLoading(true); setLoadError('');
    try { const [assets, partners, journeys] = await Promise.all([apiFetch('/v1/tracking/vehicles'),apiFetch('/v1/tracking/vendors'),apiFetch('/v1/tracking/trips')]);setVehicles(assets);setVendors(partners);setTrips(journeys); }
    catch(e) { setLoadError(e instanceof Error ? e.message : 'Unable to load expense options.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadOptions(); }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  function validate(index: number) {
    if(index === 0 && (!form.vehicle_id || !vehicles.some(v => v.id === form.vehicle_id))) return 'Select a vehicle.';
    if(index === 0 && !categories.some(([value]) => value === form.category)) return 'Select an expense category.';
    if(index === 1 && (!form.amount.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)) return 'Enter an amount greater than zero.';
    if(index === 1 && !/^\d+(\.\d{1,2})?$/.test(form.amount)) return 'Use an amount with no more than two decimal places.';
    if(index === 1 && (!form.date || !parseDateOnly(form.date))) return 'Choose the expense date.';
    if(index === 2 && form.trip_id && !trips.some(t => t.id === form.trip_id && t.vehicle_id === form.vehicle_id)) return 'Choose a trip belonging to this vehicle.';
    if(index === 2 && form.billable && !form.trip_id) return 'Link a trip before marking the expense billable.';
    return '';
  }
  function moveTo(next: number) {
    if(saving) return;
    if(next > step) for(let index=0;index<=step;index++){const message=validate(index);if(message){setError(message);setStep(index);return;}}
    setError('');setStep(next);setFurthest(previous=>Math.max(previous,next));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if(step < 3){moveTo(step+1);return;}
    for(let index=0;index<3;index++){const message=validate(index);if(message){setError(message);setStep(index);return;}}
    if(savingRef.current || loadError || loading) return;
    savingRef.current=true;setSaving(true);setError('');
    try { await apiFetch(`/v1/tracking/vehicles/${form.vehicle_id}/expenses`,{method:'POST',body:JSON.stringify({category:form.category,amount:Number(form.amount),expense_date:form.date,vendor_id:form.vendor_id || undefined,description:form.notes.trim(),trip_id:form.trip_id || undefined,billable:form.billable})});navigate(`/tracking/vehicles/${form.vehicle_id}`); }
    catch(e){setError(e instanceof Error ? e.message : 'Unable to save expense. Your entries are preserved.');}
    finally{savingRef.current=false;setSaving(false);}
  }
  const selectedVehicle=vehicles.find(v=>v.id===form.vehicle_id);
  const selectedTrip=trips.find(t=>t.id===form.trip_id);
  const tripLabel=(trip:Trip)=>`${trip.origin || 'Origin not recorded'} → ${trip.destination || 'Destination not recorded'} · TRIP-${trip.id.slice(0,8).toUpperCase()}`;
  return <div className="expense-wizard">
    <PageHeader crumbs={['HuduFreight','Expenses','New']} titlePlain="Record an" titleEm="expense" subtitle="Record one operating cost, link its context and review before saving." variant="create" backTo="/tracking/vehicles" />
    <div className="expense-wizard-progress"><div aria-live="polite">Step {step+1} of 4 · {steps[step]}</div><Progress value={(step+1)*25} aria-label="Expense entry progress" /><Tabs value={String(step)} onValueChange={value=>moveTo(Number(value))}><TabsList wrap aria-label="Expense entry steps">{steps.map((label,index)=><TabsTrigger key={label} value={String(index)} disabled={index>furthest || saving}>{index+1}. {label}</TabsTrigger>)}</TabsList></Tabs></div>
    {loadError && <Banner variant="error">{loadError} <Button type="button" variant="outline" size="sm" onClick={()=>void loadOptions()}>Retry</Button></Banner>}
    <SectionCard><form onSubmit={submit} className="expense-wizard-form">
      <div><h2 ref={heading} tabIndex={-1}>{steps[step]}</h2><p>{['Choose the vehicle and the kind of cost you are recording.','Enter the actual amount and date. This records a cost; it does not make a payment.','Add the supplier, trip and recovery instructions where applicable.','Check the details. The expense is created only when you select Save expense.'][step]}</p></div>
      {error && <Banner variant="error">{error}</Banner>}
      <fieldset disabled={saving}>
        {step===0 && <>
          <div><div className="expense-wizard-label">Vehicle *</div><Combobox disabled={loading || !!loadError} options={vehicles.filter(v=>v.ownership!=='DEMO').map(v=>({value:v.id,label:v.name,sublabel:v.plate_number || undefined}))} value={form.vehicle_id} onChange={value=>setForm(current=>({...current,vehicle_id:value,trip_id:'',billable:false}))} placeholder={loading?'Loading vehicles…':'Select vehicle'} /></div>
          <div><label id="expense-category-label" className="expense-wizard-label">Category *</label><Select value={form.category} onValueChange={value=>setForm(current=>({...current,category:value}))}><SelectTrigger aria-labelledby="expense-category-label"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        </>}
        {step===1 && <>
          <label htmlFor="fleet-expense-amount">Amount *<Input id="fleet-expense-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={e=>setForm(current=>({...current,amount:e.target.value}))} /></label>
          <p className="expense-wizard-note">Use the same accounting currency as your fleet records. This register does not store a separate currency or exchange rate.</p>
          <div><div className="expense-wizard-label">Expense date *</div><DatePicker date={parseDateOnly(form.date)} onChange={value=>setForm(current=>({...current,date:toDateOnlyString(value)}))} /></div>
        </>}
        {step===2 && <>
          <div><div className="expense-wizard-label">Vendor · optional</div><Combobox options={[{value:'',label:'No vendor'},...vendors.filter(v=>v.active).map(v=>({value:v.id,label:v.name}))]} value={form.vendor_id} onChange={value=>setForm(current=>({...current,vendor_id:value}))} placeholder="No vendor" /></div>
          <div><div className="expense-wizard-label">Trip · optional</div><Combobox options={[{value:'',label:'Not linked to a trip'},...trips.filter(t=>t.vehicle_id===form.vehicle_id).map(t=>({value:t.id,label:tripLabel(t),sublabel:t.shipment_ref || undefined}))]} value={form.trip_id} onChange={value=>setForm(current=>({...current,trip_id:value,billable:value?current.billable:false}))} placeholder="Not linked to a trip" /></div>
          <CheckboxRow title="Mark billable to customer" description={form.trip_id?'Eligible for later invoicing from the trip. Saving this expense does not create an invoice.':'Link a trip to enable customer recovery.'} checked={form.billable} disabled={!form.trip_id} onCheckedChange={value=>setForm(current=>({...current,billable:value}))} />
          <label htmlFor="fleet-expense-notes">Notes · optional<Textarea id="fleet-expense-notes" rows={4} maxLength={4000} value={form.notes} onChange={e=>setForm(current=>({...current,notes:e.target.value}))} placeholder="Purpose, receipt reference or supporting context" /></label>
          <p className="expense-wizard-note">This form saves a single expense. Receipt uploads and recurring schedules are not supported here.</p>
        </>}
        {step===3 && <dl>{[['Vehicle',selectedVehicle?.name || 'Not selected'],['Category',categories.find(([value])=>value===form.category)?.[1] || form.category],['Amount',Number(form.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})],['Date',form.date],['Vendor',vendors.find(v=>v.id===form.vendor_id)?.name || 'Not linked'],['Trip',selectedTrip?tripLabel(selectedTrip):'Not linked'],['Customer recovery',form.billable?'Marked billable; not yet invoiced':'Not billable'],['Notes',form.notes || 'Not provided']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </fieldset>
      <div className="expense-wizard-actions"><Button type="button" variant="ghost" asChild><Link to="/tracking/vehicles">Cancel</Link></Button><div>{step>0 && <Button type="button" variant="outline" disabled={saving} onClick={()=>moveTo(step-1)}>Back</Button>}<Button type="submit" disabled={saving || loading || !!loadError}>{saving?'Saving…':step===3?'Save expense':'Continue'}</Button></div></div>
    </form></SectionCard>
  </div>;
};
