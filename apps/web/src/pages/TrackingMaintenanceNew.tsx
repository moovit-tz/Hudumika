import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Vendor { id: string; name: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
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
    <div style={{ padding: 24 }}>
      <Link to="/tracking/maintenance" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Maintenance
      </Link>
      <PageHeader
        crumbs={['HuduFreight', 'Log Service']}
        titlePlain="Log"
        titleEm="maintenance"
      />

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        <div><label style={labelStyle}>Service type</label><input required value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="e.g. Oil change" style={inputStyle} /></div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Cost</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Odometer (km)</label><input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Service date (previous)</label><DatePicker date={parseDateOnly(serviceDate)} onChange={d => setServiceDate(toDateOnlyString(d))} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Next due date (expected)</label><DatePicker date={parseDateOnly(nextDueDate)} onChange={d => setNextDueDate(toDateOnlyString(d))} /></div>
        </div>
        {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to="/tracking/maintenance" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving || !vehicleId} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Log maintenance'}
          </button>
        </div>
      </form>
    </div>
  );
};
