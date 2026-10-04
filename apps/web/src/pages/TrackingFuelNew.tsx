import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Driver { id: string; name: string }

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

export const TrackingFuelNew: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [station, setStation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then((rows: Vehicle[]) => { setVehicles(rows); if (rows[0]) setVehicleId(rows[0].id); }).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/drivers').then(setDrivers).catch(() => setDrivers([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) { setError('Select a vehicle'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/fuel', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, driver_id: driverId || undefined, liters: Number(liters),
          cost: cost ? Number(cost) : undefined, odometer_km: odometer ? Number(odometer) : undefined,
          station: station || undefined,
        }),
      });
      navigate('/tracking/fuel');
    } catch (err: any) { setError(err.message || 'Failed to log fuel entry'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['HuduFreight', 'Log Fuel']}
        title="Log a fuel entry"
        subtitle="Record fuel volume, cost, driver, and odometer details."
        variant="create"
        backTo="/tracking/fuel"
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
            <label style={labelStyle}>Driver</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...drivers.map(d => ({ value: d.id, label: d.name }))]}
              value={driverId} onChange={setDriverId} placeholder="— None —"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Liters</label><Input required type="number" step="0.01" value={liters} onChange={e => setLiters(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Cost</label><Input type="number" value={cost} onChange={e => setCost(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Odometer (km)</label><Input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Station</label><Input value={station} onChange={e => setStation(e.target.value)} /></div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Button type="button" variant="outline" asChild><Link to="/tracking/fuel">Cancel</Link></Button>
          <Button type="submit" disabled={saving || !vehicleId || !liters}>{saving ? 'Saving…' : 'Log fuel entry'}</Button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
