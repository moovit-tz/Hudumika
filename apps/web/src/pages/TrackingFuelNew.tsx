import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Driver { id: string; name: string }

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
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
      <Link to="/tracking/fuel" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Fuel
      </Link>
      <PageHeader
        crumbs={['HuduFreight', 'Log Fuel']}
        titlePlain="Log a fuel"
        titleEm="entry"
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
            <label style={labelStyle}>Driver</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...drivers.map(d => ({ value: d.id, label: d.name }))]}
              value={driverId} onChange={setDriverId} placeholder="— None —"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Liters</label><input required type="number" step="0.01" value={liters} onChange={e => setLiters(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Cost</label><input type="number" value={cost} onChange={e => setCost(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Odometer (km)</label><input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Station</label><input value={station} onChange={e => setStation(e.target.value)} style={inputStyle} /></div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <Link to="/tracking/fuel" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving || !vehicleId || !liters} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {saving ? 'Saving…' : 'Log fuel entry'}
          </button>
        </div>
      </form>
    </div>
  );
};
