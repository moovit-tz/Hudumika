import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top';

export interface Manifest {
  id: string; name: string; container_length_cm: number; container_width_cm: number;
  container_height_cm: number; max_weight_kg: number;
  vehicle_id?: string | null; shipment_id?: string | null;
  origin?: string | null; destination?: string | null;
  vehicle_name?: string | null; vehicle_plate?: string | null;
  shipment_ref?: string | null;
  status: 'DRAFT' | 'APPROVED' | 'DISPATCHED';
  created_at?: string;
}
export interface CargoItem {
  id: string; label: string; length_cm: number; width_cm: number; height_cm: number;
  weight_kg: number; quantity: number; color: string | null; placements: { x: number; y: number; z: number }[];
}
export interface PackResult {
  items: CargoItem[]; volume_utilization_pct: number; weight_utilization_pct: number;
  unplaced_items: { label: string; count: number }[];
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 18 };

function UpgradeEmptyState({ feature }: { feature: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 9, padding: '60px 20px', textAlign: 'center' }}>
        <Icon name="lock" size={28} color="var(--ink3)" />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 12 }}>{feature} is an Enterprise feature</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 6 }}>Upgrade your plan to unlock this tool.</div>
        <a href="/subscription" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 9, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          View plans
        </a>
      </div>
    </div>
  );
}

function ContainerWireframe({ l, w, h }: { l: number; w: number; h: number }) {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[l, h, w]} />
      <meshBasicMaterial color="var(--ink3)" wireframe />
    </mesh>
  );
}

