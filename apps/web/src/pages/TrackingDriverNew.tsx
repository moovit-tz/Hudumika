import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { BackButton } from '../components/ui/BackButton.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle { id: string; name: string; plate_number: string | null }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const TrackingDriverNew: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [assignedVehicleId, setAssignedVehicleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a name'); return; }
    setSaving(true); setError('');
    try {
      const created = await apiFetch('/v1/tracking/drivers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || undefined,
          license_number: licenseNumber || undefined,
          license_expiry: licenseExpiry || undefined,
          assigned_vehicle_id: assignedVehicleId || undefined,
        }),
      });
      navigate(created?.id ? `/tracking/drivers/${created.id}` : '/tracking/drivers');
    } catch (err: any) { setError(err.message || 'Failed to add driver'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <BackButton to="/tracking/drivers" label="Drivers" />
      <PageHeader
        crumbs={['HuduFreight', 'New Driver']}
        titlePlain="Add a"
        titleEm="driver"
      />

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Amara Kone" style={inputStyle} /></div>
        <div><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>License Number</label>
            <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>License Expiry</label>
            <DatePicker date={parseDateOnly(licenseExpiry)} onChange={d => setLicenseExpiry(toDateOnlyString(d))} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Assigned Vehicle</label>
          <Combobox
            options={[{ value: '', label: '— Unassigned —' }, ...vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))]}
            value={assignedVehicleId} onChange={setAssignedVehicleId} placeholder="— Unassigned —"
          />
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to="/tracking/drivers" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {saving ? 'Saving…' : 'Add Driver'}
          </button>
        </div>
      </form>
    </div>
  );
};
