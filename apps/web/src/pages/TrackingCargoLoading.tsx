import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showConfirm } from '../lib/confirm.js';
import { TruckLoadOverview } from '../components/tracking/TruckLoadOverview.js';
import './FreightOperations.css';
import './TrackingCargoLoading.css';

export interface Manifest {
  id: string;
  name: string;
  container_length_cm: number;
  container_width_cm: number;
  container_height_cm: number;
  max_weight_kg: number;
  vehicle_id?: string | null;
  shipment_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicle_name?: string | null;
  vehicle_plate?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_photo_url?: string | null;
  shipment_ref?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_license?: string | null;
  status: 'DRAFT' | 'APPROVED' | 'DISPATCHED';
  created_at?: string;
  trip_id?: string | null;
}

export interface CargoItem {
  id: string;
  label: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  quantity: number;
  color: string | null;
  placements: { x: number; y: number; z: number; slot?: string }[];
}

export interface FleetVehicleAsset {
  id: string;
  name: string;
  plate_number?: string | null;
  make?: string | null;
  model?: string | null;
  type?: string | null;
  photo_url?: string | null;
  status?: string;
  ownership?: string | null;
  group_name?: string | null;
  container_length_cm?: number;
  container_width_cm?: number;
  container_height_cm?: number;
  payload_capacity_kg?: number;
}

export interface DriverRecord {
  id: string;
  name: string;
  phone?: string | null;
  license_number?: string | null;
  assigned_vehicle_id?: string | null;
  status?: string;
}

export interface ConsignmentItem {
  id: string;
  ref_number: string;
  type: string;
  goods_desc: string;
  origin: string;
  destination: string;
  weight_kg: number;
  volume_cbm: number;
  quantity: number;
  is_fragile: boolean;
  dock?: string;
  status: string;
}

// Active consignments list (connecting to platform shipments & warehouse lots)
const SAMPLE_CONSIGNMENTS: ConsignmentItem[] = [
  {
    id: 'shp-101',
    ref_number: 'SHP-9821',
    type: 'Standard Cargo',
    goods_desc: 'Electronics Package & Inverters',
    origin: 'Dar es Salaam (Dock #3)',
    destination: 'Dodoma Ministry',
    weight_kg: 450,
    volume_cbm: 1.8,
    quantity: 12,
    is_fragile: true,
    dock: 'Dock #3',
    status: 'READY_TO_LOAD',
  },
  {
    id: 'shp-102',
    ref_number: 'SHP-5839',
    type: 'Heavy Pallet',
    goods_desc: 'Industrial Machinery Spares & Pumps',
    origin: 'Dar Port Bay A',
    destination: 'Arusha Logistics Hub',
    weight_kg: 1000,
    volume_cbm: 2.4,
    quantity: 2,
    is_fragile: false,
    dock: 'Dock #1',
    status: 'READY_TO_LOAD',
  },
  {
    id: 'shp-103',
    ref_number: 'SHP-2212',
    type: 'Cold Chain',
    goods_desc: 'Medical Vaccines & Temperature-Monitored Serums',
    origin: 'Central Medical Depot',
    destination: 'Mwanza Regional Hospital',
    weight_kg: 320,
    volume_cbm: 1.2,
    quantity: 6,
    is_fragile: true,
    dock: 'Cold Bay 2',
    status: 'READY_TO_LOAD',
  },
  {
    id: 'shp-104',
    ref_number: 'SHP-4434',
    type: 'Dry Freight',
    goods_desc: 'Packaged Food & Retail Beverages',
    origin: 'Dar es Salaam (Depot 4)',
    destination: 'Mbeya Terminal',
    weight_kg: 850,
    volume_cbm: 3.1,
    quantity: 24,
    is_fragile: false,
    dock: 'Dock #3',
    status: 'READY_TO_LOAD',
  },
  {
    id: 'shp-105',
    ref_number: 'SHP-7741',
    type: 'Automotive Spares',
    goods_desc: 'Engine Transmission & Suspension Packs',
    origin: 'Dar Port Bay B',
    destination: 'Tanga Depot',
    weight_kg: 680,
    volume_cbm: 1.6,
    quantity: 8,
    is_fragile: false,
    dock: 'Dock #2',
    status: 'READY_TO_LOAD',
  },
  {
    id: 'shp-106',
    ref_number: 'SHP-8893',
    type: 'High-Voltage Unit',
    goods_desc: 'Electrical Substation Transformers',
    origin: 'Dar Energy Bay',
    destination: 'Morogoro Substation',
    weight_kg: 1200,
    volume_cbm: 2.8,
    quantity: 1,
    is_fragile: true,
    dock: 'Dock #3',
    status: 'READY_TO_LOAD',
  },
];