function CargoBox({ pos, dims, color }: { pos: [number, number, number]; dims: [number, number, number]; color: string }) {
  return (
    <mesh position={pos}>
      <boxGeometry args={dims} />
      <meshStandardMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

function presetPosition(preset: CameraPreset, L: number, W: number, H: number): [number, number, number] {
  switch (preset) {
    case 'front': return [0, H * 0.5, W * 2.2];
    case 'side': return [L * 2.2, H * 0.5, 0];
    case 'top': return [0.001, H * 3, 0.001];
    default: return [L * 1.6, H * 1.4, W * 1.8];
  }
}

function CameraRig({ preset, L, W, H, controlsRef }: { preset: CameraPreset; L: number; W: number; H: number; controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  useEffect(() => {
    const [x, y, z] = presetPosition(preset, L, W, H);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [preset, L, W, H, camera, controlsRef]);
  return null;
}

export function CargoScene({ manifest, items, cameraPreset }: { manifest: Manifest; items: CargoItem[]; cameraPreset: CameraPreset }) {
  const scale = 0.01;
  const L = manifest.container_length_cm * scale;
  const W = manifest.container_width_cm * scale;
  const H = manifest.container_height_cm * scale;
  const controlsRef = useRef<any>(null);

  return (
    <Canvas camera={{ position: presetPosition(cameraPreset, L, W, H), fov: 45 }} style={{ background: 'var(--bg)', borderRadius: 9 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <ContainerWireframe l={L} w={W} h={H} />
      {items.flatMap(item =>
        item.placements.map((p, i) => (
          <CargoBox
            key={`${item.id}-${i}`}
            pos={[(p.x * scale) - L / 2, (p.z * scale) - H / 2, (p.y * scale) - W / 2]}
            dims={[item.length_cm * scale * 0.98, item.height_cm * scale * 0.98, item.width_cm * scale * 0.98]}
            color={item.color || '#0891b2'}
          />
        ))
      )}
      <CameraRig preset={cameraPreset} L={L} W={W} H={H} controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} enablePan enableZoom enableRotate />
    </Canvas>
  );
}

function AddManifestModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [length, setLength] = useState('1200');
  const [width, setWidth] = useState('235');
  const [height, setHeight] = useState('260');
  const [maxWeight, setMaxWeight] = useState('24000');
  
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/v1/tracking/manifests', {
        method: 'POST',
        body: JSON.stringify({
          name, container_length_cm: Number(length), container_width_cm: Number(width),
          container_height_cm: Number(height), max_weight_kg: Number(maxWeight),
        }),
      });
      onAdded(res.id); onClose();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Create a load plan</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Default dimensions match a standard 40ft container (cm)</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={labelStyle}>Name</label><input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Load for Trip #42" style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Length (cm)</label><input type="number" value={length} onChange={e => setLength(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Width (cm)</label><input type="number" value={width} onChange={e => setWidth(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Height (cm)</label><input type="number" value={height} onChange={e => setHeight(e.target.value)} style={inputStyle} /></div>
          </div>
          <div><label style={labelStyle}>Max weight (kg)</label><input type="number" value={maxWeight} onChange={e => setMaxWeight(e.target.value)} style={inputStyle} /></div>
          
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={saving || !name} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportShipmentModal({ manifestId, onClose, onImported }: { manifestId: string; onClose: () => void; onImported: () => void }) {
  const [shipmentId, setShipmentId] = useState('');
  const [shipments, setShipments] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiFetch('/v1/shipments').then(res => setShipments(res.items || [])).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shipmentId) return;
    setImporting(true);
    try {
      await apiFetch(`/v1/tracking/manifests/${manifestId}/import-shipment`, {
        method: 'POST', body: JSON.stringify({ shipment_id: shipmentId })
      });
      // Optionally link the shipment_id on the manifest itself
      await apiFetch(`/v1/tracking/manifests/${manifestId}`, {
        method: 'PATCH', body: JSON.stringify({ shipment_id: shipmentId })
      });
      onImported();
      onClose();
    } finally { setImporting(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Import from Consignment</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Automatically populate cargo items from a selected consignment.</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Select Consignment</label>
            <Combobox
              options={shipments.map(s => ({ value: s.id, label: `${s.ref_number} (${s.type})` }))}
              value={shipmentId} onChange={setShipmentId} placeholder="-- Select Consignment --"
            />
          </div>
          
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={importing || !shipmentId} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: importing ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DispatchModal({ manifestId, onClose, onDispatched }: { manifestId: string; onClose: () => void; onDispatched: () => void }) {
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    setDispatching(true);
    try {
      await apiFetch(`/v1/tracking/manifests/${manifestId}/dispatch`, {
        method: 'POST', body: JSON.stringify({ vehicle_id: vehicleId })
      });
      onDispatched();
      onClose();
    } finally { setDispatching(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 440, maxWidth: '92vw', boxShadow: 'var(--elev-lg)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Dispatch to Vehicle</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Assign this approved load plan to a truck/vehicle for dispatch.</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Select Vehicle</label>
            <Combobox
              options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
              value={vehicleId} onChange={setVehicleId} placeholder="-- Select Vehicle --"
            />
          </div>
          
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', cursor: 'pointer', fontSize: 13, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Cancel</button>
            <button type="submit" disabled={dispatching || !vehicleId} style={{ padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: dispatching ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
              {dispatching ? 'Dispatching…' : 'Dispatch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const BOX_COLORS = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];

export const TrackingCargoLoading: React.FC = () => {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [manifestId, setManifestId] = useState('');
  
  const [items, setItems] = useState<CargoItem[]>([]);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  
  const [showAddManifest, setShowAddManifest] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  
  const [packing, setPacking] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');

  const [itemLabel, setItemLabel] = useState('');
  const [itemL, setItemL] = useState('100');
  const [itemW, setItemW] = useState('100');
  const [itemH, setItemH] = useState('100');
  const [itemWeight, setItemWeight] = useState('50');
  const [itemQty, setItemQty] = useState('1');

  const reloadManifests = useCallback((newId?: string) => {
    apiFetch('/v1/tracking/manifests')
      .then((list: Manifest[]) => { 
        setManifests(list); 
        if (newId) setManifestId(newId);
        else if (!manifestId && list.length > 0) setManifestId(list[0].id); 
      })
      .catch((e: any) => { if (e.message?.includes('plan')) setLocked(true); })
      .finally(() => setLoading(false));
  }, [manifestId]);

  useEffect(() => { reloadManifests(); }, []);

  const reloadItems = useCallback(() => {
    if (!manifestId) return;
    apiFetch(`/v1/tracking/manifests/${manifestId}/items`).then(setItems).catch(() => setItems([]));
    setPackResult(null);
  }, [manifestId]);

  useEffect(() => { reloadItems(); }, [reloadItems]);

  const manifest = manifests.find(m => m.id === manifestId);
  const isDraft = manifest?.status === 'DRAFT';

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`/v1/tracking/manifests/${manifestId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        label: itemLabel, length_cm: Number(itemL), width_cm: Number(itemW), height_cm: Number(itemH),
        weight_kg: Number(itemWeight), quantity: Number(itemQty),
        color: BOX_COLORS[items.length % BOX_COLORS.length],
      }),
    });
    setItemLabel('');
    reloadItems();
  }

  async function removeItem(id: string) {
    await apiFetch(`/v1/tracking/items/${id}`, { method: 'DELETE' });
    reloadItems();
  }

  async function pack() {
    if (!manifestId) return;
    setPacking(true);
    try {
      const result = await apiFetch(`/v1/tracking/manifests/${manifestId}/pack`, { method: 'POST', body: JSON.stringify({}) });
      setPackResult(result);
      setItems(result.items);
    } finally { setPacking(false); }
  }

  async function approvePlan() {
    if (!(await showConfirm('Approve this plan? It will be locked for editing.', { variant: 'warning', confirmLabel: 'Approve' }))) return;
    await apiFetch(`/v1/tracking/manifests/${manifestId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) });
    reloadManifests();
  }

  async function deleteManifest() {
    if (!manifestId || !(await showConfirm('Delete this load plan?', { confirmLabel: 'Delete' }))) return;
    await apiFetch(`/v1/tracking/manifests/${manifestId}`, { method: 'DELETE' });
    setManifestId('');
    reloadManifests();
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Loading cargo loading tool…</div>;
  if (locked) return <UpgradeEmptyState feature="Cargo / CBM Loading Tool" />;

  return (
    <div style={{ padding: '0 0 24px'}}>
      {showAddManifest && <AddManifestModal onClose={() => setShowAddManifest(false)} onAdded={id => reloadManifests(id)} />}
      {showImportModal && manifest && <ImportShipmentModal manifestId={manifest.id} onClose={() => setShowImportModal(false)} onImported={() => { reloadItems(); reloadManifests(); }} />}
      {showDispatchModal && manifest && <DispatchModal manifestId={manifest.id} onClose={() => setShowDispatchModal(false)} onDispatched={() => reloadManifests()} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Cargo Loading']}
            titlePlain="Cargo"
            titleEm="loading"
            subtitle="Plan a container/truck load and visualize it in 3D. Packing is computed automatically (first-fit-decreasing) — not manually draggable."
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={manifestId} onValueChange={setManifestId} disabled={manifests.length === 0}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="— No load plans —" /></SelectTrigger>
            <SelectContent>
              {manifests.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.status})</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => setShowAddManifest(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="plus" size={15} /> New load plan
          </button>
        </div>
      </div>

      {!manifest ? (
        <div style={{ ...cardStyle, padding: '60px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Create a load plan to get started.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{manifest.name}</div>
                <button type="button" onClick={deleteManifest} title="Delete load plan" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={14} /></button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
                {manifest.container_length_cm} × {manifest.container_width_cm} × {manifest.container_height_cm} cm · max {manifest.max_weight_kg.toLocaleString()} kg
              </div>
              
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {isDraft ? (
                  <button onClick={approvePlan} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', background: 'var(--indigo)', color: '#fff', borderRadius: 'var(--r)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    Approve Plan
                  </button>
                ) : manifest.status === 'APPROVED' ? (
                  <button onClick={() => setShowDispatchModal(true)} style={{ flex: 1, padding: 'var(--ds-btn-py-sm) 12px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 'var(--r)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    Dispatch Vehicle
                  </button>
                ) : (
                  <div style={{ flex: 1, padding: '6px 12px', background: 'var(--bg)', color: 'var(--ink)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    Dispatched ({manifest.vehicle_plate || manifest.vehicle_name || 'Vehicle Assigned'})
                  </div>
                )}
              </div>
            </div>

            {isDraft && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Add cargo item</div>
                  <button onClick={() => setShowImportModal(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Import</button>
                </div>
                
                <form onSubmit={addItem} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input required value={itemLabel} onChange={e => setItemLabel(e.target.value)} placeholder="Label" style={inputStyle} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" value={itemL} onChange={e => setItemL(e.target.value)} placeholder="L cm" style={inputStyle} />
                    <input type="number" value={itemW} onChange={e => setItemW(e.target.value)} placeholder="W cm" style={inputStyle} />
                    <input type="number" value={itemH} onChange={e => setItemH(e.target.value)} placeholder="H cm" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" value={itemWeight} onChange={e => setItemWeight(e.target.value)} placeholder="kg" style={inputStyle} />
                    <input type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} placeholder="Qty" style={inputStyle} />
                  </div>
                  <button type="submit" style={{ padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>Add item</button>
                </form>
              </div>
            )}

            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Items ({items.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {items.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: it.color || '#0891b2', flexShrink: 0 }} />
                    <div style={{ flex: 1, color: 'var(--ink)' }}>{it.label} × {it.quantity}</div>
                    {isDraft && <button type="button" onClick={() => removeItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={12} /></button>}
                  </div>
                ))}
                {items.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No items added yet.</div>}
              </div>
              <button type="button" onClick={pack} disabled={packing || items.length === 0 || !isDraft}
                style={{ marginTop: 12, width: '100%', padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: items.length === 0 || !isDraft ? 'default' : 'pointer', opacity: items.length === 0 || !isDraft ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                {packing ? 'Packing…' : 'Pack load'}
              </button>
            </div>

            {packResult && (
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Utilization</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Volume</span><strong>{packResult.volume_utilization_pct}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Weight</span><strong>{packResult.weight_utilization_pct}%</strong>
                </div>
                {packResult.unplaced_items.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, fontSize: 11, color: 'var(--red)' }}>
                    Didn't fit: {packResult.unplaced_items.map(u => `${u.label} ×${u.count}`).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {([['iso', 'Iso'], ['front', 'Front'], ['side', 'Side'], ['top', 'Top']] as [CameraPreset, string][]).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCameraPreset(preset)}
                  style={{
                    padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${cameraPreset === preset ? 'var(--teal)' : 'var(--border)'}`,
                    background: cameraPreset === preset ? 'var(--teal-l)' : 'var(--white)',
                    color: cameraPreset === preset ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: 600, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <CargoScene manifest={manifest} items={items} cameraPreset={cameraPreset} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
