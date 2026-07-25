import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface Compartment {
  id: string; code: string; name: string; warehouse_type: string; jurisdiction: string; default_storage_days: number; guarantee_id: string | null;
  storage_fee_per_day: string; storage_fee_currency: string; handling_fee_flat: string;
  storage_fee_per_cbm_per_day: string; billing_method: 'flat_per_lot' | 'per_cbm';
  geofence_id: string | null;
}
interface GeofenceOption { id: string; name: string; zone_type: string; }
interface Zone { id: string; compartment_id: string; code: string; name: string; zone_type: string; }
interface Location {
  id: string; compartment_id: string; zone_id: string; code: string; location_type: string;
  length_m: string | null; width_m: string | null; height_m: string | null; volume_cbm: string | null;
}
interface GuaranteeOption { id: string; reference: string; face_value: number; currency: string; }

const WAREHOUSE_TYPES = ['public_bonded', 'private_bonded', 'cfs', 'icd', 'virtual_icd', 'free_zone', 'duty_free_retail', 'excise'];
const ZONE_TYPES = ['receiving', 'bulk', 'pick', 'vas', 'quarantine', 'outbound', 'yard'];
const NO_GUARANTEE = '__none__';
const NO_GEOFENCE = '__none__';

export function SealCompartments() {
  const navigate = useNavigate();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [guarantees, setGuarantees] = useState<GuaranteeOption[]>([]);
  const [geofences, setGeofences] = useState<GeofenceOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNewCompartment, setShowNewCompartment] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('public_bonded');
  const [saving, setSaving] = useState(false);

  const [newZoneCode, setNewZoneCode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('bulk');
  const [newLocZone, setNewLocZone] = useState('');
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocLength, setNewLocLength] = useState('');
  const [newLocWidth, setNewLocWidth] = useState('');
  const [newLocHeight, setNewLocHeight] = useState('');

  function reload() {
    apiFetch('/v1/seal/compartments').then(setCompartments);
    apiFetch('/v1/seal/zones').then(setZones);
    apiFetch('/v1/seal/locations').then(setLocations);
    apiFetch('/v1/seal/guarantees').then(setGuarantees);
    apiFetch('/v1/seal/geofences').then(setGeofences);
  }
  useEffect(() => { reload(); }, []);

  async function handleAttachGeofence(compartmentId: string, geofenceId: string | null) {
    try {
      await apiFetch(`/v1/seal/compartments/${compartmentId}`, { method: 'PATCH', body: JSON.stringify({ geofenceId }) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update the linked geofence.');
    }
  }

  async function handleUpdateBilling(compartmentId: string, patch: { storageFeePerDay: number; storageFeeCurrency: string; handlingFeeFlat: number; storageFeePerCbmPerDay: number; billingMethod: 'flat_per_lot' | 'per_cbm' }) {
    try {
      await apiFetch(`/v1/seal/compartments/${compartmentId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update billing rates.');
    }
  }

  async function handleAttachGuarantee(compartmentId: string, guaranteeId: string | null) {
    try {
      await apiFetch(`/v1/seal/compartments/${compartmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ guaranteeId }),
      });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update the attached guarantee.');
    }
  }

  async function handleCreateCompartment(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/compartments', {
        method: 'POST',
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), warehouseType: newType }),
      });
      setNewCode(''); setNewName(''); setShowNewCompartment(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create compartment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateZone(compartmentId: string) {
    if (!newZoneCode.trim() || !newZoneName.trim()) return;
    try {
      await apiFetch('/v1/seal/zones', {
        method: 'POST',
        body: JSON.stringify({ compartmentId, code: newZoneCode.trim(), name: newZoneName.trim(), zoneType: newZoneType }),
      });
      setNewZoneCode(''); setNewZoneName('');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create zone.');
    }
  }

  async function handleCreateLocation(compartmentId: string) {
    if (!newLocZone || !newLocCode.trim()) return;
    try {
      await apiFetch('/v1/seal/locations', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId, zoneId: newLocZone, code: newLocCode.trim(),
          lengthM: newLocLength ? Number(newLocLength) : null,
          widthM: newLocWidth ? Number(newLocWidth) : null,
          heightM: newLocHeight ? Number(newLocHeight) : null,
        }),
      });
      setNewLocCode(''); setNewLocLength(''); setNewLocWidth(''); setNewLocHeight('');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create location.');
    }
  }

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Compartments</h1>
          <p className="seal-page-sub">Separately-licensed bonded perimeters — each with its own zones and locations underneath.</p>
        </div>
        <button type="button" className="seal-btn-primary" onClick={() => setShowNewCompartment(v => !v)}>
          <Icon name="plus" size={14} />
          <span>New Compartment</span>
        </button>
      </div>

      {showNewCompartment && (
        <form onSubmit={handleCreateCompartment} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="seal-field-row" style={{ minWidth: 140 }}>
              <label className="seal-field-label">Code</label>
              <input type="text" className="input-field" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="CFS-DSM-02" />
            </div>
            <div className="seal-field-row" style={{ minWidth: 220, flex: 1 }}>
              <label className="seal-field-label">Name</label>
              <input type="text" className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Compartment name" />
            </div>
            <div className="seal-field-row" style={{ minWidth: 180 }}>
              <label className="seal-field-label">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <button type="submit" className="seal-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {compartments.length === 0 ? (
          <div className="seal-card"><div className="seal-empty">No compartments yet.</div></div>
        ) : compartments.map(c => {
          const isOpen = selected === c.id;
          const compartmentZones = zones.filter(z => z.compartment_id === c.id);
          const compartmentLocations = locations.filter(l => l.compartment_id === c.id);
          return (
            <div className="seal-card" key={c.id}>
              <div className="seal-card-hdr" style={{ cursor: 'pointer' }} onClick={() => setSelected(isOpen ? null : c.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="layers" size={18} /></FeaturedIcon>
                  <div>
                    <div className="seal-card-title">{c.name}</div>
                    <div className="seal-mono" style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{c.code} · {c.warehouse_type.replace(/_/g, ' ')} · {c.jurisdiction} · {c.default_storage_days}d storage</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button" className="seal-btn-secondary"
                    onClick={e => { e.stopPropagation(); navigate(`/seal/compartments/${c.id}/layout`); }}
                  >
                    <Icon name="warehouse" size={13} /><span>Warehouse Layout</span>
                  </button>
                  <button
                    type="button" className="seal-btn-secondary"
                    onClick={e => { e.stopPropagation(); navigate(`/seal/compartments/${c.id}/heat-grid`); }}
                  >
                    <Icon name="grid" size={13} /><span>Heat Grid</span>
                  </button>
                  <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={16} />
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', margin: '0 0 10px' }}>Bond / Guarantee</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Select value={c.guarantee_id ?? NO_GUARANTEE} onValueChange={v => handleAttachGuarantee(c.id, v === NO_GUARANTEE ? null : v)}>
                        <SelectTrigger className="input-field" style={{ width: 260 }}><SelectValue placeholder="No guarantee attached" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_GUARANTEE}>No guarantee (headroom not checked)</SelectItem>
                          {guarantees.map(g => <SelectItem key={g.id} value={g.id}>{g.reference} — {g.face_value.toLocaleString()} {g.currency}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', margin: '0 0 10px' }} title="Links this compartment to a real geofenced area already tracked elsewhere in the platform (e.g. the port zone) — no new geofencing logic, just a shared reference.">Linked Geofence (Tracking)</h3>
                    <Select value={c.geofence_id ?? NO_GEOFENCE} onValueChange={v => handleAttachGeofence(c.id, v === NO_GEOFENCE ? null : v)}>
                      <SelectTrigger className="input-field" style={{ width: 280 }}><SelectValue placeholder="No geofence linked" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GEOFENCE}>No geofence linked</SelectItem>
                        {geofences.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.zone_type})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', margin: '0 0 10px' }}>Billing (FinOps)</h3>
                    <BillingFields compartment={c} onSave={patch => handleUpdateBilling(c.id, patch)} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', margin: 0 }}>Zones</h3>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {compartmentZones.map(z => (
                        <span key={z.id} className="seal-mono" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          {z.code} — {z.name} ({z.zone_type})
                        </span>
                      ))}
                      {compartmentZones.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No zones yet.</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <input type="text" className="input-field" style={{ width: 100 }} placeholder="Code" value={newZoneCode} onChange={e => setNewZoneCode(e.target.value)} />
                      <input type="text" className="input-field" style={{ width: 160 }} placeholder="Name" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} />
                      <Select value={newZoneType} onValueChange={setNewZoneType}>
                        <SelectTrigger className="input-field" style={{ width: 140 }}><SelectValue /></SelectTrigger>
                        <SelectContent>{ZONE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                      <button type="button" className="seal-btn-secondary" onClick={() => handleCreateZone(c.id)}>Add Zone</button>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', margin: '0 0 10px' }}>Locations</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {compartmentLocations.map(l => (
                        <span key={l.id} className="seal-mono" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          {l.code}{l.volume_cbm != null ? ` · ${Number(l.volume_cbm).toFixed(2)} m³` : ''}
                        </span>
                      ))}
                      {compartmentLocations.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No locations yet.</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <Select value={newLocZone} onValueChange={setNewLocZone}>
                        <SelectTrigger className="input-field" style={{ width: 160 }}><SelectValue placeholder="Zone" /></SelectTrigger>
                        <SelectContent>{compartmentZones.map(z => <SelectItem key={z.id} value={z.id}>{z.code}</SelectItem>)}</SelectContent>
                      </Select>
                      <input type="text" className="input-field" style={{ width: 140 }} placeholder="Location code" value={newLocCode} onChange={e => setNewLocCode(e.target.value)} />
                      <input type="number" min="0" step="any" className="input-field" style={{ width: 90 }} placeholder="Length (m)" value={newLocLength} onChange={e => setNewLocLength(e.target.value)} title="Real physical length in metres (optional)" />
                      <input type="number" min="0" step="any" className="input-field" style={{ width: 90 }} placeholder="Width (m)" value={newLocWidth} onChange={e => setNewLocWidth(e.target.value)} title="Real physical width in metres (optional)" />
                      <input type="number" min="0" step="any" className="input-field" style={{ width: 90 }} placeholder="Height (m)" value={newLocHeight} onChange={e => setNewLocHeight(e.target.value)} title="Real physical height in metres (optional)" />
                      <button type="button" className="seal-btn-secondary" onClick={() => handleCreateLocation(c.id)} disabled={compartmentZones.length === 0}>Add Location</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BillingFields({ compartment, onSave }: { compartment: Compartment; onSave: (patch: { storageFeePerDay: number; storageFeeCurrency: string; handlingFeeFlat: number; storageFeePerCbmPerDay: number; billingMethod: 'flat_per_lot' | 'per_cbm' }) => void }) {
  const [method, setMethod] = useState<'flat_per_lot' | 'per_cbm'>(compartment.billing_method ?? 'flat_per_lot');
  const [rate, setRate] = useState(compartment.storage_fee_per_day);
  const [cbmRate, setCbmRate] = useState(compartment.storage_fee_per_cbm_per_day);
  const [currency, setCurrency] = useState(compartment.storage_fee_currency);
  const [handling, setHandling] = useState(compartment.handling_fee_flat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="seal-field-row" style={{ width: 220 }}>
        <label className="seal-field-label" title="Which formula this compartment's storage invoices are computed from">Billing Method</label>
        <Select value={method} onValueChange={v => setMethod(v as 'flat_per_lot' | 'per_cbm')}>
          <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="flat_per_lot">Flat rate per lot / day</SelectItem>
            <SelectItem value="per_cbm">Per CBM (m³) / day</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {method === 'flat_per_lot' ? (
          <div className="seal-field-row" style={{ width: 140 }}>
            <label className="seal-field-label">Storage Fee / Day</label>
            <input type="number" min="0" step="any" className="input-field" value={rate} onChange={e => setRate(e.target.value)} />
          </div>
        ) : (
          <div className="seal-field-row" style={{ width: 160 }}>
            <label className="seal-field-label" title="Charged per lot as volumeCbm × this rate × days — lots with no recorded volume can't be billed until switched or given a volume">Storage Fee / CBM / Day</label>
            <input type="number" min="0" step="any" className="input-field" value={cbmRate} onChange={e => setCbmRate(e.target.value)} />
          </div>
        )}
        <div className="seal-field-row" style={{ width: 90 }}>
          <label className="seal-field-label">Currency</label>
          <input type="text" className="input-field" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>
        <div className="seal-field-row" style={{ width: 160 }}>
          <label className="seal-field-label" title="One-time fee applied on the first storage invoice for a lot">Handling Fee (one-time)</label>
          <input type="number" min="0" step="any" className="input-field" value={handling} onChange={e => setHandling(e.target.value)} />
        </div>
        <button
          type="button" className="seal-btn-secondary"
          onClick={() => onSave({
            storageFeePerDay: Number(rate) || 0, storageFeeCurrency: currency, handlingFeeFlat: Number(handling) || 0,
            storageFeePerCbmPerDay: Number(cbmRate) || 0, billingMethod: method,
          })}
        >
          Save Rates
        </button>
      </div>
    </div>
  );
}