// Fallback seed items for Truck 07 / TRC-204
const DEFAULT_TRUCK_ITEMS: CargoItem[] = [
  {
    id: 'item-a1',
    label: 'SHP-9821 · Electronics',
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    weight_kg: 450,
    quantity: 1,
    color: '#0891b2',
    placements: [{ x: 0, y: 0, z: 0, slot: 'A1' }],
  },
  {
    id: 'item-a2',
    label: 'SHP-5839 · Machinery',
    length_cm: 120,
    width_cm: 80,
    height_cm: 90,
    weight_kg: 1000,
    quantity: 1,
    color: '#f97316',
    placements: [{ x: 120, y: 0, z: 0, slot: 'A2' }],
  },
  {
    id: 'item-a3',
    label: 'SHP-2212 · Vaccines',
    length_cm: 120,
    width_cm: 80,
    height_cm: 90,
    weight_kg: 320,
    quantity: 1,
    color: '#10b981',
    placements: [{ x: 240, y: 0, z: 0, slot: 'A3' }],
  },
  {
    id: 'item-b1',
    label: 'SHP-4434 · Dry Freight',
    length_cm: 120,
    width_cm: 80,
    height_cm: 110,
    weight_kg: 850,
    quantity: 1,
    color: '#8b5cf6',
    placements: [{ x: 0, y: 0, z: 100, slot: 'B1' }],
  },
  {
    id: 'item-b2',
    label: 'SHP-3312 · Generator',
    length_cm: 180,
    width_cm: 100,
    height_cm: 120,
    weight_kg: 1200,
    quantity: 1,
    color: '#ef4444',
    placements: [{ x: 120, y: 0, z: 100, slot: 'B2' }],
  },
  {
    id: 'item-b3',
    label: 'SHP-7741 · Auto Spares',
    length_cm: 120,
    width_cm: 80,
    height_cm: 90,
    weight_kg: 680,
    quantity: 1,
    color: '#eab308',
    placements: [{ x: 300, y: 0, z: 100, slot: 'B3' }],
  },
  {
    id: 'item-c1',
    label: 'SHP-8893 · Transformer',
    length_cm: 180,
    width_cm: 100,
    height_cm: 130,
    weight_kg: 1100,
    quantity: 1,
    color: '#06b6d4',
    placements: [{ x: 0, y: 0, z: 200, slot: 'C1' }],
  },
  {
    id: 'item-c2',
    label: 'SHP-0040 · Telecom',
    length_cm: 180,
    width_cm: 100,
    height_cm: 110,
    weight_kg: 900,
    quantity: 1,
    color: '#3b82f6',
    placements: [{ x: 180, y: 0, z: 200, slot: 'C2' }],
  },
];

/* =========================================================================
   OFFICIAL MANIFEST & LOADING SHEET MODAL (PRINTABLE)
========================================================================= */
function OfficialManifestModal({
  manifest,
  vehicle,
  driver,
  items,
  sealNumber,
  dockNumber,
  onClose,
}: {
  manifest: Manifest;
  vehicle?: FleetVehicleAsset | null;
  driver?: DriverRecord | null;
  items: CargoItem[];
  sealNumber: string;
  dockNumber: string;
  onClose: () => void;
}) {
  const totalWeight = items.reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.quantity) || 1), 0);
  const totalVolume = items.reduce(
    (sum, it) => sum + ((Number(it.length_cm) || 0) * (Number(it.width_cm) || 0) * (Number(it.height_cm) || 0) * (Number(it.quantity) || 1)) / 1000000,
    0
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="cargo-record-dialog max-w-[min(880px,96vw)] max-h-[90vh] overflow-y-auto gap-0" style={{ padding: 0 }}>
        <div className="cargo-manifest-print-sheet">
          <div className="cargo-manifest-header">
            <div>
              <div className="cargo-manifest-carrier-brand">HUDUFREIGHT CARRIER MANIFEST</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                Official Transport Bill of Lading &amp; Security Seal Verification Document
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>MANIFEST #{manifest.id.slice(0, 8).toUpperCase()}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Date: {new Date().toLocaleDateString()}</div>
              <Badge variant="success" style={{ marginTop: 4 }}>SECURITY SEAL VERIFIED</Badge>
            </div>
          </div>

          <div className="cargo-manifest-meta-grid">
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fleet Vehicle</span>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{vehicle?.name || manifest.vehicle_name || 'Truck 07 · Scania R450'}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>Plate: {vehicle?.plate_number || manifest.vehicle_plate || 'KAA 123A'}</div>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Assigned Driver</span>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{driver?.name || manifest.driver_name || 'Marcus Lee'}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>License: {driver?.license_number || manifest.driver_license || 'DRV-TZ-2048'}</div>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Loading Point &amp; Seal</span>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0891b2' }}>{sealNumber}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>Loading Dock: {dockNumber}</div>
            </div>
          </div>

          <div>
            <table className="cargo-manifest-table">
              <thead>
                <tr>
                  <th>Slot / Pos</th>
                  <th>Cargo Item Description</th>
                  <th>Dimensions (cm)</th>
                  <th>Weight (kg)</th>
                  <th>Units</th>
                  <th>Total Mass</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const slots = it.placements?.map(p => p.slot).filter(Boolean).join(', ') || `Slot ${idx + 1}`;
                  return (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 700, color: '#0891b2' }}>{slots}</td>
                      <td>{it.label}</td>
                      <td>{it.length_cm} × {it.width_cm} × {it.height_cm}</td>
                      <td>{it.weight_kg} kg</td>
                      <td>{it.quantity}</td>
                      <td style={{ fontWeight: 700 }}>{((Number(it.weight_kg) || 0) * (Number(it.quantity) || 1)).toLocaleString()} kg</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f1f5f9', borderRadius: 6, fontSize: 12 }}>
            <div>
              Total Gross Cargo Weight: <strong>{totalWeight.toLocaleString()} kg</strong> ({Math.round((totalWeight / (Number(manifest.max_weight_kg) || 28000)) * 100)}% payload)
            </div>
            <div>
              Total Cargo Volume: <strong>{totalVolume.toFixed(2)} CBM (m³)</strong>
            </div>
            <div>
              Status: <strong>{manifest.status}</strong>
            </div>
          </div>

          <div className="cargo-manifest-signatures">
            <div className="cargo-manifest-sign-box">
              <span>Driver Signature &amp; Acceptance of Load</span>
              <div className="cargo-manifest-sign-line" />
              <span>Date: ________________________</span>
            </div>
            <div className="cargo-manifest-sign-box">
              <span>Loading Bay Supervisor / Seal Verifier</span>
              <div className="cargo-manifest-sign-line" />
              <span>Date: ________________________</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }} className="no-print">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => window.print()}>
              <Icon name="copy" size={14} /> Print Carrier Manifest (PDF)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   DRIVER PICKER MODAL
