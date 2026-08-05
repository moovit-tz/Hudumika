import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';

const VEHICLE_TYPES = ['TRUCK', 'VAN', 'MOTORBIKE', 'OTHER'];
const FUEL_TYPES = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID'];
const OWNERSHIP_TYPES = ['OWNED', 'LEASED', 'RENTED'];

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const sectionStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 6, marginBottom: -2 };

export const TrackingVehicleNew: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [type, setType] = useState('TRUCK');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [fuelType, setFuelType] = useState('DIESEL');
  const [groupName, setGroupName] = useState('');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [color, setColor] = useState('');
  const [ownership, setOwnership] = useState('OWNED');
  const [mileageKm, setMileageKm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch('/v1/tracking/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          name, plate_number: plate, type, driver_name: driverName, driver_phone: driverPhone,
          device_id: deviceId, fuel_type: fuelType, group_name: groupName || undefined,
        }),
      });
      const hasDetails = vin || year || make || model || trim || color || mileageKm;
      if (hasDetails) {
        await apiFetch(`/v1/tracking/vehicles/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            vin: vin || undefined, year: year ? Number(year) : undefined, make: make || undefined,
            model: model || undefined, trim: trim || undefined, color: color || undefined,
            ownership, mileage_km: mileageKm ? Number(mileageKm) : undefined,
          }),
        });
      }
      navigate(`/tracking/vehicles/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to register vehicle');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <Link to="/tracking/vehicles" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Vehicles
      </Link>
      <PageHeader
        crumbs={['HuduFreight', 'Register Vehicle']}
        titlePlain="Register a"
        titleEm="vehicle"
      />

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={sectionStyle}>Basics</div>
        <div><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Truck 07" style={inputStyle} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Plate number</label><input value={plate} onChange={e => setPlate(e.target.value)} placeholder="e.g. T123ABC" style={inputStyle} /></div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Fuel type</label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Fleet group</label><input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Dar Regional" style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Driver name</label><input value={driverName} onChange={e => setDriverName(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Driver phone</label><input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} style={inputStyle} /></div>
        </div>
        <div>
          <label style={labelStyle}>Device ID</label>
          <input required value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="GPS/GPRS device identifier" style={inputStyle} />
        </div>

        <div style={sectionStyle}>Vehicle details</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>VIN</label><input title="VIN" value={vin} onChange={e => setVin(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><input title="Year" type="number" value={year} onChange={e => setYear(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Make</label><input title="Make" value={make} onChange={e => setMake(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Model</label><input title="Model" value={model} onChange={e => setModel(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Trim</label><input title="Trim" value={trim} onChange={e => setTrim(e.target.value)} style={inputStyle} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Color</label><input title="Color" value={color} onChange={e => setColor(e.target.value)} style={inputStyle} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Ownership</label>
            <Select value={ownership} onValueChange={setOwnership}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OWNERSHIP_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Mileage (km)</label><input title="Mileage (km)" type="number" value={mileageKm} onChange={e => setMileageKm(e.target.value)} style={inputStyle} /></div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Link to="/tracking/vehicles" style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, textDecoration: 'none' }}>Cancel</Link>
          <button type="submit" disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Register vehicle'}
          </button>
        </div>
      </form>
    </div>
  );
};
