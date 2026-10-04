import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';

const VEHICLE_TYPES = ['TRUCK', 'VAN', 'MOTORBIKE', 'OTHER'];
const FUEL_TYPES = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID'];
const OWNERSHIP_TYPES = ['OWNED', 'LEASED', 'RENTED'];

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
    <div style={{ padding: '0 0 24px'}}>
      <PageHeader
        crumbs={['HuduFreight', 'Register Vehicle']}
        title="Register a vehicle"
        subtitle="Add a vehicle and its operating details to your fleet."
        variant="create"
        backTo="/tracking/vehicles"
      />

      <SectionCard>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={sectionStyle}>Basics</div>
        <div><label style={labelStyle}>Name</label><Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Truck 07" /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Plate number</label><Input value={plate} onChange={e => setPlate(e.target.value)} placeholder="e.g. T123ABC" /></div>
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
          <div style={{ flex: 1 }}><label style={labelStyle}>Fleet group</label><Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Dar Regional" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Driver name</label><Input value={driverName} onChange={e => setDriverName(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Driver phone</label><Input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} /></div>
        </div>
        <div>
          <label style={labelStyle}>Device ID</label>
          <Input required value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="GPS/GPRS device identifier" />
        </div>

        <div style={sectionStyle}>Vehicle details</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>VIN</label><Input title="VIN" value={vin} onChange={e => setVin(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Year</label><Input title="Year" type="number" value={year} onChange={e => setYear(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Make</label><Input title="Make" value={make} onChange={e => setMake(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Model</label><Input title="Model" value={model} onChange={e => setModel(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>Trim</label><Input title="Trim" value={trim} onChange={e => setTrim(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>Color</label><Input title="Color" value={color} onChange={e => setColor(e.target.value)} /></div>
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
          <div style={{ flex: 1 }}><label style={labelStyle}>Mileage (km)</label><Input title="Mileage (km)" type="number" value={mileageKm} onChange={e => setMileageKm(e.target.value)} /></div>
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="outline" asChild><Link to="/tracking/vehicles">Cancel</Link></Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Register vehicle'}</Button>
        </div>
      </form>
      </SectionCard>
    </div>
  );
};
