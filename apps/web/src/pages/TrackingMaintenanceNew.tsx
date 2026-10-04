import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Button } from '../components/ui/button.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Vendor { id: string; name: string }

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const TrackingMaintenanceNew: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [nextDueDate, setNextDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then((rows: Vehicle[]) => { setVehicles(rows); if (rows[0]) setVehicleId(rows[0].id); }).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/vendors').then(setVendors).catch(() => setVendors([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) { setError('Select a vehicle'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, vendor_id: vendorId || undefined, service_type: serviceType,
          description: description || undefined, cost: cost ? Number(cost) : undefined,
          odometer_km: odometer ? Number(odometer) : undefined,
          service_date: serviceDate, next_due_date: nextDueDate || undefined,
        }),
      });
      navigate('/tracking/maintenance');
    } catch (err: any) { setError(err.message || 'Failed to log maintenance'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['HuduFreight', 'Log Service']}
        title="Log maintenance"
        subtitle="Record completed or scheduled service work for a vehicle."
        variant="create"
        backTo="/tracking/maintenance"
      />

      <SectionCard>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Vehicle</label>
            <Combobox
              options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
              value={vehicleId} onChange={setVehicleId} placeholder="Select vehicle…"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Vendor</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
              value={vendorId} onChange={setVendorId} placeholder="— None —"
            />
          </div>
        </div>
        <div><label style={labelStyle}>Service type</label><Input required value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="e.g. Oil change" /></div>
        <div>
          <label style={labelStyle}>Description</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} style={{ minHeight: 90 }} className="resize-y" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Cost</label><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Odometer (km)</label><Input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Service date (previous)</label><DatePicker date={parseDateOnly(serviceDate)} onChange={d => setServiceDate(toDateOnlyString(d))} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Next due date (expected)</label><DatePicker date={parseDateOnly(nextDueDate)} onChange={d => setNextDueDate(toDateOnlyString(d))} /></div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button type="button" variant="outline" asChild><Link to="/tracking/maintenance">Cancel</Link></Button>
          <Button type="submit" disabled={saving || !vehicleId}>{saving ? 'Saving…' : 'Log maintenance'}</Button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
