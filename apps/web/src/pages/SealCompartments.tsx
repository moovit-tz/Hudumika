import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface Compartment { id: string; code: string; name: string; warehouse_type: string; jurisdiction: string; default_storage_days: number; guarantee_id: string | null; }
interface Zone { id: string; compartment_id: string; code: string; name: string; zone_type: string; }
interface Location { id: string; compartment_id: string; zone_id: string; code: string; location_type: string; }
interface GuaranteeOption { id: string; reference: string; face_value: number; currency: string; }

const WAREHOUSE_TYPES = ['public_bonded', 'private_bonded', 'cfs', 'icd', 'virtual_icd', 'free_zone', 'duty_free_retail', 'excise'];
const ZONE_TYPES = ['receiving', 'bulk', 'pick', 'vas', 'quarantine', 'outbound', 'yard'];
const NO_GUARANTEE = '__none__';

export function SealCompartments() {
  const navigate = useNavigate();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [guarantees, setGuarantees] = useState<GuaranteeOption[]>([]);
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

  function reload() {
    apiFetch('/v1/seal/compartments').then(setCompartments);
    apiFetch('/v1/seal/zones').then(setZones);
    apiFetch('/v1/seal/locations').then(setLocations);
    apiFetch('/v1/seal/guarantees').then(setGuarantees);
  }
  useEffect(() => { reload(); }, []);

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
        body: JSON.stringify({ compartmentId, zoneId: newLocZone, code: newLocCode.trim() }),
      });
      setNewLocCode('');
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
                          {l.code}
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
