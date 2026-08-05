import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

interface Location { id: string; code: string; name: string; zone: string | null; capacity_units: number | null; active: boolean }
interface Vehicle { id: string; name: string }
interface DockAppointment {
  id: string; dock_number: string; appointment_type: 'INBOUND' | 'OUTBOUND';
  vehicle_id: string | null; reference: string | null; scheduled_at: string; status: string;
}
interface OccupancyLocation {
  id: string; code: string; name: string;
  capacity_units: number | null; occupied_units: number; occupancy_pct: number | null;
}
interface OccupancyZone { zone: string; locations: OccupancyLocation[] }

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' };

function UpgradeEmptyState({ feature }: { feature: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 9, padding: '60px 20px', textAlign: 'center' }}>
        <Icon name="lock" size={28} color="var(--ink3)" />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 12 }}>{feature} is an Enterprise feature</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 6 }}>Upgrade your plan to unlock this tool.</div>
        <a href="/subscription" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 9, background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          View plans
        </a>
      </div>
    </div>
  );
}

function AddLocationModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/v1/tracking/warehouse/locations', {
        method: 'POST',
        body: JSON.stringify({ code, name, zone, capacity_units: capacity ? Number(capacity) : undefined }),
      });
      onAdded(); onClose();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 420, maxWidth: '92vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Add a storage location</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Code</label><input required value={code} onChange={e => setCode(e.target.value)} placeholder="A-01" style={inputStyle} /></div>
            <div style={{ flex: 2 }}><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Zone</label><input value={zone} onChange={e => setZone(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Capacity (units)</label><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAppointmentModal({ vehicles, onClose, onAdded }: { vehicles: Vehicle[]; onClose: () => void; onAdded: () => void }) {
  const [dockNumber, setDockNumber] = useState('');
  const [type, setType] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [vehicleId, setVehicleId] = useState('');
  const [reference, setReference] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/v1/tracking/warehouse/dock-appointments', {
        method: 'POST',
        body: JSON.stringify({ dock_number: dockNumber, appointment_type: type, vehicle_id: vehicleId || undefined, reference, scheduled_at: scheduledAt }),
      });
      onAdded(); onClose();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>Schedule a dock appointment</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Dock number</label><input required value={dockNumber} onChange={e => setDockNumber(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Type</label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">Inbound</SelectItem>
                  <SelectItem value="OUTBOUND">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Vehicle</label>
            <Combobox
              options={[{ value: '', label: '— None —' }, ...vehicles.map(v => ({ value: v.id, label: v.name }))]}
              value={vehicleId} onChange={setVehicleId} placeholder="— None —"
            />
          </div>
          <div><label style={labelStyle}>Reference</label><input value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Scheduled at</label><input required type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const TrackingWarehouse: React.FC = () => {
  const [tab, setTab] = useState<'locations' | 'dock' | 'map'>('locations');
  const [locations, setLocations] = useState<Location[]>([]);
  const [appointments, setAppointments] = useState<DockAppointment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddAppointment, setShowAddAppointment] = useState(false);

  const [occupancy, setOccupancy] = useState<OccupancyZone[] | null>(null);
  const [occupancyLoading, setOccupancyLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/tracking/warehouse/locations'),
      apiFetch('/v1/tracking/warehouse/dock-appointments'),
    ]).then(([locs, appts]) => { setLocations(locs); setAppointments(appts); })
      .catch((e: any) => { if (e.message?.includes('plan')) setLocked(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, [reload]);

  useEffect(() => {
    if (tab !== 'map' || occupancy !== null) return;
    setOccupancyLoading(true);
    apiFetch('/v1/tracking/warehouse/occupancy').then(setOccupancy).catch(() => setOccupancy([])).finally(() => setOccupancyLoading(false));
  }, [tab, occupancy]);

  async function generateInsight() {
    setInsightLoading(true); setInsightError(null); setInsight(null);
    try {
      const res = await apiFetch('/v1/tracking/warehouse/insights');
      setInsight(res.suggestion);
    } catch (err: any) {
      setInsightError(err.message || 'Could not generate an insight.');
    } finally {
      setInsightLoading(false);
    }
  }

  async function removeLocation(id: string) {
    if (!(await showConfirm('Remove this location?', { confirmLabel: 'Remove' }))) return;
    await apiFetch(`/v1/tracking/warehouse/locations/${id}`, { method: 'DELETE' });
    reload();
  }

  async function setAppointmentStatus(id: string, action: 'check-in' | 'complete' | 'cancel') {
    await apiFetch(`/v1/tracking/warehouse/dock-appointments/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
    reload();
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Loading warehouse…</div>;
  if (locked) return <UpgradeEmptyState feature="Warehouse" />;

  return (
    <div style={{ padding: 24 }}>
      {showAddLocation && <AddLocationModal onClose={() => setShowAddLocation(false)} onAdded={reload} />}
      {showAddAppointment && <AddAppointmentModal vehicles={vehicles} onClose={() => setShowAddAppointment(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Warehouse']}
            titlePlain="Warehouse"
            titleEm="operations"
            subtitle="Storage locations &amp; dock scheduling"
          />
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg)', borderRadius: 9, padding: 4 }}>
          <button type="button" onClick={() => setTab('locations')} style={{ height: 32, padding: '0 16px', borderRadius: 'var(--r)', border: 'none', background: tab === 'locations' ? 'var(--white)' : 'transparent', color: tab === 'locations' ? 'var(--ink)' : 'var(--ink3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Locations</button>
          <button type="button" onClick={() => setTab('dock')} style={{ height: 32, padding: '0 16px', borderRadius: 'var(--r)', border: 'none', background: tab === 'dock' ? 'var(--white)' : 'transparent', color: tab === 'dock' ? 'var(--ink)' : 'var(--ink3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Dock Schedule</button>
          <button type="button" onClick={() => setTab('map')} style={{ height: 32, padding: '0 16px', borderRadius: 'var(--r)', border: 'none', background: tab === 'map' ? 'var(--white)' : 'transparent', color: tab === 'map' ? 'var(--ink)' : 'var(--ink3)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Warehouse Map</button>
        </div>
      </div>

      {tab === 'locations' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button type="button" onClick={() => setShowAddLocation(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Icon name="plus" size={15} /> Add location
            </button>
          </div>
          <div style={cardStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Code', 'Name', 'Zone', 'Capacity', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locations.map(l => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>{l.code}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.zone || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{l.capacity_units ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: l.active ? '#ecfdf5' : '#f1f5f9', color: l.active ? '#065f46' : '#64748b' }}>{l.active ? 'ACTIVE' : 'INACTIVE'}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button type="button" onClick={() => removeLocation(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="close" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {locations.length === 0 && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No storage locations yet.</div>}
          </div>
        </>
      )}

      {tab === 'dock' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button type="button" onClick={() => setShowAddAppointment(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Icon name="calendar" size={15} /> Schedule appointment
            </button>
          </div>
          <div style={cardStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Dock', 'Type', 'Vehicle', 'Reference', 'Scheduled', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map(a => {
                  const vName = vehicles.find(v => v.id === a.vehicle_id)?.name ?? '—';
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)' }}>{a.dock_number}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{a.appointment_type}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{vName}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{a.reference || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink3)', fontSize: 12 }}>{new Date(a.scheduled_at).toLocaleString()}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px', background: '#f1f5f9', color: '#64748b' }}>{a.status.replace('_', ' ')}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {a.status === 'SCHEDULED' && <button type="button" onClick={() => setAppointmentStatus(a.id, 'check-in')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Check in</button>}
                        {a.status === 'CHECKED_IN' && <button type="button" onClick={() => setAppointmentStatus(a.id, 'complete')} style={{ fontSize: 11, fontWeight: 600, color: '#065f46', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Complete</button>}
                        {(a.status === 'SCHEDULED' || a.status === 'CHECKED_IN') && <button type="button" onClick={() => setAppointmentStatus(a.id, 'cancel')} style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {appointments.length === 0 && <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No dock appointments scheduled.</div>}
          </div>
        </>
      )}

      {tab === 'map' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {occupancyLoading && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading occupancy…</div>}
            {!occupancyLoading && occupancy?.length === 0 && (
              <div style={{ ...cardStyle, padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No active storage locations yet — add one under the Locations tab.</div>
            )}
            {!occupancyLoading && occupancy?.map(z => (
              <div key={z.zone} style={cardStyle}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{z.zone}</div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: 'var(--ink3)' }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#059669', marginRight: 4 }} />0-60%</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ca8a04', marginRight: 4 }} />61-85%</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#dc2626', marginRight: 4 }} />86-100%</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10, padding: 16 }}>
                  {z.locations.map(loc => {
                    const pct = loc.occupancy_pct;
                    const color = pct == null ? 'var(--ink3)' : pct > 85 ? '#dc2626' : pct > 60 ? '#ca8a04' : '#059669';
                    const bg = pct == null ? 'var(--bg)' : pct > 85 ? 'rgba(220,38,38,0.1)' : pct > 60 ? 'rgba(202,138,4,0.1)' : 'rgba(22,163,74,0.1)';
                    return (
                      <div key={loc.id} title={`${loc.name} — ${loc.occupied_units} occupied${loc.capacity_units != null ? ` / ${loc.capacity_units} capacity` : ''}`}
                        style={{ border: `1.5px solid ${color}`, background: bg, borderRadius: 9, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{loc.code}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 4 }}>{pct != null ? `${pct}%` : '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>{pct == null ? 'No capacity set' : `${loc.occupied_units}/${loc.capacity_units}`}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, padding: 16, position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
              <Icon name="sparkle" size={14} color="var(--teal)" /> AI Insight
            </div>
            {!insight && !insightLoading && !insightError && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>Generate a rearrangement suggestion based on real occupancy data.</div>
            )}
            {insightLoading && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>Analyzing occupancy…</div>}
            {insight && <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-line' }}>{insight}</div>}
            {insightError && (
              <div style={{ fontSize: 12, color: insightError.includes('not configured') ? 'var(--ink3)' : '#dc2626', marginBottom: 12 }}>
                {insightError.includes('not configured')
                  ? <>Configure AI in <a href="/settings?s=int-ai" style={{ color: 'var(--teal)', fontWeight: 600 }}>Settings</a> to enable insights.</>
                  : insightError}
              </div>
            )}
            <button type="button" onClick={generateInsight} disabled={insightLoading}
              style={{ width: '100%', padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: insightLoading ? 0.6 : 1 }}>
              {insightLoading ? 'Generating…' : insight ? 'Regenerate' : 'Generate Insight'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
