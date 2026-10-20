import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { Progress } from '../components/ui/progress.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import './TrackingDriverNew.css';

interface Vehicle { id: string; name: string; plate_number: string | null; status: string; ownership?: string }
const steps = ['Personal details', 'Driving licence', 'Vehicle assignment', 'Review'];

export const TrackingDriverNew: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesError, setVehiclesError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [assignedVehicleId, setAssignedVehicleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadVehicles() {
    setVehiclesLoading(true); setVehiclesError('');
    try { setVehicles(await apiFetch('/v1/tracking/vehicles')); }
    catch (e) { setVehiclesError(e instanceof Error ? e.message : 'Unable to load vehicles.'); }
    finally { setVehiclesLoading(false); }
  }
  useEffect(() => { void loadVehicles(); }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  function validate(index: number) {
    if (index === 0 && !name.trim()) return 'Enter the driver’s full name.';
    if (name.trim().length > 200) return 'Keep the name within 200 characters.';
    if (phone.trim().length > 30) return 'Keep the phone number within 30 characters.';
    if (index === 1 && licenseExpiry && !licenseNumber.trim()) return 'Enter a licence number for this expiry date.';
    return '';
  }
  function moveTo(next: number) {
    if (saving) return;
    if (next > step) {
      for (let index = 0; index <= step; index++) { const message = validate(index); if (message) { setError(message); setStep(index); return; } }
    }
    setError(''); setStep(next); setFurthest(previous => Math.max(previous, next));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) { moveTo(step + 1); return; }
    for (let index = 0; index < 3; index++) { const message = validate(index); if (message) { setError(message); setStep(index); return; } }
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const created = await apiFetch('/v1/tracking/drivers', { method: 'POST', body: JSON.stringify({
        name: name.trim(), phone: phone.trim() || undefined,
        license_number: licenseNumber.trim() || undefined, license_expiry: licenseExpiry || undefined,
        assigned_vehicle_id: assignedVehicleId || undefined,
      }) });
      navigate(created?.id ? `/tracking/drivers/${created.id}` : '/tracking/drivers');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create driver. Your entries are preserved.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const vehicle = vehicles.find(item => item.id === assignedVehicleId);
  const expired = licenseExpiry && licenseExpiry < toDateOnlyString(new Date());

  return <div className="driver-registration">
    <PageHeader crumbs={['HuduFreight', 'Drivers', 'New']} titlePlain="Register a" titleEm="driver" subtitle="Build the profile, record licence details and choose an optional vehicle." variant="create" backTo="/tracking/drivers" />
    <div className="driver-registration-progress">
      <div aria-live="polite">Step {step + 1} of {steps.length} · {steps[step]}</div>
      <Progress value={(step + 1) / steps.length * 100} aria-label="Registration progress" />
      <Tabs value={String(step)} onValueChange={value => moveTo(Number(value))}>
        <TabsList wrap aria-label="Driver registration steps">{steps.map((label, index) => <TabsTrigger key={label} value={String(index)} disabled={index > furthest || saving}>{index + 1}. {label}</TabsTrigger>)}</TabsList>
      </Tabs>
    </div>
    <SectionCard>
      <form onSubmit={submit} className="driver-registration-form">
        <div><h2 ref={heading} tabIndex={-1}>{steps[step]}</h2><p className="driver-registration-help">{['Start with the driver’s name and contact number. Only the name is required.', 'Record the licence as supplied. Saving a profile does not verify the licence.', 'Assign an operational vehicle now, or leave the driver unassigned.', 'Check the details before creating the profile. Nothing is saved until you select Create driver.'][step]}</p></div>
        {error && <Banner variant="error">{error}</Banner>}
        <fieldset disabled={saving} className="driver-registration-fields">
          {step === 0 && <>
            <label htmlFor="driver-full-name">Full name <span aria-hidden="true">*</span><Input id="driver-full-name" autoComplete="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
            <label htmlFor="driver-phone">Phone <span className="driver-registration-optional">Optional</span><Input id="driver-phone" type="tel" autoComplete="tel" maxLength={30} placeholder="+255…" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          </>}
          {step === 1 && <>
            <label htmlFor="driver-licence">Licence number <span className="driver-registration-optional">Optional</span><Input id="driver-licence" maxLength={100} value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} /></label>
            <div><div id="driver-expiry-label" className="driver-registration-label">Expiry date <span className="driver-registration-optional">Optional</span></div><DatePicker date={parseDateOnly(licenseExpiry)} onChange={date => setLicenseExpiry(toDateOnlyString(date))} /></div>
            {expired && <Banner variant="warning">This licence date is in the past. Update the licence before assigning driving work.</Banner>}
          </>}
          {step === 2 && <>
            <div><div className="driver-registration-label">Vehicle <span className="driver-registration-optional">Optional</span></div>
              {vehiclesError ? <Banner variant="error">{vehiclesError} <Button type="button" variant="outline" size="sm" onClick={() => void loadVehicles()}>Retry</Button></Banner> : <Combobox options={[{value:'',label:'Leave unassigned'}, ...vehicles.filter(item => ['ACTIVE','IDLE'].includes(item.status) && item.ownership !== 'DEMO').map(item => ({value:item.id,label:item.name,sublabel:item.plate_number || undefined}))]} value={assignedVehicleId} onChange={setAssignedVehicleId} placeholder={vehiclesLoading ? 'Loading vehicles…' : 'Leave unassigned'} disabled={vehiclesLoading} />}
            </div>
            <p className="driver-registration-help">Unavailable and demo assets are excluded. Trip dispatch performs its own availability checks.</p>
          </>}
          {step === 3 && <dl className="driver-registration-review">{[['Name',name],['Phone',phone || 'Not provided'],['Licence number',licenseNumber || 'Not provided'],['Licence expiry',licenseExpiry || 'Not provided'],['Vehicle',vehicle ? `${vehicle.name}${vehicle.plate_number ? ' · '+vehicle.plate_number : ''}` : 'Unassigned']].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        </fieldset>
        <div className="driver-registration-actions">
          <Button type="button" variant="ghost" asChild disabled={saving}><Link to="/tracking/drivers">Cancel</Link></Button>
          <div>{step > 0 && <Button type="button" variant="outline" disabled={saving} onClick={() => moveTo(step - 1)}>Back</Button>}<Button type="submit" disabled={saving}>{saving ? 'Creating…' : step === 3 ? 'Create driver' : 'Continue'}</Button></div>
        </div>
      </form>
    </SectionCard>
  </div>;
};
