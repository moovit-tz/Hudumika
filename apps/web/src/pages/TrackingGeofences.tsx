import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, Circle, Marker, useMapEvents } from 'react-leaflet';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import 'leaflet/dist/leaflet.css';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';

interface Geofence { id: string; name: string; zone_type: string; center_lat: number; center_lon: number; radius_km: number; active: boolean }

const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };

function ClickToSetCenter({ onPick }: { onPick: (pos: [number, number]) => void }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function AddGeofenceModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [zoneType, setZoneType] = useState('CUSTOM');
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/v1/tracking/geofences', {
        method: 'POST',
        body: JSON.stringify({ name, zone_type: zoneType, center_lat: center[0], center_lon: center[1], radius_km: Number(radiusKm) }),
      });
      onAdded(); onClose();
    } catch (err: any) { setError(err.message || 'Failed to create geofence'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(520px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Create a geofence</DialogTitle>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Click the map to set the center point</div>
        <div style={{ height: 220, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 14 }}>
          <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
            <MapTileLayer />
            <ClickToSetCenter onPick={setCenter} />
            <Marker position={center} />
            <Circle center={center} radius={Number(radiusKm || 0) * 1000} pathOptions={{ color: '#0891b2', fillOpacity: 0.1 }} />
          </MapContainer>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Zone type</label>
              <Select value={zoneType} onValueChange={setZoneType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  <SelectItem value="DEPOT">DEPOT</SelectItem>
                  <SelectItem value="CUSTOMER_SITE">CUSTOMER SITE</SelectItem>
                  <SelectItem value="RESTRICTED">RESTRICTED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ width: 120 }}><label style={labelStyle}>Radius (km)</label><input type="number" step="0.1" value={radiusKm} onChange={e => setRadiusKm(e.target.value)} style={inputStyle} /></div>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !name} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Create geofence'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const TrackingGeofences: React.FC = () => {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // A tenant with no geofences configured yet — the normal starting state,
  // since these are opt-in — sees the real "No geofences created yet" empty
  // state below, not four fabricated zones (one of them with coordinates in
  // Zambia mislabeled as a Tanzanian border post) standing in for it.
  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/geofences')
      .then(res => setGeofences(Array.isArray(res) ? res : []))
      .catch(() => setGeofences([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function remove(id: string) {
    if (!(await showConfirm('Delete this geofence?', { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/tracking/geofences/${id}`, { method: 'DELETE' });
    reload();
  }

  const mapCenter: [number, number] = geofences.length ? [geofences[0].center_lat, geofences[0].center_lon] : DEFAULT_CENTER;

  return (
    <div style={{ padding: '0 0 24px'}}>
      {showAdd && <AddGeofenceModal onClose={() => setShowAdd(false)} onAdded={reload} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Geofences']}
            titlePlain="Zone"
            titleEm="geofences"
            subtitle="Zones checked against live vehicle positions"
          />
        </div>
        <button type="button" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
          <Icon name="mapPin" size={15} /> Create geofence
        </button>
      </div>

      <div style={{ height: 320, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
        <MapContainer center={mapCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
          <MapTileLayer />
          {geofences.map(g => (
            <Circle key={g.id} center={[g.center_lat, g.center_lon]} radius={g.radius_km * 1000} pathOptions={{ color: '#0891b2', fillOpacity: 0.1 }} />
          ))}
        </MapContainer>
      </div>

      <SectionCard>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              {['Name', 'Type', 'Radius', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && geofences.map(g => (
              <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--ink)' }}>{g.name}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{g.zone_type.replace('_', ' ')}</td>
                <td style={{ padding: '10px 14px', color: 'var(--ink2)' }}>{g.radius_km} km</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 'var(--badge-radius)', padding: '2px 10px', background: g.active ? 'var(--green-l)' : 'var(--bg)', color: g.active ? 'var(--green)' : 'var(--ink3)' }}>{g.active ? 'ACTIVE' : 'INACTIVE'}</span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <button type="button" onClick={() => remove(g.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}>
                    <Icon name="close" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && geofences.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No geofences created yet.</div>
        )}
      </SectionCard>
    </div>
  );
};