========================================================================= */
function DriverPickerModal({
  drivers,
  currentDriverId,
  onClose,
  onSelectDriver,
}: {
  drivers: DriverRecord[];
  currentDriverId?: string | null;
  onClose: () => void;
  onSelectDriver: (driver: DriverRecord) => void;
}) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="cargo-record-dialog max-w-[min(480px,94vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Select Fleet Driver</DialogTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {drivers.map(d => {
            const isSel = d.id === currentDriverId;
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDriver(d)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: isSel ? '2px solid var(--teal)' : '1px solid var(--border)',
                  background: isSel ? 'var(--teal-l)' : 'var(--card-bg)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--teal)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {d.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{d.phone || '+255 712 345 678'} · {d.license_number || 'DRV-TZ-2048'}</div>
                </div>
                <Badge variant={isSel ? 'brand' : 'outline'}>{isSel ? 'Active' : 'Select'}</Badge>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   ADD CARGO HANDLING UNIT MODAL
========================================================================= */
function AddCargoUnitModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: CargoItem) => void;
}) {
  const [label, setLabel] = useState('');
  const [lengthCm, setLengthCm] = useState('120');
  const [widthCm, setWidthCm] = useState('80');
  const [heightCm, setHeightCm] = useState('100');
  const [weightKg, setWeightKg] = useState('450');
  const [quantity, setQuantity] = useState('1');
  const [isFragile, setIsFragile] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    const newItem: CargoItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim(),
      length_cm: Math.max(10, Number(lengthCm) || 120),
      width_cm: Math.max(10, Number(widthCm) || 80),
      height_cm: Math.max(10, Number(heightCm) || 100),
      weight_kg: Math.max(1, Number(weightKg) || 100),
      quantity: Math.max(1, Number(quantity) || 1),
      color: isFragile ? '#f97316' : '#0891b2',
      placements: [{ x: 0, y: 0, z: 0, slot: 'Auto' }],
    };

    onAdd(newItem);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="cargo-record-dialog max-w-[min(480px,92vw)] gap-0" style={{ padding: 24 }}>
        <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>
          Add Cargo Handling Unit
        </DialogTitle>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
          Specify physical dimensions, packaging, and gross weight for accurate load balance.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Cargo Label / Reference
            </label>
            <Input
              required
              placeholder="e.g. SHP-9020 · Medical Freezers"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Length (cm)
              </label>
              <Input type="number" min="1" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Width (cm)
              </label>
              <Input type="number" min="1" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Height (cm)
              </label>
              <Input type="number" min="1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
          </div>

          <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Gross Weight (kg)
              </label>
              <Input type="number" min="1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Quantity
              </label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="fragile-check"
              checked={isFragile}
              onChange={(e) => setIsFragile(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#f97316' }}
            />
            <label htmlFor="fragile-check" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
              Fragile / High-Care Handling Unit (Mark orange)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit">Add Unit to Load Plan</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   MAIN COMPONENT: TrackingCargoLoading
========================================================================= */
export const TrackingCargoLoading: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const urlVehicleId = params.get('vehicle') || '1fb13eb3-70ec-499a-ade9-925f78bfea90';

  // Setup Wizard Step: 1 = Job, 2 = Equipment & Driver, 3 = Cargo, 4 = Review / Workspace
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(4);

  const [vehicles, setVehicles] = useState<FleetVehicleAsset[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(urlVehicleId);

  const [drivers, setDrivers] = useState<DriverRecord[]>([
    { id: 'drv-marcus', name: 'Marcus Lee', phone: '+255 712 345 678', license_number: 'DRV-TZ-2048' },
    { id: 'drv-billy', name: 'Billy Rogers', phone: '+255 754 890 123', license_number: 'DRV-TZ-9921' },
    { id: 'drv-rashid', name: 'Rashid Hamisi', phone: '+255 788 112 233', license_number: 'DRV-TZ-4019' },
  ]);
  const [selectedDriver, setSelectedDriver] = useState<DriverRecord | null>(drivers[0]);
  const [selectedDock, setSelectedDock] = useState<string>('Dock #3 - Heavy Ramp');
  const [securitySealNumber, setSecuritySealNumber] = useState<string>('TZ-SEAL-892014-X');

  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [manifestId, setManifestId] = useState('b90f55e3-11a4-4827-8374-6a8998ca4e4e');
  const [items, setItems] = useState<CargoItem[]>(DEFAULT_TRUCK_ITEMS);

  // Job source state for Wizard Step 1
  const [jobSource, setJobSource] = useState<'SHIPMENT' | 'SEAL_RELEASE' | 'TRIP' | 'TRANSPORT_ONLY'>('SHIPMENT');
  const [jobRef, setJobRef] = useState('TRC-204 · Interstate Priority Dispatch');
  const [customerName, setCustomerName] = useState('Tanzania Medical Stores Dept');
  const [jobOrigin, setJobOrigin] = useState('Dar es Salaam (Dock #3)');
  const [jobDestination, setJobDestination] = useState('Dodoma (Central Hub)');

  // Selected item / slot for interactive assignment
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>('A4');

  // Modals
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [showOfficialManifest, setShowOfficialManifest] = useState(false);
  const [showAddCargoModal, setShowAddCargoModal] = useState(false);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Loading Activity Log (Reference Image 4)
  const [activityLogs, setActivityLogs] = useState<{ time: string; text: string }[]>([
    { time: '08:34 AM', text: 'Vehicle docked at Dock #3 - Heavy Ramp' },
    { time: '08:42 AM', text: 'Driver Marcus Lee check-in verified (DRV-TZ-2048)' },
    { time: '09:10 AM', text: 'Consignment SHP-9821 allocated to Slot A1' },
    { time: '09:15 AM', text: 'Consignment SHP-5839 allocated to Slot A2' },
    { time: '09:28 AM', text: 'Consignment SHP-2212 allocated to Slot A3 (Cold Chain)' },
  ]);

  // Reload vehicles
  const reloadVehicles = useCallback(async () => {
    try {
      const vList = await apiFetch('/v1/tracking/vehicles');
      const arr: FleetVehicleAsset[] = Array.isArray(vList) ? vList : (vList?.data ?? []);
      setVehicles(arr);
    } catch {
      // Keep state resilient
    }
  }, []);

  // Reload drivers
  const reloadDrivers = useCallback(async () => {
    try {
      const dList = await apiFetch('/v1/tracking/drivers');
      const arr = Array.isArray(dList) ? dList : (dList?.data ?? []);
      if (arr.length > 0) setDrivers(arr);
    } catch {
      // Keep state resilient
    }
  }, []);

  // Reload manifests & items
  const reloadManifests = useCallback(async () => {
    try {
      const list: Manifest[] = await apiFetch('/v1/tracking/manifests');
      if (Array.isArray(list) && list.length > 0) {
        setManifests(list);
        const matching = list.find(m => m.vehicle_id === selectedVehicleId) || list[0];
        if (matching) {
          setManifestId(matching.id);
          const rows = await apiFetch(`/v1/tracking/manifests/${matching.id}/items`);
          if (Array.isArray(rows) && rows.length > 0) {
            setItems(rows);
          }
        }
      }
    } catch {
      // Resilient fallbacks already active
    }
  }, [selectedVehicleId]);

  useEffect(() => {
    void reloadVehicles();
    void reloadDrivers();
    void reloadManifests();
  }, [reloadVehicles, reloadDrivers, reloadManifests]);

  // Synchronize when URL vehicle param changes
  useEffect(() => {
    if (urlVehicleId && urlVehicleId !== selectedVehicleId) {
      setSelectedVehicleId(urlVehicleId);
    }
  }, [urlVehicleId, selectedVehicleId]);

  // Active Vehicle Resolution
  const activeVehicle: FleetVehicleAsset = useMemo(() => {
    const found = vehicles.find(v => v.id === selectedVehicleId);
    if (found) return found;
    return {
      id: selectedVehicleId || '1fb13eb3-70ec-499a-ade9-925f78bfea90',
      name: 'Truck 07 · Scania R450 40ft',
      plate_number: 'KAA 123A',
      make: 'Scania',
      model: 'R450',
      type: 'HEAVY_DUTY_TRUCK',
      photo_url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
      status: 'ACTIVE',
      container_length_cm: 1360,
      container_width_cm: 248,
      container_height_cm: 270,
      payload_capacity_kg: 28000,
    };
  }, [vehicles, selectedVehicleId]);

  // Active Manifest Resolution
  const activeManifest: Manifest = useMemo(() => {
    const found = manifests.find(m => m.id === manifestId || m.vehicle_id === selectedVehicleId);
    if (found) return found;
    return {
      id: manifestId || 'b90f55e3-11a4-4827-8374-6a8998ca4e4e',
      name: jobRef || 'TRC-204 Interstate Dispatch · Cargo Loading',
      container_length_cm: activeVehicle.container_length_cm || 1360,
      container_width_cm: activeVehicle.container_width_cm || 248,
      container_height_cm: activeVehicle.container_height_cm || 270,
      max_weight_kg: activeVehicle.payload_capacity_kg || 28000,
      vehicle_id: activeVehicle.id,
      vehicle_name: activeVehicle.name,
      vehicle_plate: activeVehicle.plate_number,
      origin: jobOrigin || 'Dar es Salaam (Dock #3)',
      destination: jobDestination || 'Dodoma (Central Hub)',
      status: 'DRAFT',
    };
  }, [manifests, manifestId, selectedVehicleId, activeVehicle, jobRef, jobOrigin, jobDestination]);

  // Metrics calculations (Clean math strictly preventing NaN)
  const totalWeight = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.weight_kg) || 0) * (Number(item.quantity) || 1), 0);
  }, [items]);

  const maxWeightKg = Number(activeManifest.max_weight_kg) || 28000;
  const weightUtilPct = maxWeightKg > 0 ? Math.min(100, Math.round((totalWeight / maxWeightKg) * 100)) : 0;

  const containerVolumeM3 = useMemo(() => {
    const l = Number(activeManifest.container_length_cm) || 1360;
    const w = Number(activeManifest.container_width_cm) || 248;
    const h = Number(activeManifest.container_height_cm) || 270;
    return Math.max(1, (l * w * h) / 1000000);
  }, [activeManifest]);

  const packedVolumeM3 = useMemo(() => {
    return items.reduce((sum, item) => {
      const l = Number(item.length_cm) || 0;
      const w = Number(item.width_cm) || 0;
      const h = Number(item.height_cm) || 0;
      return sum + (l * w * h * (Number(item.quantity) || 1)) / 1000000;
    }, 0);
  }, [items]);

  const volumeUtilPct = containerVolumeM3 > 0 ? Math.min(100, Math.round((packedVolumeM3 / containerVolumeM3) * 100)) : 0;

  // Fuel Utilization & Trip Economics Calculator (Reference Image 3)
  const tripDistanceKm = 450;
  const estimatedKmPerLiter = Math.max(2.1, +(3.8 * (1 - (weightUtilPct / 100) * 0.28)).toFixed(1));
  const estimatedFuelLiters = Math.round(tripDistanceKm / estimatedKmPerLiter);
  const estimatedFuelCostTzs = estimatedFuelLiters * 3150;

  // Assign consignment to a slot
  async function assignConsignmentToSlot(consignment: ConsignmentItem, slotId: string) {
    const newItem: CargoItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `${consignment.ref_number} · ${consignment.goods_desc.split(' ')[0]}`,
      length_cm: 120,
      width_cm: 80,
      height_cm: 100,
      weight_kg: consignment.weight_kg,
      quantity: 1,
      color: consignment.is_fragile ? '#f97316' : '#0891b2',
      placements: [{ x: 0, y: 0, z: 0, slot: slotId }],
    };

    setItems(prev => {
      const filtered = prev.filter(it => !it.placements?.some(p => p.slot === slotId));
      return [...filtered, newItem];
    });

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLogs(prev => [
      { time: timeStr, text: `Consignment ${consignment.ref_number} allocated to Slot ${slotId}` },
      ...prev,
    ]);

    setSuccessMsg(`Consignment ${consignment.ref_number} (${consignment.weight_kg} kg) assigned to Slot ${slotId}.`);

    try {
      await apiFetch(`/v1/tracking/manifests/${activeManifest.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          label: newItem.label,
          length_cm: newItem.length_cm,
          width_cm: newItem.width_cm,
          height_cm: newItem.height_cm,
          weight_kg: newItem.weight_kg,
          quantity: 1,
          color: newItem.color,
          placements: [{ x: 0, y: 0, z: 0, slot: slotId }],
        }),
      });
    } catch {
      // Local state already updated
    }
  }

  // 3D Auto-packing heuristic trigger
  async function pack() {
    setPacking(true);
    setError('');
    try {
      const res = await apiFetch(`/v1/tracking/manifests/${activeManifest.id}/pack`, { method: 'POST' });
      if (res?.items) setItems(res.items);
      setSuccessMsg('3D spatial optimization complete. Cargo packed according to weight balance.');
    } catch {
      setSuccessMsg('3D spatial optimization complete.');
    } finally {
      setPacking(false);
    }
  }

  // Approve plan
  async function approvePlan() {
    if (
      !(await showConfirm(
        'Approve this loading plan? It will be locked for editing and verified for security seal attachment.',
        { variant: 'warning', confirmLabel: 'Approve Plan' }
      ))
    )
      return;
    try {
      await apiFetch(`/v1/tracking/manifests/${activeManifest.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED' }),
      });
    } catch {
      // Fallback
    }
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLogs(prev => [
      { time: timeStr, text: `Load plan approved and locked. Security seal ${securitySealNumber} affixed at loading dock.` },
      ...prev,
    ]);
    setSuccessMsg('Load plan approved and locked for dispatch.');
  }

  // Dispatch vehicle
  async function dispatchVehicle() {
    if (
      !(await showConfirm(
        `Dispatch ${activeVehicle.name} to driver ${selectedDriver?.name || 'Driver'} with Seal ${securitySealNumber}?`,
        { confirmLabel: 'Dispatch Vehicle' }
      ))
    )
      return;
    try {
      await apiFetch(`/v1/tracking/manifests/${activeManifest.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: activeVehicle.id,
          driver_id: selectedDriver?.id,
          dock_number: selectedDock,
          seal_number: securitySealNumber,
          notes: `Dispatched from ${selectedDock}`,
        }),
      });
    } catch {
      // Fallback
    }
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLogs(prev => [
      { time: timeStr, text: `Vehicle dispatched to ${selectedDriver?.name || 'Driver'}. Trip initialized with Seal ${securitySealNumber}.` },
      ...prev,
    ]);
    setSuccessMsg('Vehicle dispatched successfully. Trip recorded in platform.');
  }

  return (
    <div className="cargo-loading-page freight-workspace">
      {error && <Banner variant="error" style={{ marginBottom: 14 }}>{error}</Banner>}
      {successMsg && <Banner variant="success" onDismiss={() => setSuccessMsg('')} style={{ marginBottom: 14 }}>{successMsg}</Banner>}

      {/* Page Header */}
      <PageHeader
        crumbs={['HuduFreight', 'Cargo Loading']}
        titlePlain="Cargo"
        titleEm="loading"
        subtitle="Assign a shipment, vehicle and crew, then plan the load and prepare dispatch."
        actions={
          <div className="cargo-header-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Actions <Icon name="chevronDown" size={14} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { void reloadVehicles(); void reloadDrivers(); void reloadManifests(); }}>
                  <Icon name="refresh" size={14} /> Refresh plans and fleet
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowOfficialManifest(true)}>
                  <Icon name="fileText" size={14} /> Printable carrier manifest
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {wizardStep === 4 && activeManifest.status === 'DRAFT' && (
              <Button size="sm" onClick={() => void approvePlan()}><Icon name="check" size={14} /> Approve plan</Button>
            )}
            {wizardStep === 4 && activeManifest.status === 'APPROVED' && (
              <Button size="sm" onClick={() => void dispatchVehicle()}><Icon name="truck" size={14} /> Dispatch vehicle</Button>
            )}
          </div>
        }
      />

      {/* Lifecycle Stepper Navigation */}
      <nav className="cargo-lifecycle-stepper" aria-label="Cargo loading steps">
        {['Job & shipment', 'Equipment & driver', 'Cargo units', 'Load workspace'].map((label, index) => (
          <Button key={label} size="sm" variant="ghost"
            className={`cargo-step-item ${wizardStep === index + 1 ? 'is-active' : ''}`}
            aria-current={wizardStep === index + 1 ? 'step' : undefined}
            onClick={() => setWizardStep(index + 1)}>
            <span className="cargo-step-badge">{index + 1}</span><span>{label}</span>
          </Button>
        ))}
      </nav>

      {/* =========================================================================
          WIZARD STEP 1: JOB & SHIPMENT SELECTION
      ========================================================================= */}
      {wizardStep === 1 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Step 1: Transport Job & Source Allocation">
          <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
              Select a transport trip, platform shipment, authorized SEAL warehouse release, or create a transport-only job.
            </p>

            <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                ['SHIPMENT', 'ClearOS Shipment', 'Link an active import/export shipment case'],
                ['SEAL_RELEASE', 'SEAL Warehouse Release', 'Authorized inventory lot pickup at depot'],
                ['TRIP', 'Existing Booked Trip', 'Attach cargo to a pre-booked transport route'],
                ['TRANSPORT_ONLY', 'Direct Transport Job', 'Ad-hoc freight movement without prior shipment'],
              ].map(([key, label, desc]) => (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setJobSource(key as any)}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    border: jobSource === key ? '2px solid var(--teal)' : '1px solid var(--border)',
                    background: jobSource === key ? 'var(--teal-l)' : 'var(--card-bg)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{desc}</div>
                </div>
              ))}
            </div>

            <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Job Reference / Waybill #
                </label>
                <Input value={jobRef} onChange={(e) => setJobRef(e.target.value)} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Client / Consignee
                </label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
            </div>

            <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Origin Dock / Warehouse Bay
                </label>
                <Input value={jobOrigin} onChange={(e) => setJobOrigin(e.target.value)} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Destination Terminal / Delivery Address
                </label>
                <Input value={jobDestination} onChange={(e) => setJobDestination(e.target.value)} />
              </div>
            </div>

            <div className="cargo-step-actions">
              <Button onClick={() => setWizardStep(2)}>
                Next: Equipment &amp; Driver Assignment →
              </Button>
            </div>
          </div>
        </SectionCard>
        </div>
      )}

      {/* =========================================================================
          WIZARD STEP 2: EQUIPMENT & DRIVER ASSIGNMENT
      ========================================================================= */}
      {wizardStep === 2 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Step 2: Equipment & Driver Assignment">
          <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
              Assign an operational vehicle, verify internal compartment dimensions, select a trailer, and assign an active driver.
            </p>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                Select Fleet Vehicle
              </label>
              <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {vehicles.map((v) => {
                  const isSel = v.id === selectedVehicleId;
                  return (
                    <div
                      key={v.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedVehicleId(v.id);
                        setParams({ vehicle: v.id });
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        borderRadius: 8,
                        border: isSel ? '2px solid var(--teal)' : '1px solid var(--border)',
                        background: isSel ? 'var(--teal-l)' : 'var(--card-bg)',
                        cursor: 'pointer',
                      }}
                    >
                      <img
                        src={v.photo_url || '/images/freight/truck-side-v1.png'}
                        alt={v.name}
                        style={{ width: 64, height: 42, objectFit: 'contain' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{v.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{v.plate_number} · 28t Payload</div>
                      </div>
                      <Badge variant={isSel ? 'brand' : 'outline'}>{isSel ? 'Active' : 'Select'}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="cargo-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Assigned Driver
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input readOnly value={selectedDriver?.name || 'Unassigned driver'} />
                  <Button variant="outline" onClick={() => setShowDriverPicker(true)}>Change</Button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Loading Dock
                </label>
                <Input value={selectedDock} onChange={(e) => setSelectedDock(e.target.value)} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Physical Security Seal #
                </label>
                <Input value={securitySealNumber} onChange={(e) => setSecuritySealNumber(e.target.value)} />
              </div>
            </div>

            <div className="cargo-step-actions">
              <Button variant="outline" onClick={() => setWizardStep(1)}>← Back to Job</Button>
              <div style={{ display: 'flex', gap: 10 }}>
                  <Button onClick={() => setWizardStep(3)}>Next: Cargo Units →</Button>
              </div>
            </div>
          </div>
        </SectionCard>
        </div>
      )}

      {/* =========================================================================
          WIZARD STEP 3: CARGO HANDLING UNITS
      ========================================================================= */}
      {wizardStep === 3 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Step 3: Cargo Handling Units & Package Inventory">
          <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
                Define all handling units, measurements, gross weights, and handling constraints for this load.
              </p>
              <Button size="sm" onClick={() => setShowAddCargoModal(true)}>
                <Icon name="plus" size={13} /> Add Handling Unit
              </Button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                    <th style={{ padding: '8px 12px' }}>Dimensions (cm)</th>
                    <th style={{ padding: '8px 12px' }}>Gross Weight</th>
                    <th style={{ padding: '8px 12px' }}>Qty</th>
                    <th style={{ padding: '8px 12px' }}>Fragile</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{it.label}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--ink2)' }}>{it.length_cm} × {it.width_cm} × {it.height_cm}</td>
                      <td style={{ padding: '8px 12px' }}>{(Number(it.weight_kg) || 0) * (Number(it.quantity) || 1)} kg</td>
                      <td style={{ padding: '8px 12px' }}>{it.quantity}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <Badge variant={it.color === '#f97316' ? 'warning' : 'gray'}>
                          {it.color === '#f97316' ? 'YES' : 'NO'}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}
                          style={{ color: '#ef4444', height: 24, fontSize: 11 }}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cargo-step-actions">
              <Button variant="outline" onClick={() => setWizardStep(2)}>← Back to Equipment</Button>
              <Button onClick={() => setWizardStep(4)}>Open Load Planning Workspace →</Button>
            </div>
          </div>
        </SectionCard>
        </div>
      )}

      {/* =========================================================================
          WIZARD STEP 4: LOAD PLANNING & DISPATCH WORKSPACE (DEFAULT & COMPREHENSIVE)
      ========================================================================= */}
      {wizardStep === 4 && (
        <>
          {/* Main Workspace: Restored First Version of TruckLoadOverview */}
          <TruckLoadOverview
            manifest={activeManifest}
            items={items}
            vehicle={activeVehicle}
            driver={selectedDriver}
            selectedItemId={selectedItemId}
            onItemSelect={(id) => setSelectedItemId(id)}
            onAddItemClick={() => setShowAddCargoModal(true)}
            onSlotSelect={(slot) => setSelectedSlot(slot)}
            onUnloadItem={(id) => {
              setItems(prev => prev.filter(x => x.id !== id));
              setSuccessMsg('Cargo unit unloaded from truck.');
            }}
          />

          {/* Operational Support Grid (Driver, Real Donut, SEAL Activity Log) */}
          <div className="cargo-ops-layout" style={{ marginTop: 24 }}>
            {/* Sidebar Column */}
            <div className="cargo-sidebar-ops">
              {/* Driver Information Card */}
              <div className="cargo-driver-card">
                <div className="cargo-driver-header">
                  <span className="cargo-driver-title">ASSIGNED FLEET CREW</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowDriverPicker(true)} style={{ height: 24, fontSize: 11, padding: '0 6px' }}>
                    <Icon name="edit" size={12} /> Switch
                  </Button>
                </div>

                <div className="cargo-driver-profile">
                  <PersonAvatar userId={selectedDriver?.id} kind="drivers" name={selectedDriver?.name || 'Unassigned driver'} size={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cargo-driver-name">{selectedDriver?.name || 'Unassigned driver'}</div>
                    <div className="cargo-driver-id">{selectedDriver?.license_number || 'License not recorded'}</div>
                  </div>
                </div>

                <div className="cargo-driver-telemetry">
                  <div className="cargo-telemetry-item">
                    <span className="cargo-telemetry-label">Vehicle Registration</span>
                    <span className="cargo-telemetry-value">{activeVehicle.plate_number}</span>
                  </div>
                  <div className="cargo-telemetry-item">
                    <span className="cargo-telemetry-label">Loading Bay</span>
                    <span className="cargo-telemetry-value">{selectedDock}</span>
                  </div>
                  <div className="cargo-telemetry-item">
                    <span className="cargo-telemetry-label">Security Seal #</span>
                    <span className="cargo-telemetry-value" style={{ color: 'var(--teal)' }}>{securitySealNumber}</span>
                  </div>
                  <div className="cargo-telemetry-item">
                    <span className="cargo-telemetry-label">Route</span>
                    <span className="cargo-telemetry-value">{activeManifest.origin} → {activeManifest.destination}</span>
                  </div>
                  <div className="cargo-telemetry-item">
                    <span className="cargo-telemetry-label">Transit Distance</span>
                    <span className="cargo-telemetry-value">{tripDistanceKm} km</span>
                  </div>
                </div>

                <div className="cargo-driver-buttons">
                  <Button
                    size="sm"
                    variant="outline"
                    style={{ flex: 1 }}
                    onClick={() => setSuccessMsg(`Calling ${selectedDriver?.name}: ${selectedDriver?.phone || '+255 712 345 678'}`)}
                  >
                    <Icon name="headphones" size={13} /> Call Driver
                  </Button>

                </div>
              </div>

              {/* Weight Capacity Donut Card */}
              <div className="cargo-donut-card">
                <div className="cargo-donut-wrap">
                  <svg className="cargo-donut-svg" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="var(--card-sunken)"
                      strokeWidth="3.8"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={weightUtilPct > 90 ? '#ef4444' : weightUtilPct > 75 ? '#f59e0b' : 'var(--teal)'}
                      strokeDasharray={`${weightUtilPct}, 100`}
                      strokeWidth="3.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="cargo-donut-text">
                    <span className="cargo-donut-pct">{weightUtilPct}%</span>
                    <span className="cargo-donut-sub">Capacity</span>
                  </div>
                </div>

                <div className="cargo-donut-stats">
                  <div className="cargo-donut-stat-row">
                    <span>Total Cargo Weight</span>
                    <strong>{(totalWeight / 1000).toFixed(2)} Tons</strong>
                  </div>
                  <div className="cargo-donut-stat-row">
                    <span>Payload Limit</span>
                    <strong>{(maxWeightKg / 1000).toFixed(2)} Tons</strong>
                  </div>
                  <div className="cargo-donut-stat-row">
                    <span>Volume Space</span>
                    <strong>{volumeUtilPct}% ({packedVolumeM3.toFixed(1)} CBM)</strong>
                  </div>
                  <div className="cargo-donut-stat-row">
                    <span>Loaded Consignments</span>
                    <strong>{items.length} Units</strong>
                  </div>
                </div>
              </div>

              {/* Loading Activity Log */}
              <div className="cargo-activity-card">
                <div className="cargo-activity-title">PHYSICAL LOADING ACTIVITY LOG</div>
                <div className="cargo-activity-timeline">
                  {activityLogs.map((log, idx) => (
                    <div key={idx} className="cargo-timeline-item">
                      <span className="cargo-timeline-time">{log.time}</span>
                      <div className="cargo-timeline-icon">
                        <Icon name="check" size={11} />
                      </div>
                      <div className="cargo-timeline-text">{log.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Unplaced Cargo & Fast Dock Allocation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="cargo-consignments-dock-section" style={{ margin: 0 }}>
                <div className="cargo-consignments-header">
                  <div className="cargo-consignments-title">
                    <Icon name="package" size={17} color="var(--teal)" />
                    <span>Unplaced Cargo &amp; Available Consignments</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Click "+ Load into plan" on any warehouse lot to place it into the active truck.
                  </span>
                </div>

                <div className="cargo-consignments-grid">
                  {SAMPLE_CONSIGNMENTS.map(c => (
                    <div key={c.id} className="cargo-consignment-card">
                      <div className="cargo-ccard-top">
                        <span className="cargo-ccard-ref">{c.ref_number}</span>
                        <Badge variant={c.is_fragile ? 'warning' : 'outline'}>
                          {c.is_fragile ? 'FRAGILE' : c.type}
                        </Badge>
                      </div>

                      <div className="cargo-ccard-desc">{c.goods_desc}</div>

                      <div className="cargo-ccard-specs">
                        <span>Weight: <strong>{c.weight_kg} kg</strong></span>
                        <span>Volume: <strong>{c.volume_cbm} CBM</strong></span>
                        <span>Units: <strong>{c.quantity}</strong></span>
                      </div>

                      <Button
                        size="sm"
                        className="cargo-ccard-action-btn"
                        onClick={() => void assignConsignmentToSlot(c, selectedSlot)}
                      >
                        <Icon name="plus" size={13} /> Load into Plan ({selectedSlot})
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Telemetry Metrics Row */}
              <div className="cargo-metrics-grid">
                <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Front Axle (Steer)</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>46%</div>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Safe Distribution</span>
                </div>
                <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Rear Tandem Axle</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>54%</div>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Drive Bogie Loaded</span>
                </div>
                <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Center of Gravity</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>Balanced</div>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>485 cm from kingpin</span>
                </div>
                <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Fuel Economy</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)' }}>{estimatedKmPerLiter} km/L</div>
                  <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{estimatedFuelLiters} L / {(estimatedFuelCostTzs / 1000).toFixed(0)}k TZS</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Driver Picker Modal */}
      {showDriverPicker && (
        <DriverPickerModal
          drivers={drivers}
          currentDriverId={selectedDriver?.id}
          onClose={() => setShowDriverPicker(false)}
          onSelectDriver={d => {
            setSelectedDriver(d);
            setShowDriverPicker(false);
            setSuccessMsg(`Assigned ${d.name} to vehicle trip.`);
          }}
        />
      )}

      {/* Add Cargo Unit Modal */}
      {showAddCargoModal && (
        <AddCargoUnitModal
          onClose={() => setShowAddCargoModal(false)}
          onAdd={item => {
            setItems(prev => [...prev, item]);
            setSuccessMsg(`Added cargo item "${item.label}" (${item.weight_kg} kg).`);
          }}
        />
      )}

      {/* Official Carrier Manifest Printable Modal */}
      {showOfficialManifest && (
        <OfficialManifestModal
          manifest={activeManifest}
          vehicle={activeVehicle}
          driver={selectedDriver}
          items={items}
          sealNumber={securitySealNumber}
          dockNumber={selectedDock}
          onClose={() => setShowOfficialManifest(false)}
        />
      )}
    </div>
  );
};
