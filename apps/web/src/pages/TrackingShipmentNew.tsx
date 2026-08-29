import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { DateTimePicker } from '../components/ui/date-picker.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { BackButton } from '../components/ui/BackButton.js';

/** Format a Date to "YYYY-MM-DDTHH:mm" in local time — same shape a native
 *  <input type="datetime-local"> value had, so the existing string form
 *  state (submitted as scheduled_start/scheduled_end) keeps working unchanged. */
const toLocalDateTimeString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Vehicle { id: string; name: string; plate_number: string | null }
interface Driver { id: string; name: string }
interface Customer { id: string; name: string }
interface ClearosShipment {
  id: string; ref_number: string; customer_name?: string; goods_desc: string;
  origin_port: string; dest_port: string; stage: string;
}

type JobType = 'CLEARANCE_LINKED' | 'TRANSPORT_ONLY';

const STEPS = ['Shipment Type', 'Details', 'Vehicle & Cargo', 'Review'] as const;

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 24 };

function StepHeader({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step, active = n === step;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 90 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done || active ? 'var(--teal)' : 'var(--bg)', color: done || active ? '#fff' : 'var(--ink3)', border: active ? '2px solid var(--teal)' : '1px solid var(--border)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {done ? <Icon name="check" size={14} /> : String(n).padStart(2, '0')}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? 'var(--ink)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: n < step ? 'var(--teal)' : 'var(--border)', margin: '0 8px' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const TrackingShipmentNew: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [jobType, setJobType] = useState<JobType | null>(null);
  const [clearosAvailable, setClearosAvailable] = useState<boolean | null>(null);

  // Step 2 — linked shipment search
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentResults, setShipmentResults] = useState<ClearosShipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<ClearosShipment | null>(null);
  const [searching, setSearching] = useState(false);

  // Step 2 — transport-only details
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [cargoDesc, setCargoDesc] = useState('');

  // Step 3 — vehicle & cargo
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [cargoWeightKg, setCargoWeightKg] = useState('');
  const [cargoTempC, setCargoTempC] = useState('');
  const [loadCapacityPct, setLoadCapacityPct] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
    apiFetch('/v1/tracking/drivers').then(setDrivers).catch(() => setDrivers([]));
    // Excludes draft companies (active===false) — e.g. BRELA imports still
    // sitting in Company Directory that haven't been marked complete yet.
    apiFetch('/v1/customers').then((res: any) => setCustomers((res.data ?? res).filter((c: any) => c.active !== false))).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (jobType !== 'CLEARANCE_LINKED' || !shipmentSearch.trim()) { setShipmentResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/v1/shipments?search=${encodeURIComponent(shipmentSearch)}`)
        .then((res: any) => { setClearosAvailable(true); setShipmentResults(res.data ?? []); })
        .catch(() => { setClearosAvailable(false); setShipmentResults([]); })
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [shipmentSearch, jobType]);

  function chooseJobType(t: JobType) {
    setJobType(t);
    setStep(2);
  }

  function canAdvanceFromStep2() {
    if (jobType === 'CLEARANCE_LINKED') return !!selectedShipment;
    return origin.trim() && destination.trim();
  }

  async function submit() {
    setSaving(true); setError('');
    try {
      const created = await apiFetch('/v1/tracking/trips', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId, driver_id: driverId || undefined,
          customer_id: jobType === 'TRANSPORT_ONLY' ? (customerId || undefined) : (selectedShipment ? undefined : undefined),
          origin: jobType === 'CLEARANCE_LINKED' ? selectedShipment?.origin_port : origin,
          destination: jobType === 'CLEARANCE_LINKED' ? selectedShipment?.dest_port : destination,
          cargo_desc: jobType === 'CLEARANCE_LINKED' ? selectedShipment?.goods_desc : cargoDesc,
          scheduled_start: scheduledStart || undefined, scheduled_end: scheduledEnd || undefined,
          cargo_type: cargoType || undefined, cargo_weight_kg: cargoWeightKg ? Number(cargoWeightKg) : undefined,
          cargo_temp_c: cargoTempC ? Number(cargoTempC) : undefined, load_capacity_pct: loadCapacityPct ? Number(loadCapacityPct) : undefined,
          shipment_id: jobType === 'CLEARANCE_LINKED' ? selectedShipment?.id : undefined,
        }),
      });
      navigate(`/tracking/trips?highlight=${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create shipment');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '0 0 24px', maxWidth: 760 }}>
      <BackButton to="/tracking/vehicles" label="Vehicles" />
      <PageHeader
        crumbs={['HuduFreight', 'New Trip']}
        titlePlain="New"
        titleEm="trip"
      />

      <StepHeader step={step} />

      {step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div onClick={() => chooseJobType('CLEARANCE_LINKED')}
            style={{ ...cardStyle, cursor: 'pointer', borderColor: jobType === 'CLEARANCE_LINKED' ? 'var(--teal)' : 'var(--border)' }}>
            <Icon name="shield" size={22} color="var(--teal)" />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '10px 0 4px' }}>Linked to ClearOS Shipment</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>This cargo has an existing customs clearance case. Search and attach it, and its details carry over automatically.</div>
          </div>
          <div onClick={() => chooseJobType('TRANSPORT_ONLY')}
            style={{ ...cardStyle, cursor: 'pointer', borderColor: jobType === 'TRANSPORT_ONLY' ? 'var(--teal)' : 'var(--border)' }}>
            <Icon name="truck" size={22} color="var(--teal)" />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '10px 0 4px' }}>Transport Only</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.5 }}>No customs clearance involved — a local haul or delivery. Enter the route and cargo directly.</div>
          </div>
        </div>
      )}

      {step === 2 && jobType === 'CLEARANCE_LINKED' && (
        <SectionCard>
          <div style={labelStyle}>Search ClearOS shipments</div>
          <input value={shipmentSearch} onChange={e => setShipmentSearch(e.target.value)} placeholder="Reference #, goods description, B/L, AWB…" style={inputStyle} />
          {clearosAvailable === false && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: '#c2410c' }}>ClearOS isn't enabled for this account — switch to "Transport Only" on the previous step instead.</div>
          )}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searching && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Searching…</div>}
            {shipmentResults.map(s => (
              <div key={s.id} onClick={() => setSelectedShipment(s)}
                style={{ padding: '12px 14px', borderRadius: 9, border: `1.5px solid ${selectedShipment?.id === s.id ? 'var(--teal)' : 'var(--border)'}`, cursor: 'pointer', background: selectedShipment?.id === s.id ? 'var(--teal-l)' : 'var(--white)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{s.ref_number} <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>· {s.stage}</span></div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{s.customer_name || 'Unknown customer'} — {s.goods_desc}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{s.origin_port} → {s.dest_port}</div>
              </div>
            ))}
            {!searching && shipmentSearch.trim() && shipmentResults.length === 0 && clearosAvailable !== false && (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No matching shipments.</div>
            )}
          </div>
        </SectionCard>
      )}

      {step === 2 && jobType === 'TRANSPORT_ONLY' && (
        <SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Customer (optional)</label>
            <Combobox
              options={[{ value: '', label: '— No customer —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
              value={customerId} onChange={setCustomerId} placeholder="— No customer —"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Origin</label><input required value={origin} onChange={e => setOrigin(e.target.value)} placeholder="e.g. Dar es Salaam" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Destination</label><input required value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Arusha" style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Cargo description</label><input value={cargoDesc} onChange={e => setCargoDesc(e.target.value)} style={inputStyle} /></div>
        </div>
        </SectionCard>
      )}

      {step === 3 && (
        <SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Vehicle</label>
              <Combobox
                options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
                value={vehicleId} onChange={setVehicleId} placeholder="— Select —"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Driver</label>
              <Combobox
                options={[{ value: '', label: '— Unassigned —' }, ...drivers.map(d => ({ value: d.id, label: d.name }))]}
                value={driverId} onChange={setDriverId} placeholder="— Unassigned —"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Scheduled start</label><DateTimePicker date={scheduledStart ? new Date(scheduledStart) : undefined} onChange={d => setScheduledStart(d ? toLocalDateTimeString(d) : '')} triggerClassName="w-full" /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Scheduled end</label><DateTimePicker date={scheduledEnd ? new Date(scheduledEnd) : undefined} onChange={d => setScheduledEnd(d ? toLocalDateTimeString(d) : '')} triggerClassName="w-full" /></div>
          </div>
          <div style={sectionDivider} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Cargo type</label><input value={cargoType} onChange={e => setCargoType(e.target.value)} placeholder="e.g. Perishable" style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Cargo weight (kg)</label><input title="Cargo weight" type="number" value={cargoWeightKg} onChange={e => setCargoWeightKg(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Cargo temp (°C)</label><input title="Cargo temp" type="number" value={cargoTempC} onChange={e => setCargoTempC(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Load capacity (%)</label><input title="Load capacity" type="number" value={loadCapacityPct} onChange={e => setLoadCapacityPct(e.target.value)} style={inputStyle} /></div>
          </div>
        </div>
        </SectionCard>
      )}

      {step === 4 && (
        <SectionCard>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {jobType === 'CLEARANCE_LINKED' ? 'Linked to ClearOS Shipment' : 'Transport Only'}
          </div>
          {jobType === 'CLEARANCE_LINKED' && selectedShipment ? (
            <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 14 }}>{selectedShipment.ref_number} — {selectedShipment.goods_desc} ({selectedShipment.origin_port} → {selectedShipment.dest_port})</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 14 }}>{origin} → {destination}{cargoDesc ? ` · ${cargoDesc}` : ''}</div>
          )}
          {[
            ['Vehicle', vehicles.find(v => v.id === vehicleId)?.name || '—'],
            ['Driver', drivers.find(d => d.id === driverId)?.name || 'Unassigned'],
            ['Scheduled start', scheduledStart || '—'],
            ['Scheduled end', scheduledEnd || '—'],
            ['Cargo type', cargoType || '—'],
            ['Cargo weight', cargoWeightKg ? `${cargoWeightKg} kg` : '—'],
            ['Cargo temp', cargoTempC ? `${cargoTempC}°C` : '—'],
            ['Load capacity', loadCapacityPct ? `${loadCapacityPct}%` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--ink3)' }}>{k}</span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        </SectionCard>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button type="button" disabled={step === 1} onClick={() => setStep(s => s - 1)}
          style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, cursor: step === 1 ? 'default' : 'pointer', opacity: step === 1 ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          Back
        </button>
        {step < 4 ? (
          <button type="button" disabled={step === 1 ? !jobType : step === 2 ? !canAdvanceFromStep2() : !vehicleId}
            onClick={() => setStep(s => s + 1)}
            style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (step === 1 && !jobType) || (step === 2 && !canAdvanceFromStep2()) || (step === 3 && !vehicleId) ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            Continue
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={submit}
            style={{ padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {saving ? 'Creating…' : 'Create Shipment'}
          </button>
        )}
      </div>
    </div>
  );
};

const sectionDivider: React.CSSProperties = { height: 1, background: 'var(--border)', margin: '4px 0' };
