import { useSearchParams, Link } from 'react-router-dom';
import { TruckLoadOverview, TruckLoadEmpty } from '../components/tracking/TruckLoadOverview.js';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';
import { PageLoading } from '../components/ui/spinner.js';
import './FreightOperations.css';
import { Tip } from '../components/ui/tooltip.js';

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

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 18 };

function UpgradeEmptyState({ feature }: { feature: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: 'var(--white)', border: '1px dashed var(--border)', borderRadius: 'var(--r)', padding: '60px 20px', textAlign: 'center' }}>
        <Icon name="lock" size={28} color="var(--ink3)" />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 12 }}>{feature} is an Enterprise feature</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 6 }}>Upgrade your plan to unlock this tool.</div>
        <a href="/subscription" style={{ display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 'var(--r)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
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
      <meshBasicMaterial color="#64748b" wireframe />
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
    <Canvas camera={{ position: presetPosition(cameraPreset, L, W, H), fov: 45 }} style={{ background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)', borderRadius: 'var(--r)' }}>
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

function AddManifestModal({ onClose, onAdded, vehicleId }: { onClose: () => void; onAdded: (id: string) => void; vehicleId?: string }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/v1/tracking/manifests', {
        method: 'POST',
        body: JSON.stringify({
          name, origin, destination, vehicle_id: vehicleId || undefined, container_length_cm: Number(length), container_width_cm: Number(width),
          container_height_cm: Number(height), max_weight_kg: Number(maxWeight),
        }),
      });
      onAdded(res.id); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save plan'); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Create a load plan</DialogTitle>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Enter measured internal dimensions and the rated payload limit.</div>
        {error && <Banner variant="error">{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label htmlFor="trackingcargoloading-field-1" style={labelStyle}>Name</label><Input id="trackingcargoloading-field-1" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Load for Trip #42" /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label htmlFor="trackingcargoloading-field-2" style={labelStyle}>Length (cm)</label><Input id="trackingcargoloading-field-2" required min="0.1" step="any" type="number" value={length} onChange={e => setLength(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label htmlFor="trackingcargoloading-field-3" style={labelStyle}>Width (cm)</label><Input id="trackingcargoloading-field-3" required min="0.1" step="any" type="number" value={width} onChange={e => setWidth(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label htmlFor="trackingcargoloading-field-4" style={labelStyle}>Height (cm)</label><Input id="trackingcargoloading-field-4" required min="0.1" step="any" type="number" value={height} onChange={e => setHeight(e.target.value)} /></div>
          </div>
          <div><label htmlFor="trackingcargoloading-field-5" style={labelStyle}>Origin</label><Input id="trackingcargoloading-field-5" required value={origin} onChange={e => setOrigin(e.target.value)} /></div><div><label htmlFor="trackingcargoloading-field-6" style={labelStyle}>Destination</label><Input id="trackingcargoloading-field-6" required value={destination} onChange={e => setDestination(e.target.value)} /></div>
          <div><label htmlFor="trackingcargoloading-field-7" style={labelStyle}>Max weight (kg)</label><Input id="trackingcargoloading-field-7" required min="0.1" step="any" type="number" value={maxWeight} onChange={e => setMaxWeight(e.target.value)} /></div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name}>{saving ? 'Saving…' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportShipmentModal({ manifestId, onClose, onImported }: { manifestId: string; onClose: () => void; onImported: () => void }) {
  const [shipmentId, setShipmentId] = useState('');
  const [shipments, setShipments] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/shipments').then(res => setShipments(res.items || [])).catch(e => setError(e.message));
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); } finally { setImporting(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Import from Consignment</DialogTitle>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Automatically populate cargo items from a selected consignment.</div>
        {error && <Banner variant="error">{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Select Consignment</label>
            <Combobox
              options={shipments.map(s => ({ value: s.id, label: `${s.ref_number} (${s.type})` }))}
              value={shipmentId} onChange={setShipmentId} placeholder="-- Select Consignment --"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={importing || !shipmentId}>{importing ? 'Importing…' : 'Import'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DispatchModal({ manifestId, onClose, onDispatched }: { manifestId: string; onClose: () => void; onDispatched: () => void }) {
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(setVehicles).catch(e => setError(e.message));
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Dispatch failed'); } finally { setDispatching(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[min(440px,92vw)] gap-0" style={{ padding: 28 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Dispatch to Vehicle</DialogTitle>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Assign this approved load plan to a truck/vehicle for dispatch.</div>
        {error && <Banner variant="error">{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Select Vehicle</label>
            <Combobox
              options={vehicles.map(v => ({ value: v.id, label: v.name, sublabel: v.plate_number || undefined }))}
              value={vehicleId} onChange={setVehicleId} placeholder="-- Select Vehicle --"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={dispatching || !vehicleId}>{dispatching ? 'Dispatching…' : 'Dispatch'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const BOX_COLORS = ['#0891b2', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#eab308'];

export const TrackingCargoLoading: React.FC = () => {
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicle') || '';
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [manifestId, setManifestId] = useState('');
  const itemsRequest = useRef(0);
  
  const [items, setItems] = useState<CargoItem[]>([]);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const report = (e: unknown) => setError(e instanceof Error ? e.message : 'Request failed');
  
  const [showAddManifest, setShowAddManifest] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  
  const [packing, setPacking] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');

  const [itemLabel, setItemLabel] = useState('');
  const [itemL, setItemL] = useState('');
  const [itemW, setItemW] = useState('');
  const [itemH, setItemH] = useState('');
  const [itemWeight, setItemWeight] = useState('');
  const [itemQty, setItemQty] = useState('1');

  const reloadManifests = useCallback((newId?: string) => {
    apiFetch(`/v1/tracking/manifests${vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : ''}`)
      .then((list: Manifest[]) => { 
        setManifests(list); 
        if (newId) setManifestId(newId);
        else setManifestId(previous => list.some(m => m.id === previous) ? previous : list[0]?.id || ''); 
      })
      .catch((e: any) => { if (e.message?.includes('plan')) setLocked(true); else report(e); })
      .finally(() => setLoading(false));
  }, [vehicleId]);

  useEffect(() => { reloadManifests(); }, [reloadManifests]);

  const reloadItems = useCallback(() => {
    const request = ++itemsRequest.current;
    if (!manifestId) { setItems([]); return; }
    setItems([]);
    apiFetch(`/v1/tracking/manifests/${manifestId}/items`).then(rows => { if (request === itemsRequest.current) setItems(rows); }).catch(e => { if (request === itemsRequest.current) report(e); });
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
    setError('');
    try {
      const result = await apiFetch(`/v1/tracking/manifests/${manifestId}/pack`, { method: 'POST', body: JSON.stringify({}) });
      setPackResult(result);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pack load');
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

  if (loading) return <PageLoading label="Loading cargo plans…" />;
  if (locked) return <UpgradeEmptyState feature="Cargo / CBM Loading Tool" />;

  return (
    <div className="freight-workspace">
      {error && <Banner variant="error">{error}</Banner>}
      {vehicleId && <Button variant="link" asChild><Link to={`/tracking/vehicles/${encodeURIComponent(vehicleId)}?tab=Load%20Plan`}>Back to vehicle</Link></Button>}
      {showAddManifest && <AddManifestModal vehicleId={vehicleId} onClose={() => setShowAddManifest(false)} onAdded={id => reloadManifests(id)} />}
      {showImportModal && manifest && <ImportShipmentModal manifestId={manifest.id} onClose={() => setShowImportModal(false)} onImported={() => { reloadItems(); reloadManifests(); }} />}
      {showDispatchModal && manifest && <DispatchModal manifestId={manifest.id} onClose={() => setShowDispatchModal(false)} onDispatched={() => reloadManifests()} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageHeader
            crumbs={['HuduFreight', 'Cargo Loading']}
            titlePlain="Cargo"
            titleEm="loading"
            subtitle="Build your load plan, check available space, and prepare your cargo for dispatch."
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Select value={manifestId} onValueChange={setManifestId} disabled={manifests.length === 0}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="— No load plans —" /></SelectTrigger>
            <SelectContent>
              {manifests.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.status})</SelectItem>)}
            </SelectContent>
          </Select>
          {manifests.length > 0 && <Button type="button" onClick={() => setShowAddManifest(true)}><Icon name="plus" size={15} /> New plan</Button>}
        </div>
      </div>

      {!manifest ? (
        <TruckLoadEmpty onCreate={() => setShowAddManifest(true)} />
      ) : (
        <>
        <TruckLoadOverview manifest={manifest} items={items} />
        <div className="truck-load-workspace">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionCard title={manifest.name} action={
              <Tip label="Delete load plan">
                <Button disabled={!isDraft} type="button" onClick={() => { void deleteManifest().catch(report); }} aria-label="Delete load plan" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} data-ui-native-button=""><Icon name="close" size={14} /></Button>
              </Tip>
            }>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
                {manifest.container_length_cm} × {manifest.container_width_cm} × {manifest.container_height_cm} cm · max {manifest.max_weight_kg.toLocaleString()} kg
              </div>
              
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {isDraft ? (
                  <Button type="button" size="sm" disabled={!items.length || items.some(item=>item.placements.length!==item.quantity)} onClick={() => { void approvePlan().catch(report); }} style={{ flex: 1 }}>
                    Approve
                  </Button>
                ) : manifest.status === 'APPROVED' ? (
                  <Button type="button" size="sm" onClick={() => setShowDispatchModal(true)} style={{ flex: 1 }}>
                    Dispatch
                  </Button>
                ) : (
                  <div style={{ flex: 1, padding: '6px 12px', background: 'var(--bg)', color: 'var(--ink)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    Dispatched ({manifest.vehicle_plate || manifest.vehicle_name || 'Vehicle Assigned'})
                  </div>
                )}
              </div>
            </SectionCard>

            {isDraft && (
              <SectionCard title="Add cargo item" action={
                <Button onClick={() => setShowImportModal(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }} data-ui-native-button="">Import</Button>
              }>
                <form onSubmit={e => { void addItem(e).catch(report); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Input required value={itemLabel} onChange={e => setItemLabel(e.target.value)} placeholder="Label" aria-label="Cargo name" />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input required min="0.1" step="any" type="number" value={itemL} onChange={e => setItemL(e.target.value)} placeholder="L cm" aria-label="Length (cm)" />
                    <Input required min="0.1" step="any" type="number" value={itemW} onChange={e => setItemW(e.target.value)} placeholder="W cm" aria-label="Width (cm)" />
                    <Input required min="0.1" step="any" type="number" value={itemH} onChange={e => setItemH(e.target.value)} placeholder="H cm" aria-label="Height (cm)" />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input required min="0.1" step="any" type="number" value={itemWeight} onChange={e => setItemWeight(e.target.value)} placeholder="kg" aria-label="Weight per unit (kg)" />
                    <Input required min="0.1" step="any" type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} placeholder="Qty" aria-label="Quantity" />
                  </div>
                  <Button type="submit">Add item</Button>
                </form>
              </SectionCard>
            )}

            <SectionCard title={`Items (${items.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {items.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: it.color || '#0891b2', flexShrink: 0 }} />
                    <div style={{ flex: 1, color: 'var(--ink)' }}>{it.label} × {it.quantity}</div>
                    {isDraft && <Button type="button" aria-label={`Remove ${it.label}`} title="Remove cargo" onClick={() => { void removeItem(it.id).catch(report); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }} data-ui-native-button=""><Icon name="close" size={12} /></Button>}
                  </div>
                ))}
                {items.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No items added yet.</div>}
              </div>
              <Button type="button" onClick={() => { void pack().catch(report); }} disabled={packing || items.length === 0 || !isDraft}
                style={{ marginTop: 12, width: '100%', padding: 'var(--ds-btn-py) 14px', borderRadius: 'var(--r)', border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: items.length === 0 || !isDraft ? 'default' : 'pointer', opacity: items.length === 0 || !isDraft ? 0.5 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                {packing ? 'Packing…' : 'Pack load'}
              </Button>
            </SectionCard>

            {packResult && (
              <SectionCard title="Utilization">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Volume</span><strong>{packResult.volume_utilization_pct}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Weight</span><strong>{packResult.weight_utilization_pct}%</strong>
                </div>
                {packResult.unplaced_items.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--red)' }}>
                    Didn't fit: {packResult.unplaced_items.map(u => `${u.label} ×${u.count}`).join(', ')}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {([['iso', 'Iso'], ['front', 'Front'], ['side', 'Side'], ['top', 'Top']] as [CameraPreset, string][]).map(([preset, label]) => (
                <Button
                  key={preset}
                  type="button"
                  onClick={() => setCameraPreset(preset)}
                  style={{
                    padding: 'var(--ds-btn-py-sm) 14px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${cameraPreset === preset ? 'var(--teal)' : 'var(--border)'}`,
                    background: cameraPreset === preset ? 'var(--teal-l)' : 'var(--white)',
                    color: cameraPreset === preset ? 'var(--teal)' : 'var(--ink2)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                 data-ui-native-button="">
                  {label}
                </Button>
              ))}
            </div>
            <div style={{ height: 'clamp(360px, 55vh, 600px)', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <CargoScene manifest={manifest} items={items} cameraPreset={cameraPreset} />
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
};
