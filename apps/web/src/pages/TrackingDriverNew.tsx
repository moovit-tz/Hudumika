import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

interface Vehicle { id: string; name: string; plate_number: string | null }

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
      <PageHeader
        crumbs={['HuduFreight', 'New Driver']}
        title="Add a driver"
        subtitle="Create a driver profile and optionally assign a vehicle."
        variant="create"
        backTo="/tracking/drivers"
      />

      <SectionCard>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={labelStyle}>Name</label><Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Amara Kone" /></div>
        <div><label style={labelStyle}>Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>License Number</label>
            <Input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
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
          <Button type="button" variant="outline" asChild><Link to="/tracking/drivers">Cancel</Link></Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Driver'}</Button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
