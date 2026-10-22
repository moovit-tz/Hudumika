import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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

export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface Manifest {
  id: string;
  name: string;
  status: 'DRAFT' | 'PLANNED' | 'APPROVED' | 'LOADING' | 'LOADED' | 'DISPATCHED' | 'DELIVERED';
  stage?: 'JOB_SELECTION' | 'EQUIPMENT_ASSIGNMENT' | 'CARGO_CONFIRMATION' | 'LOAD_PLANNING' | 'LOAD_VERIFICATION' | 'DISPATCH';
  job_type?: string | null;
  shipment_id?: string | null;
  booking_id?: string | null;
  release_doc_id?: string | null;
  vehicle_id?: string | null;
  trailer_id?: string | null;
  location_id?: string | null;
  loading_bay?: string | null;
  dock_number?: string | null;
  seal_number?: string | null;
  secondary_seal_number?: string | null;
  planner_name?: string | null;
  loader_name?: string | null;
  checker_name?: string | null;
  dispatcher_name?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  loading_started_at?: string | null;
  loading_completed_at?: string | null;
  dispatched_at?: string | null;
  exceptions_acknowledged?: boolean;
  discrepancy_notes?: string | null;
  damage_notes?: string | null;
  verification_checklist?: Record<string, boolean>;
  origin?: string | null;
  destination?: string | null;
  container_length_cm: number;
  container_width_cm: number;
  container_height_cm: number;
  max_weight_kg: number;
  trip_id?: string | null;
  vehicle_name?: string | null;
  vehicle_plate?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_photo_url?: string | null;
  trailer_name?: string | null;
  trailer_plate?: string | null;
  trailer_type?: string | null;
  location_name?: string | null;
  location_code?: string | null;
  shipment_ref?: string | null;
  booking_ref?: string | null;
  release_ref?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_license?: string | null;
  created_at?: string;
}

export interface CargoItem {
  id: string;
  manifest_id?: string;
  label: string;
  unit_type?: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  quantity: number;
  loaded_quantity?: number;
  damaged_quantity?: number;
  damage_description?: string | null;
  stacking_max?: number;
  is_fragile?: boolean;
  handling_instructions?: string | null;
  source_ref?: string | null;
  color?: string | null;
  placements?: { x: number; y: number; z: number; slot?: string }[];
}

export interface FleetVehicleAsset {
  id: string;
  name: string;
  plate_number?: string | null;
  make?: string | null;
  model?: string | null;
  type?: string | null;
  photo_url?: string | null;
  status?: string | null;
  dimensions?: string | null;
  container_length_cm?: number;
  container_width_cm?: number;
  container_height_cm?: number;
  payload_capacity_kg?: number;
}

export interface TrailerAsset {
  id: string;
  name: string;
  registration_number?: string | null;
  trailer_type?: string | null;
  capacity_kg?: number | null;
  axles?: number | null;
  status?: string | null;
}

export interface DriverRecord {
  id: string;
  name: string;
  phone?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  status?: string | null;
  photo_url?: string | null;
  assigned_vehicle_id?: string | null;
}

export interface WarehouseLocationAsset {
  id: string;
  code: string;
  name: string;
  zone?: string | null;
  capacity_units?: number | null;
  active?: boolean;
}

export interface ShipmentJob {
  id: string;
  ref_number: string;
  goods_desc: string;
  gross_weight_kg?: number | null;
  origin_port?: string | null;
  dest_port?: string | null;
  containers?: any;
  stage?: string | null;
  created_at?: string;
}

export interface BookingJob {
  id: string;
  booking_number: string;
  cargo_desc: string;
  quantity?: number | null;
  origin_port?: string | null;
  destination_port?: string | null;
  mode?: string | null;
  status?: string | null;
  created_at?: string;
}

export interface ReleaseJob {
  id: string;
  doc_number: string;
  doc_type: string;
  customer_name?: string | null;
  carrier_name?: string | null;
  delivery_address?: string | null;
  containers?: any;
  status?: string | null;
  valid_until?: string | null;
  created_at?: string;
}

/* =========================================================================
   OFFICIAL MANIFEST & LOADING SHEET MODAL (PRINTABLE)
========================================================================= */
function OfficialManifestModal({
  manifest,
  vehicle,
  trailer,
  driver,
  items,
  sealNumber,
  secondarySeal,
  dockNumber,
  onClose,
}: {
  manifest: Manifest;
  vehicle?: FleetVehicleAsset | null;
  trailer?: TrailerAsset | null;
  driver?: DriverRecord | null;
  items: CargoItem[];
  sealNumber: string;
  secondarySeal?: string;
  dockNumber: string;
  onClose: () => void;
}) {
  const totalWeight = items.reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.quantity) || 1), 0);
  const totalLoadedWeight = items.reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.loaded_quantity ?? it.quantity) || 0), 0);
  const totalVolume = items.reduce(
    (sum, it) => sum + ((Number(it.length_cm) || 0) * (Number(it.width_cm) || 0) * (Number(it.height_cm) || 0) * (Number(it.quantity) || 1)) / 1000000,
    0
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="cargo-record-dialog max-w-[min(900px,96vw)] max-h-[90vh] overflow-y-auto gap-0" style={{ padding: 0 }}>
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
              <Badge variant={manifest.status === 'DISPATCHED' ? 'success' : manifest.status === 'LOADED' ? 'brand' : 'outline'} style={{ marginTop: 4 }}>
                {manifest.status}
              </Badge>
            </div>
          </div>

          <div className="cargo-manifest-meta-grid">
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fleet Vehicle &amp; Trailer</span>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{vehicle?.name || manifest.vehicle_name || 'Fleet Truck'}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>Plate: {vehicle?.plate_number || manifest.vehicle_plate || '—'}</div>
              {trailer && <div style={{ color: '#475569', fontSize: 11 }}>Trailer: {trailer.name} ({trailer.registration_number})</div>}
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Assigned Driver</span>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{driver?.name || manifest.driver_name || 'Assigned Driver'}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>License: {driver?.license_number || manifest.driver_license || '—'}</div>
              <div style={{ color: '#475569', fontSize: 11 }}>Contact: {driver?.phone || manifest.driver_phone || '—'}</div>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Loading Point &amp; Security Seals</span>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0891b2' }}>Primary: {sealNumber || 'NOT RECORDED'}</div>
              {secondarySeal && <div style={{ color: '#0891b2', fontSize: 11, fontWeight: 700 }}>Sec: {secondarySeal}</div>}
              <div style={{ color: '#475569', fontSize: 11 }}>Location/Dock: {dockNumber || manifest.loading_bay || 'Dock #1'}</div>
            </div>
          </div>

          <div style={{ margin: '14px 0' }}>
            <table className="cargo-manifest-table">
              <thead>
                <tr>
                  <th>Unit Type</th>
                  <th>Cargo Item Description</th>
                  <th>Dimensions (cm)</th>
                  <th>Unit Mass</th>
                  <th>Planned</th>
                  <th>Loaded</th>
                  <th>Damaged</th>
                  <th>Total Mass</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td><Badge variant="outline">{it.unit_type || 'PALLET'}</Badge></td>
                    <td style={{ fontWeight: 700 }}>{it.label}</td>
                    <td>{it.length_cm} × {it.width_cm} × {it.height_cm}</td>
                    <td>{it.weight_kg} kg</td>
                    <td>{it.quantity}</td>
                    <td style={{ fontWeight: 700, color: (it.loaded_quantity ?? it.quantity) < it.quantity ? 'var(--amber)' : 'inherit' }}>
                      {it.loaded_quantity ?? it.quantity}
                    </td>
                    <td style={{ color: (it.damaged_quantity ?? 0) > 0 ? 'var(--red)' : 'inherit' }}>
                      {it.damaged_quantity ?? 0}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {(((Number(it.weight_kg) || 0) * Number(it.loaded_quantity ?? it.quantity))).toLocaleString()} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 6, fontSize: 12, border: '1px solid #e2e8f0' }}>
            <div>
              Total Planned Weight: <strong>{totalWeight.toLocaleString()} kg</strong>
            </div>
            <div>
              Total Loaded Weight: <strong>{totalLoadedWeight.toLocaleString()} kg</strong> ({Math.round((totalLoadedWeight / (Number(manifest.max_weight_kg) || 28000)) * 100)}% payload)
            </div>
            <div>
              Total Volume: <strong>{totalVolume.toFixed(2)} CBM</strong>
            </div>
            <div>
              Loader: <strong>{manifest.loader_name || 'Loading Bay Crew'}</strong>
            </div>
            <div>
              Supervisor / Checker: <strong>{manifest.checker_name || 'Dock Supervisor'}</strong>
            </div>
          </div>

          {manifest.discrepancy_notes && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, fontSize: 11.5 }}>
              <strong>Discrepancy Notes:</strong> {manifest.discrepancy_notes}
            </div>
          )}

          <div className="cargo-manifest-signatures">
            <div className="cargo-manifest-sign-box">
              <span>Driver Acceptance of Safe Load &amp; Seal Verification</span>
              <div className="cargo-manifest-sign-line" />
              <span>Signature: _______________________ Date: ___________</span>
            </div>
            <div className="cargo-manifest-sign-box">
              <span>Dock Supervisor / Dispatch Seal Authorization</span>
              <div className="cargo-manifest-sign-line" />
              <span>Signature: _______________________ Date: ___________</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }} className="no-print">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => window.print()}>
              <Icon name="copy" size={14} /> Print Official Manifest (PDF)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
   ADD / EDIT CARGO HANDLING UNIT MODAL
========================================================================= */
function CargoUnitDialog({
  initialItem,
  onClose,
  onSave,
}: {
  initialItem?: CargoItem | null;
  onClose: () => void;
  onSave: (item: Partial<CargoItem>) => void;
}) {
  const [label, setLabel] = useState(initialItem?.label || '');
  const [unitType, setUnitType] = useState(initialItem?.unit_type || 'PALLET');
  const [lengthCm, setLengthCm] = useState(String(initialItem?.length_cm || 120));
  const [widthCm, setWidthCm] = useState(String(initialItem?.width_cm || 80));
  const [heightCm, setHeightCm] = useState(String(initialItem?.height_cm || 100));
  const [weightKg, setWeightKg] = useState(String(initialItem?.weight_kg || 450));
  const [quantity, setQuantity] = useState(String(initialItem?.quantity || 1));
  const [stackingMax, setStackingMax] = useState(String(initialItem?.stacking_max || 2));
  const [isFragile, setIsFragile] = useState(Boolean(initialItem?.is_fragile));
  const [handlingInstructions, setHandlingInstructions] = useState(initialItem?.handling_instructions || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    onSave({
      label: label.trim(),
      unit_type: unitType,
      length_cm: Math.max(10, Number(lengthCm) || 120),
      width_cm: Math.max(10, Number(widthCm) || 80),
      height_cm: Math.max(10, Number(heightCm) || 100),
      weight_kg: Math.max(1, Number(weightKg) || 100),
      quantity: Math.max(1, Number(quantity) || 1),
      stacking_max: Math.max(1, Number(stackingMax) || 2),
      is_fragile: isFragile,
      handling_instructions: handlingInstructions.trim() || undefined,
      color: isFragile ? '#f97316' : unitType === 'CRATE' ? '#8b5cf6' : unitType === 'CARTON' ? '#eab308' : '#0891b2',
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="cargo-record-dialog max-w-[min(520px,94vw)] gap-0" style={{ padding: 24 }}>
        <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>
          {initialItem ? 'Edit Handling Unit' : 'Add Handling Unit'}
        </DialogTitle>
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
          Enter handling unit measurements, packaging type, gross weight, and handling restrictions.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Unit Description / Reference
            </label>
            <Input
              required
              placeholder="e.g. Pallet #4 · Industrial Motors"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Unit Type
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              >
                <option value="PALLET">Standard Pallet (120×80)</option>
                <option value="CRATE">Wooden Crate</option>
                <option value="CARTON">Corrugated Carton</option>
                <option value="DRUM">Steel/Poly Drum</option>
                <option value="LOOSE">Loose / Irregular</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Quantity
              </label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Gross Weight per Unit (kg)
              </label>
              <Input type="number" min="1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                Max Stacking Limit
              </label>
              <Input type="number" min="1" max="5" value={stackingMax} onChange={(e) => setStackingMax(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Handling Instructions (Optional)
            </label>
            <Input
              placeholder="e.g. Keep upright, do not clamp, fork from wide side"
              value={handlingInstructions}
              onChange={(e) => setHandlingInstructions(e.target.value)}
            />
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
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Handling Unit</Button>
          </div>
        </form>
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
      <DialogContent className="cargo-record-dialog max-w-[min(500px,94vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Select Fleet Driver</DialogTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
          {drivers.map(d => {
            const isSel = d.id === currentDriverId;
            const isExpired = d.license_expiry && new Date(d.license_expiry) < new Date();
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
                    width: 38,
                    height: 38,
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
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {d.phone || '+255 700 000 000'} · Lic: {d.license_number || 'DRV-RECORD'}
                  </div>
                  {isExpired && (
                    <div style={{ fontSize: 10.5, color: 'var(--red)', fontWeight: 700 }}>
                      ⚠ License expired ({d.license_expiry})
                    </div>
                  )}
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
   MAIN COMPONENT: TrackingCargoLoading
========================================================================= */
export const TrackingCargoLoading: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const urlVehicleId = params.get('vehicle');
  const urlManifestId = params.get('manifest');

  // 6 Stages:
  // 1 = Select a job
  // 2 = Assign equipment and crew
  // 3 = Confirm cargo
  // 4 = Plan the load (2D/3D)
  // 5 = Load and verify
  // 6 = Dispatch
  const [stage, setStage] = useState<StageNumber>(1);

  // Manifests & current active manifest
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [manifestId, setManifestId] = useState<string>(urlManifestId || '');
  const [items, setItems] = useState<CargoItem[]>([]);

  // Real Job Sources from DB
  const [shipments, setShipments] = useState<ShipmentJob[]>([]);
  const [bookings, setBookings] = useState<BookingJob[]>([]);
  const [releases, setReleases] = useState<ReleaseJob[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState<'ALL' | 'SHIPMENT' | 'BOOKING' | 'RELEASE'>('ALL');

  // Real Equipment & Crew from DB
  const [vehicles, setVehicles] = useState<FleetVehicleAsset[]>([]);
  const [trailers, setTrailers] = useState<TrailerAsset[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationAsset[]>([]);

  // Selected Equipment / Manifest config
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(urlVehicleId || '');
  const [selectedTrailerId, setSelectedTrailerId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [dockNumber, setDockNumber] = useState('Dock #1 - High Bay');
  const [primarySeal, setPrimarySeal] = useState('');
  const [secondarySeal, setSecondarySeal] = useState('');

  // Selected Job metadata
  const [selectedJobType, setSelectedJobType] = useState<string>('SHIPMENT');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobRef, setJobRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [originText, setOriginText] = useState('Dar Port Terminal');
  const [destinationText, setDestinationText] = useState('Dodoma Logistics Center');

  // Stage 5 Physical Verification State
  const [loaderName, setLoaderName] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [exceptionsAcknowledged, setExceptionsAcknowledged] = useState(false);
  const [verificationChecklist, setVerificationChecklist] = useState<Record<string, boolean>>({
    countMatched: false,
    packagingSound: false,
    heavyOnBase: false,
    cargoBraced: false,
    doorsSealed: false,
  });

  // Stage 6 Pre-departure Checklist
  const [dispatchChecklist, setDispatchChecklist] = useState<Record<string, boolean>>({
    driverBriefed: true,
    sealsVerified: true,
    manifestIssued: true,
    roadworthyChecked: true,
  });

  // UI state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [showOfficialManifest, setShowOfficialManifest] = useState(false);
  const [editingItem, setEditingItem] = useState<CargoItem | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [packing, setPacking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch Jobs & Equipment from API
  const loadJobsAndEquipment = useCallback(async () => {
    try {
      const [jobsData, equipData] = await Promise.all([
        apiFetch('/v1/tracking/manifests/jobs'),
        apiFetch('/v1/tracking/manifests/equipment'),
      ]);

      if (jobsData) {
        setShipments(jobsData.shipments || []);
        setBookings(jobsData.bookings || []);
        setReleases(jobsData.releases || []);
      }
      if (equipData) {
        setVehicles(equipData.vehicles || []);
        setTrailers(equipData.trailers || []);
        setDrivers(equipData.drivers || []);
        setLocations(equipData.locations || []);

        if (equipData.vehicles?.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(equipData.vehicles[0].id);
        }
        if (equipData.drivers?.length > 0 && !selectedDriverId) {
          setSelectedDriverId(equipData.drivers[0].id);
        }
        if (equipData.locations?.length > 0 && !selectedLocationId) {
          setSelectedLocationId(equipData.locations[0].id);
        }
      }
    } catch (e: any) {
      console.warn('Could not load jobs or equipment', e);
    }
  }, [selectedVehicleId, selectedDriverId, selectedLocationId]);

  // Load Manifests
  const loadManifests = useCallback(async () => {
    try {
      const list: Manifest[] = await apiFetch('/v1/tracking/manifests');
      if (Array.isArray(list) && list.length > 0) {
        setManifests(list);
        const target = (manifestId && list.find(m => m.id === manifestId)) ||
          (urlVehicleId && list.find(m => m.vehicle_id === urlVehicleId)) ||
          list[0];

        if (target) {
          setManifestId(target.id);
          applyManifestToState(target);
          const rows = await apiFetch(`/v1/tracking/manifests/${target.id}/items`);
          if (Array.isArray(rows)) setItems(rows);
        }
      }
    } catch {
      // Keep resilient
    }
  }, [manifestId, urlVehicleId]);

  function applyManifestToState(m: Manifest) {
    if (m.vehicle_id) setSelectedVehicleId(m.vehicle_id);
    if (m.trailer_id) setSelectedTrailerId(m.trailer_id);
    if (m.driver_id) setSelectedDriverId(m.driver_id);
    if (m.location_id) setSelectedLocationId(m.location_id);
    if (m.loading_bay || m.dock_number) setDockNumber(m.loading_bay || m.dock_number || 'Dock #1');
    if (m.seal_number) setPrimarySeal(m.seal_number);
    if (m.secondary_seal_number) setSecondarySeal(m.secondary_seal_number);
    if (m.origin) setOriginText(m.origin);
    if (m.destination) setDestinationText(m.destination);
    if (m.name) setJobRef(m.name);
    if (m.loader_name) setLoaderName(m.loader_name);
    if (m.checker_name) setCheckerName(m.checker_name);
    if (m.discrepancy_notes) setDiscrepancyNotes(m.discrepancy_notes);
    if (m.damage_notes) setDamageNotes(m.damage_notes);
    if (m.exceptions_acknowledged) setExceptionsAcknowledged(m.exceptions_acknowledged);
    if (m.verification_checklist) setVerificationChecklist(m.verification_checklist);

    // Map manifest stage to stage number
    if (m.stage === 'DISPATCH') setStage(6);
    else if (m.stage === 'LOAD_VERIFICATION') setStage(5);
    else if (m.stage === 'LOAD_PLANNING') setStage(4);
    else if (m.stage === 'CARGO_CONFIRMATION') setStage(3);
    else if (m.stage === 'EQUIPMENT_ASSIGNMENT') setStage(2);
    else setStage(1);
  }

  useEffect(() => {
    void loadJobsAndEquipment();
    void loadManifests();
  }, [loadJobsAndEquipment, loadManifests]);

  // Active Vehicle, Trailer, Driver resolution
  const activeVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId) || null;
  }, [vehicles, selectedVehicleId]);

  const activeTrailer = useMemo(() => {
    return trailers.find(t => t.id === selectedTrailerId) || null;
  }, [trailers, selectedTrailerId]);

  const activeDriver = useMemo(() => {
    return drivers.find(d => d.id === selectedDriverId) || null;
  }, [drivers, selectedDriverId]);

  const activeLocation = useMemo(() => {
    return locations.find(l => l.id === selectedLocationId) || null;
  }, [locations, selectedLocationId]);

  const activeManifest: Manifest = useMemo(() => {
    const existing = manifests.find(m => m.id === manifestId);
    if (existing) return existing;

    return {
      id: manifestId || 'draft-manifest',
      name: jobRef || 'Transport Load Plan',
      status: 'DRAFT',
      stage: 'JOB_SELECTION',
      container_length_cm: 1360,
      container_width_cm: 248,
      container_height_cm: 270,
      max_weight_kg: 28000,
      origin: originText,
      destination: destinationText,
      vehicle_id: selectedVehicleId || null,
      trailer_id: selectedTrailerId || null,
      dock_number: dockNumber,
      seal_number: primarySeal,
    };
  }, [manifests, manifestId, jobRef, originText, destinationText, selectedVehicleId, selectedTrailerId, dockNumber, primarySeal]);

  // Metrics
  const totalPlannedWeight = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.quantity) || 1), 0);
  }, [items]);

  const totalLoadedWeight = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.loaded_quantity ?? it.quantity) || 0), 0);
  }, [items]);

  const containerLength = activeManifest.container_length_cm || 1360;
  const containerWidth = activeManifest.container_width_cm || 248;
  const containerHeight = activeManifest.container_height_cm || 270;
  const maxPayloadKg = activeManifest.max_weight_kg || 28000;

  const containerVolumeM3 = Math.max(1, (containerLength * containerWidth * containerHeight) / 1000000);
  const totalVolumeM3 = useMemo(() => {
    return items.reduce((sum, it) => {
      const l = Number(it.length_cm) || 0;
      const w = Number(it.width_cm) || 0;
      const h = Number(it.height_cm) || 0;
      return sum + (l * w * h * (Number(it.quantity) || 1)) / 1000000;
    }, 0);
  }, [items]);

  const weightUtilPct = maxPayloadKg > 0 ? Math.round((totalPlannedWeight / maxPayloadKg) * 100) : 0;
  const volumeUtilPct = containerVolumeM3 > 0 ? Math.round((totalVolumeM3 / containerVolumeM3) * 100) : 0;

  // Real Geometric Load Centroid (calculating real centroid from placed items)
  const geometricCentroidPct = useMemo(() => {
    let weightedXSum = 0;
    let totalMass = 0;
    items.forEach(it => {
      const mass = (Number(it.weight_kg) || 0) * (it.quantity || 1);
      const placements = it.placements || [];
      if (placements.length > 0) {
        placements.forEach(p => {
          weightedXSum += (p.x || 0) * (mass / placements.length);
          totalMass += mass / placements.length;
        });
      } else {
        // Fallback default mid-deck
        weightedXSum += (containerLength / 2) * mass;
        totalMass += mass;
      }
    });
    if (totalMass === 0 || containerLength === 0) return 50;
    const avgX = weightedXSum / totalMass;
    return Math.round((avgX / containerLength) * 100);
  }, [items, containerLength]);

  // Live Discrepancy detector for Stage 5
  const hasDiscrepancies = useMemo(() => {
    return items.some(it => (Number(it.loaded_quantity ?? it.quantity) < it.quantity) || (Number(it.damaged_quantity || 0) > 0));
  }, [items]);

  // Save / Update Manifest
  async function persistManifest(updates: Partial<Manifest>) {
    setSaving(true);
    setError('');
    try {
      if (manifestId && manifestId !== 'draft-manifest') {
        const updated = await apiFetch(`/v1/tracking/manifests/${manifestId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        setManifests(prev => prev.map(m => m.id === manifestId ? { ...m, ...updated } : m));
      } else {
        const created = await apiFetch('/v1/tracking/manifests', {
          method: 'POST',
          body: JSON.stringify({
            name: updates.name || jobRef || 'Transport Load Plan',
            vehicle_id: selectedVehicleId || undefined,
            trailer_id: selectedTrailerId || undefined,
            location_id: selectedLocationId || undefined,
            loading_bay: dockNumber,
            origin: originText,
            destination: destinationText,
            container_length_cm: containerLength,
            container_width_cm: containerWidth,
            container_height_cm: containerHeight,
            max_weight_kg: maxPayloadKg,
            ...updates,
          }),
        });
        setManifestId(created.id);
        setManifests(prev => [created, ...prev]);
        setParams({ manifest: created.id });
      }
      setSuccessMsg('Manifest state updated.');
    } catch (e: any) {
      setError(e.message || 'Could not update manifest.');
    } finally {
      setSaving(false);
    }
  }

  // 1. Select a Job Action
  async function handleSelectJob(type: 'SHIPMENT' | 'BOOKING' | 'RELEASE', job: any) {
    setSelectedJobType(type);
    setSelectedJobId(job.id);

    let ref = '';
    let orig = originText;
    let dest = destinationText;

    if (type === 'SHIPMENT') {
      ref = `${job.ref_number} · ${job.goods_desc?.slice(0, 30) || 'Shipment'}`;
      if (job.origin_port) orig = job.origin_port;
      if (job.dest_port) dest = job.dest_port;
    } else if (type === 'BOOKING') {
      ref = `${job.booking_number} · ${job.cargo_desc?.slice(0, 30) || 'Booking'}`;
      if (job.origin_port) orig = job.origin_port;
      if (job.destination_port) dest = job.destination_port;
    } else if (type === 'RELEASE') {
      ref = `${job.doc_number} · ${job.customer_name || 'Warehouse Release'}`;
      if (job.delivery_address) dest = job.delivery_address;
    }

    setJobRef(ref);
    setOriginText(orig);
    setDestinationText(dest);

    // Save manifest job reference
    await persistManifest({
      name: ref,
      job_type: type,
      shipment_id: type === 'SHIPMENT' ? job.id : undefined,
      booking_id: type === 'BOOKING' ? job.id : undefined,
      release_doc_id: type === 'RELEASE' ? job.id : undefined,
      origin: orig,
      destination: dest,
      stage: 'EQUIPMENT_ASSIGNMENT',
    });

    setSuccessMsg(`Linked job: ${ref}. Proceed to assign equipment & crew.`);
    setStage(2);
  }

  // Import Cargo Units from active job
  async function importCargoFromJob() {
    if (!selectedJobId || !manifestId || manifestId === 'draft-manifest') {
      setError('Save the manifest before importing cargo units.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/v1/tracking/manifests/${manifestId}/import-job`, {
        method: 'POST',
        body: JSON.stringify({ job_type: selectedJobType, job_id: selectedJobId }),
      });
      if (res?.items) {
        setItems(res.items);
        setSuccessMsg(`Imported ${res.items.length} cargo handling units into plan.`);
        setStage(3);
      }
    } catch (e: any) {
      setError(e.message || 'Import failed. You can add handling units manually.');
    } finally {
      setSaving(false);
    }
  }

  // Stage 4: 3D Auto-packing Heuristic
  async function runPackOptimization() {
    if (!manifestId || manifestId === 'draft-manifest') {
      setError('Please save manifest first.');
      return;
    }
    setPacking(true);
    setError('');
    try {
      const res = await apiFetch(`/v1/tracking/manifests/${manifestId}/pack`, { method: 'POST' });
      if (res?.items) {
        setItems(res.items);
        setSuccessMsg('3D spatial optimization complete. Handling units arranged inside compartment.');
      }
    } catch (e: any) {
      setError(e.message || 'Optimization failed.');
    } finally {
      setPacking(false);
    }
  }

  // Stage 4: Approve Load Plan
  async function handleApprovePlan() {
    if (!manifestId || manifestId === 'draft-manifest') return;
    if (
      !(await showConfirm(
        'Approve this loading plan? Dimensions, boundary checks, and payload limits will be locked for physical dock verification.',
        { variant: 'warning', confirmLabel: 'Approve & Advance to Loading' }
      ))
    )
      return;

    try {
      const updated = await apiFetch(`/v1/tracking/manifests/${manifestId}/approve`, { method: 'POST' });
      setManifests(prev => prev.map(m => m.id === manifestId ? { ...m, ...updated } : m));
      setSuccessMsg('Load plan approved. Manifest is locked and ready for physical verification.');
      setStage(5);
    } catch (e: any) {
      setError(e.message || 'Could not approve plan.');
    }
  }

  // Stage 5: Start Physical Loading
  async function handleStartLoading() {
    if (!manifestId) return;
    try {
      const updated = await apiFetch(`/v1/tracking/manifests/${manifestId}/start-loading`, {
        method: 'POST',
        body: JSON.stringify({ loader_name: loaderName || 'Loading Dock Crew' }),
      });
      setManifests(prev => prev.map(m => m.id === manifestId ? { ...m, ...updated } : m));
      setSuccessMsg('Physical loading initiated at dock.');
    } catch (e: any) {
      setError(e.message || 'Could not start loading.');
    }
  }

  // Stage 5: Finalize Physical Verification
  async function handleFinalizeVerification() {
    if (!manifestId) return;
    if (!primarySeal.trim()) {
      setError('High-security seal number is required before finalizing load verification.');
      return;
    }
    if (hasDiscrepancies && !exceptionsAcknowledged) {
      setError('Shortages or damages recorded on handling units. Explicit exception acknowledgment checkbox is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        items: items.map(it => ({
          id: it.id,
          loaded_quantity: it.loaded_quantity ?? it.quantity,
          damaged_quantity: it.damaged_quantity ?? 0,
          damage_description: it.damage_description || undefined,
        })),
        seal_number: primarySeal.trim(),
        secondary_seal_number: secondarySeal.trim() || undefined,
        loader_name: loaderName || 'Dock Loading Crew',
        checker_name: checkerName || 'Dock Supervisor',
        exceptions_acknowledged: exceptionsAcknowledged,
        damage_notes: damageNotes || undefined,
        discrepancy_notes: discrepancyNotes || undefined,
        verification_checklist: verificationChecklist,
      };

      const updated = await apiFetch(`/v1/tracking/manifests/${manifestId}/verify-load`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setManifests(prev => prev.map(m => m.id === manifestId ? { ...m, ...updated } : m));
      setSuccessMsg('Physical load verified and sealed. Manifest status advanced to LOADED.');
      setStage(6);
    } catch (e: any) {
      setError(e.message || 'Physical verification failed.');
    } finally {
      setSaving(false);
    }
  }

  // Stage 6: Dispatch Vehicle
  async function handleDispatchVehicle() {
    if (!manifestId) return;
    if (
      !(await showConfirm(
        `Release and dispatch vehicle ${activeVehicle?.name || 'Truck'} to driver ${activeDriver?.name || 'Driver'} with Seal ${primarySeal}?`,
        { confirmLabel: 'Authorize Dispatch' }
      ))
    )
      return;

    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch(`/v1/tracking/manifests/${manifestId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: selectedVehicleId,
          driver_id: selectedDriverId,
          dock_number: dockNumber,
          seal_number: primarySeal,
          dispatcher_name: checkerName || 'Operations Dispatcher',
          notes: `Dispatched from ${dockNumber}. Seal: ${primarySeal}`,
        }),
      });

      setManifests(prev => prev.map(m => m.id === manifestId ? { ...m, ...updated } : m));
      setSuccessMsg('Vehicle officially dispatched! Trip initialized and status updated to DISPATCHED.');
    } catch (e: any) {
      setError(e.message || 'Dispatch failed.');
    } finally {
      setSaving(false);
    }
  }

  // Stepper labels
  const STAGES_META = [
    { num: 1, title: 'Select Job', desc: 'Shipment / Booking / Release' },
    { num: 2, title: 'Equipment & Crew', desc: 'Truck, Trailer, Driver & Dock' },
    { num: 3, title: 'Confirm Cargo', desc: 'Handling Units & Weights' },
    { num: 4, title: 'Plan Load', desc: '2D/3D Spatial Arrangement' },
    { num: 5, title: 'Load & Verify', desc: 'Physical Counts & Security Seal' },
    { num: 6, title: 'Dispatch', desc: 'Checklist & Vehicle Release' },
  ];

  return (
    <div className="cargo-loading-page freight-workspace">
      {error && <Banner variant="error" style={{ marginBottom: 14 }}>{error}</Banner>}
      {successMsg && <Banner variant="success" onDismiss={() => setSuccessMsg('')} style={{ marginBottom: 14 }}>{successMsg}</Banner>}

      {/* Page Header */}
      <PageHeader
        crumbs={['HuduFreight', 'Cargo Loading']}
        titlePlain="Cargo"
        titleEm="Loading"
        subtitle="End-to-end 6-stage freight workflow: from transport job to safe load, physical seal verification, and traceable dispatch."
        actions={
          <div className="cargo-header-actions">
            <Badge variant={activeManifest.status === 'DISPATCHED' ? 'success' : activeManifest.status === 'LOADED' ? 'brand' : activeManifest.status === 'APPROVED' ? 'warning' : 'outline'}>
              Status: {activeManifest.status}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Actions <Icon name="chevronDown" size={14} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { void loadJobsAndEquipment(); void loadManifests(); }}>
                  <Icon name="refresh" size={14} /> Refresh Jobs &amp; Fleet
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowOfficialManifest(true)}>
                  <Icon name="fileText" size={14} /> Printable Carrier Manifest
                </DropdownMenuItem>
                {activeManifest.trip_id && (
                  <DropdownMenuItem asChild>
                    <Link to={`/tracking/trips`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="truck" size={14} /> View Linked Fleet Trip
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {stage === 4 && activeManifest.status === 'DRAFT' && (
              <Button size="sm" onClick={() => void handleApprovePlan()} disabled={saving}>
                <Icon name="check" size={14} /> Approve Load Plan
              </Button>
            )}
            {stage === 5 && activeManifest.status === 'APPROVED' && (
              <Button size="sm" onClick={() => void handleStartLoading()}>
                <Icon name="truck" size={14} /> Start Physical Loading
              </Button>
            )}
            {stage === 5 && ['APPROVED', 'LOADING'].includes(activeManifest.status) && (
              <Button size="sm" onClick={() => void handleFinalizeVerification()} disabled={saving}>
                <Icon name="checkCircle" size={14} /> Complete Verification
              </Button>
            )}
            {stage === 6 && activeManifest.status === 'LOADED' && (
              <Button size="sm" onClick={() => void handleDispatchVehicle()} disabled={saving}>
                <Icon name="truck" size={14} /> Release &amp; Dispatch Vehicle
              </Button>
            )}
          </div>
        }
      />

      {/* 6-Stage Stepper Navigation */}
      <nav className="cargo-lifecycle-stepper" aria-label="Cargo loading six stages">
        {STAGES_META.map(step => {
          const isActive = stage === step.num;
          const isDone = stage > step.num || (step.num === 4 && activeManifest.status === 'APPROVED') || (step.num === 5 && activeManifest.status === 'LOADED') || activeManifest.status === 'DISPATCHED';
          return (
            <Button
              key={step.num}
              size="sm"
              variant="ghost"
              className={`cargo-step-item ${isActive ? 'is-active' : ''} ${isDone ? 'is-completed' : ''}`}
              onClick={() => setStage(step.num as StageNumber)}
            >
              <span className="cargo-step-badge">
                {isDone ? <Icon name="check" size={12} /> : step.num}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{step.title}</span>
                <span style={{ fontSize: 10, color: 'var(--ink3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{step.desc}</span>
              </div>
            </Button>
          );
        })}
      </nav>

      {/* =========================================================================
          STAGE 1: SELECT A JOB
      ========================================================================= */}
      {stage === 1 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Stage 1: Select a Transport Job">
            <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
                Select an authorized source document for this load: an active ClearOS customs shipment, a transport booking, an authorized SEAL warehouse release order, or create an ad-hoc direct freight run.
              </p>

              {/* Source Filters */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {(['ALL', 'SHIPMENT', 'BOOKING', 'RELEASE'] as const).map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={jobTypeFilter === f ? 'default' : 'outline'}
                    onClick={() => setJobTypeFilter(f)}
                  >
                    {f === 'ALL' ? 'All Active Jobs' : f === 'SHIPMENT' ? `ClearOS Shipments (${shipments.length})` : f === 'BOOKING' ? `Bookings (${bookings.length})` : `Warehouse Releases (${releases.length})`}
                  </Button>
                ))}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Input
                    placeholder="Search reference #, port, client or cargo description..."
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Jobs List Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
                {/* Shipments */}
                {(jobTypeFilter === 'ALL' || jobTypeFilter === 'SHIPMENT') &&
                  shipments
                    .filter(s => !jobSearch || s.ref_number.toLowerCase().includes(jobSearch.toLowerCase()) || s.goods_desc?.toLowerCase().includes(jobSearch.toLowerCase()))
                    .map(s => {
                      const isSel = selectedJobId === s.id;
                      return (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectJob('SHIPMENT', s)}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            border: isSel ? '2px solid var(--teal)' : '1px solid var(--border)',
                            background: isSel ? 'var(--teal-l)' : 'var(--card-bg)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Badge variant="brand">SHIPMENT</Badge>
                              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.stage || 'ACTIVE'}</span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginTop: 6 }}>{s.ref_number}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, lineClamp: 2, overflow: 'hidden' }}>
                              {s.goods_desc || 'General Freight'}
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            <div>Route: {s.origin_port || 'Port'} → {s.dest_port || 'Depot'}</div>
                            <div>Gross: {s.gross_weight_kg ? `${Number(s.gross_weight_kg).toLocaleString()} kg` : 'Weight unmeasured'}</div>
                          </div>
                        </div>
                      );
                    })}

                {/* Freight Bookings */}
                {(jobTypeFilter === 'ALL' || jobTypeFilter === 'BOOKING') &&
                  bookings
                    .filter(b => !jobSearch || b.booking_number.toLowerCase().includes(jobSearch.toLowerCase()) || b.cargo_desc?.toLowerCase().includes(jobSearch.toLowerCase()))
                    .map(b => {
                      const isSel = selectedJobId === b.id;
                      return (
                        <div
                          key={b.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectJob('BOOKING', b)}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            border: isSel ? '2px solid var(--teal)' : '1px solid var(--border)',
                            background: isSel ? 'var(--teal-l)' : 'var(--card-bg)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Badge variant="outline">BOOKING</Badge>
                              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{b.status || 'CONFIRMED'}</span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginTop: 6 }}>{b.booking_number}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{b.cargo_desc || 'Transport Booking'}</div>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            <div>Route: {b.origin_port || 'Origin'} → {b.destination_port || 'Destination'}</div>
                            <div>Units: {b.quantity || 1} handling unit(s)</div>
                          </div>
                        </div>
                      );
                    })}

                {/* Release Documents */}
                {(jobTypeFilter === 'ALL' || jobTypeFilter === 'RELEASE') &&
                  releases
                    .filter(r => !jobSearch || r.doc_number.toLowerCase().includes(jobSearch.toLowerCase()) || r.customer_name?.toLowerCase().includes(jobSearch.toLowerCase()))
                    .map(r => {
                      const isSel = selectedJobId === r.id;
                      return (
                        <div
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectJob('RELEASE', r)}
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            border: isSel ? '2px solid var(--teal)' : '1px solid var(--border)',
                            background: isSel ? 'var(--teal-l)' : 'var(--card-bg)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Badge variant="warning">RELEASE ORDER</Badge>
                              <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.status || 'ISSUED'}</span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)', marginTop: 6 }}>{r.doc_number}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{r.customer_name || 'Client Order'}</div>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            <div>Delivery: {r.delivery_address || 'Warehouse Dock'}</div>
                            <div>Expires: {r.valid_until || 'Standard terms'}</div>
                          </div>
                        </div>
                      );
                    })}
              </div>

              {/* Direct / Ad-hoc Transport Fallback Card */}
              <div style={{ padding: 16, background: 'var(--card-sunken)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Or Specify Direct Transport Parameters:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>Job Reference</label>
                    <Input value={jobRef} onChange={(e) => setJobRef(e.target.value)} placeholder="e.g. TRC-901 Expedited" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>Consignee / Client</label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Client Name" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>Origin</label>
                    <Input value={originText} onChange={(e) => setOriginText(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)' }}>Destination</label>
                    <Input value={destinationText} onChange={(e) => setDestinationText(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="cargo-step-actions">
                <div />
                <Button onClick={() => setStage(2)}>
                  Next: Assign Equipment &amp; Crew →
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* =========================================================================
          STAGE 2: ASSIGN EQUIPMENT AND CREW
      ========================================================================= */}
      {stage === 2 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Stage 2: Equipment & Crew Assignment">
            <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
                Select an operational truck and trailer, assign a licensed driver, and assign the warehouse bay/dock location.
              </p>

              {/* Vehicle Selection */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
                  Select Fleet Truck
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
                  {vehicles.map(v => {
                    const isSel = v.id === selectedVehicleId;
                    return (
                      <div
                        key={v.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedVehicleId(v.id);
                          setParams({ vehicle: v.id });
                          persistManifest({ vehicle_id: v.id });
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
                          src={v.photo_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80'}
                          alt={v.name}
                          style={{ width: 68, height: 44, objectFit: 'contain', borderRadius: 4 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{v.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{v.plate_number} · {v.type || 'TRUCK'}</div>
                          {v.dimensions && <div style={{ fontSize: 10, color: 'var(--teal)' }}>{v.dimensions}</div>}
                        </div>
                        <Badge variant={isSel ? 'brand' : 'outline'}>{isSel ? 'Selected' : 'Select'}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trailer & Dock Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Trailer Unit (Optional)
                  </label>
                  <select
                    value={selectedTrailerId}
                    onChange={(e) => {
                      setSelectedTrailerId(e.target.value);
                      persistManifest({ trailer_id: e.target.value || undefined });
                    }}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card-bg)',
                      fontSize: 13,
                      color: 'var(--ink)',
                    }}
                  >
                    <option value="">No Trailer / Rigid Body Only</option>
                    {trailers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.registration_number}) — {t.trailer_type || 'FLATBED'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Warehouse Facility
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => {
                      setSelectedLocationId(e.target.value);
                      persistManifest({ location_id: e.target.value || undefined });
                    }}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card-bg)',
                      fontSize: 13,
                      color: 'var(--ink)',
                    }}
                  >
                    <option value="">Select facility...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Loading Bay / Dock #
                  </label>
                  <Input value={dockNumber} onChange={(e) => setDockNumber(e.target.value)} />
                </div>
              </div>

              {/* Driver Assignment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Assigned Driver
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input readOnly value={activeDriver ? `${activeDriver.name} (${activeDriver.license_number})` : 'Unassigned'} />
                    <Button variant="outline" onClick={() => setShowDriverPicker(true)}>Change</Button>
                  </div>
                  {activeDriver?.license_expiry && new Date(activeDriver.license_expiry) < new Date() && (
                    <div style={{ color: 'var(--red)', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
                      ⚠ Warning: Driver license expired on {activeDriver.license_expiry}. Renew before departure.
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    High-Security Seal Allocation (Stage 5 Verification)
                  </label>
                  <Input
                    placeholder="e.g. TZ-SEAL-892014-X (Optional for now, verified in Stage 5)"
                    value={primarySeal}
                    onChange={(e) => setPrimarySeal(e.target.value)}
                  />
                </div>
              </div>

              {/* Equipment Capacity Check Card */}
              <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Payload Capability Verification</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Max Vehicle Payload: <strong>{maxPayloadKg.toLocaleString()} kg</strong> · Planned Cargo: <strong>{totalPlannedWeight.toLocaleString()} kg</strong>
                  </div>
                </div>
                <Badge variant={weightUtilPct > 100 ? 'destructive' : 'success'}>
                  {weightUtilPct > 100 ? `EXCEEDS PAYLOAD (${weightUtilPct}%)` : `Safe (${weightUtilPct}% Payload)`}
                </Badge>
              </div>

              <div className="cargo-step-actions">
                <Button variant="outline" onClick={() => setStage(1)}>← Back to Job</Button>
                <Button onClick={() => setStage(3)}>Next: Confirm Cargo Units →</Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* =========================================================================
          STAGE 3: CONFIRM CARGO HANDLING UNITS
      ========================================================================= */}
      {stage === 3 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Stage 3: Confirm Cargo Handling Units">
            <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
                  Enter or import handling units: pallets, crates, cartons, or loose items. Verify dimensions, weights, and stacking rules.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedJobId && (
                    <Button size="sm" variant="outline" onClick={() => void importCargoFromJob()} disabled={saving}>
                      <Icon name="download" size={13} /> Import from Job
                    </Button>
                  )}
                  <Button size="sm" onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
                    <Icon name="plus" size={13} /> Add Handling Unit
                  </Button>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: 'var(--card-sunken)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
                      <th style={{ padding: '10px 12px' }}>Type</th>
                      <th style={{ padding: '10px 12px' }}>Description / Label</th>
                      <th style={{ padding: '10px 12px' }}>Dimensions (L×W×H cm)</th>
                      <th style={{ padding: '10px 12px' }}>Unit Mass</th>
                      <th style={{ padding: '10px 12px' }}>Qty</th>
                      <th style={{ padding: '10px 12px' }}>Gross Weight</th>
                      <th style={{ padding: '10px 12px' }}>Stack Limit</th>
                      <th style={{ padding: '10px 12px' }}>Handling Notes</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink3)' }}>
                          No cargo handling units added yet. Add a unit or import from the linked job.
                        </td>
                      </tr>
                    ) : (
                      items.map(it => {
                        const exceedsLength = it.length_cm > containerLength;
                        const exceedsWidth = it.width_cm > containerWidth;
                        const exceedsHeight = it.height_cm > containerHeight;
                        const hasDimIssue = exceedsLength || exceedsWidth || exceedsHeight;

                        return (
                          <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <Badge variant="outline">{it.unit_type || 'PALLET'}</Badge>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                              {it.label}
                              {it.is_fragile && (
                                <Badge variant="warning" style={{ marginLeft: 6, fontSize: 10 }}>FRAGILE</Badge>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', color: hasDimIssue ? 'var(--red)' : 'var(--ink2)' }}>
                              {it.length_cm} × {it.width_cm} × {it.height_cm}
                              {hasDimIssue && <span style={{ marginLeft: 4, fontWeight: 700 }}>⚠ Exceeds deck</span>}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{it.weight_kg} kg</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{it.quantity}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                              {((Number(it.weight_kg) || 0) * (Number(it.quantity) || 1)).toLocaleString()} kg
                            </td>
                            <td style={{ padding: '10px 12px' }}>Max {it.stacking_max || 2}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--ink3)', fontSize: 11.5 }}>
                              {it.handling_instructions || '—'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditingItem(it); setShowItemModal(true); }}
                                style={{ height: 26, fontSize: 11, marginRight: 4 }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    await apiFetch(`/v1/tracking/items/${it.id}`, { method: 'DELETE' });
                                  } catch {
                                    // resilient
                                  }
                                  setItems(prev => prev.filter(x => x.id !== it.id));
                                }}
                                style={{ height: 26, fontSize: 11, color: 'var(--red)' }}
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Capacity & Volume Progress */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span>Payload Mass Utilization</span>
                    <span style={{ color: weightUtilPct > 100 ? 'var(--red)' : 'var(--teal)' }}>{weightUtilPct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, weightUtilPct)}%`, background: weightUtilPct > 100 ? 'var(--red)' : 'var(--teal)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                    {totalPlannedWeight.toLocaleString()} kg of {maxPayloadKg.toLocaleString()} kg limit
                  </div>
                </div>

                <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span>Compartment Volume Utilization</span>
                    <span style={{ color: volumeUtilPct > 100 ? 'var(--red)' : 'var(--teal)' }}>{volumeUtilPct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, volumeUtilPct)}%`, background: volumeUtilPct > 100 ? 'var(--red)' : 'var(--teal)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                    {totalVolumeM3.toFixed(2)} m³ of {containerVolumeM3.toFixed(2)} m³ volume
                  </div>
                </div>
              </div>

              <div className="cargo-step-actions">
                <Button variant="outline" onClick={() => setStage(2)}>← Back to Equipment</Button>
                <Button onClick={() => setStage(4)}>Next: Plan Load (2D/3D) →</Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* =========================================================================
          STAGE 4: PLAN THE LOAD (2D / 3D WORKSPACE)
      ========================================================================= */}
      {stage === 4 && (
        <div style={{ marginBottom: 24 }}>
          {/* Main Workspace Header & Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Load Planning Workspace · 2D / 3D Visual Deck</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                Arrange handling units, inspect clearances, run spatial optimization, and verify boundaries.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="outline" onClick={() => void runPackOptimization()} disabled={packing}>
                <Icon name="refresh" size={13} /> {packing ? 'Optimizing...' : 'Run 3D Optimization'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void persistManifest({ stage: 'LOAD_PLANNING', status: 'PLANNED' })}>
                Save as Planned
              </Button>
              {activeManifest.status !== 'APPROVED' && (
                <Button size="sm" onClick={() => void handleApprovePlan()} disabled={saving || weightUtilPct > 100}>
                  <Icon name="check" size={13} /> Approve Load Plan
                </Button>
              )}
            </div>
          </div>

          {/* Interactive Truck Load 3D / 2D Canvas */}
          <TruckLoadOverview
            manifest={activeManifest}
            items={items}
            vehicle={activeVehicle}
            driver={activeDriver}
            selectedItemId={selectedItemId}
            onItemSelect={(id) => setSelectedItemId(id)}
            onAddItemClick={() => { setEditingItem(null); setShowItemModal(true); }}
            onUnloadItem={async (id) => {
              try {
                await apiFetch(`/v1/tracking/items/${id}`, { method: 'DELETE' });
              } catch {
                // resilient
              }
              setItems(prev => prev.filter(x => x.id !== id));
            }}
          />

          {/* Load Balance & Physical Telemetry Panel */}
          <div className="cargo-metrics-grid" style={{ marginTop: 18 }}>
            <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                Axle Distribution (Steer &amp; Tandem)
              </span>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                Not assessed
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Requires certified weighbridge telemetry</span>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                Geometric Load Centroid
              </span>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>
                {geometricCentroidPct}% Deck Length
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>Geometric center of placed masses</span>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                Gross Cargo Mass
              </span>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                {totalPlannedWeight.toLocaleString()} kg
              </div>
              <span style={{ fontSize: 10.5, color: weightUtilPct > 100 ? 'var(--red)' : 'var(--teal)' }}>
                {weightUtilPct}% of {maxPayloadKg.toLocaleString()} kg max
              </span>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--card-sunken)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                Compartment Fill
              </span>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                {totalVolumeM3.toFixed(1)} / {containerVolumeM3.toFixed(1)} m³
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{volumeUtilPct}% spatial utilization</span>
            </div>
          </div>

          <div className="cargo-step-actions" style={{ marginTop: 20 }}>
            <Button variant="outline" onClick={() => setStage(3)}>← Back to Cargo</Button>
            <Button onClick={() => setStage(5)}>Next: Load &amp; Verify at Dock →</Button>
          </div>
        </div>
      )}

      {/* =========================================================================
          STAGE 5: LOAD AND VERIFY (PHYSICAL DOCK INSPECTION)
      ========================================================================= */}
      {stage === 5 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Stage 5: Physical Load Verification &amp; Security Seals">
            <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <p style={{ color: 'var(--ink2)', fontSize: 13.5, margin: 0 }}>
                  Confirm physical handling units loaded onto the vehicle. Record actual counts, document shortages/damages, inspect packaging, and record high-security seals.
                </p>
                {activeManifest.status === 'APPROVED' && (
                  <Button size="sm" onClick={() => void handleStartLoading()}>
                    <Icon name="truck" size={13} /> Start Physical Loading
                  </Button>
                )}
              </div>

              {/* Warning if discrepancies exist */}
              {hasDiscrepancies && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name="alertTriangle" size={20} style={{ color: '#d97706', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12.5, color: '#92400e' }}>
                    <strong>Discrepancies detected:</strong> Actual loaded quantities differ from planned handling units, or cargo damage has been logged. Explicit exception authorization is required below.
                  </div>
                </div>
              )}

              {/* Physical Tally Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ background: 'var(--card-sunken)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)' }}>
                      <th style={{ padding: '10px 12px' }}>Unit Description</th>
                      <th style={{ padding: '10px 12px' }}>Planned Qty</th>
                      <th style={{ padding: '10px 12px' }}>Actual Loaded Qty</th>
                      <th style={{ padding: '10px 12px' }}>Damaged Qty</th>
                      <th style={{ padding: '10px 12px' }}>Damage Notes / Observations</th>
                      <th style={{ padding: '10px 12px' }}>Inspection Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => {
                      const loaded = it.loaded_quantity ?? it.quantity;
                      const damaged = it.damaged_quantity ?? 0;
                      const isShort = loaded < it.quantity;
                      const hasDamage = damaged > 0;

                      return (
                        <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                            {it.label}
                            <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>
                              {it.unit_type || 'PALLET'} · {it.weight_kg} kg/unit
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>{it.quantity}</td>
                          <td style={{ padding: '10px 12px', width: 120 }}>
                            <Input
                              type="number"
                              min="0"
                              max={it.quantity * 2}
                              value={loaded}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setItems(prev => prev.map(x => x.id === it.id ? { ...x, loaded_quantity: val } : x));
                              }}
                              style={{ height: 32, fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', width: 120 }}>
                            <Input
                              type="number"
                              min="0"
                              max={it.quantity}
                              value={damaged}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setItems(prev => prev.map(x => x.id === it.id ? { ...x, damaged_quantity: val } : x));
                              }}
                              style={{ height: 32, color: damaged > 0 ? 'var(--red)' : 'inherit' }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <Input
                              placeholder="Notes if damaged/short..."
                              value={it.damage_description || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems(prev => prev.map(x => x.id === it.id ? { ...x, damage_description: val } : x));
                              }}
                              style={{ height: 32, fontSize: 12 }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {hasDamage ? (
                              <Badge variant="destructive">DAMAGE ({damaged})</Badge>
                            ) : isShort ? (
                              <Badge variant="warning">SHORTAGE (-{it.quantity - loaded})</Badge>
                            ) : (
                              <Badge variant="success">COMPLETE</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Security Seals & Crew Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Primary High-Security Seal # <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. TZ-SEAL-892014-X"
                    value={primarySeal}
                    onChange={(e) => setPrimarySeal(e.target.value)}
                    style={{ fontWeight: 700, borderColor: primarySeal ? 'var(--teal)' : 'inherit' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Secondary / Cable Seal # (Optional)
                  </label>
                  <Input
                    placeholder="e.g. CAB-00492"
                    value={secondarySeal}
                    onChange={(e) => setSecondarySeal(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Loading Bay Crew Lead
                  </label>
                  <Input
                    placeholder="Loader name"
                    value={loaderName}
                    onChange={(e) => setLoaderName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                    Dock Checker / Seal Verifier
                  </label>
                  <Input
                    placeholder="Checker name"
                    value={checkerName}
                    onChange={(e) => setCheckerName(e.target.value)}
                  />
                </div>
              </div>

              {/* Physical Verification Checklist */}
              <div style={{ padding: 16, background: 'var(--card-sunken)', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Physical Dock Verification Checklist</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['countMatched', 'Cargo physically counted and verified against source documentation'],
                    ['packagingSound', 'Packaging is sound, free from moisture, leakage, or puncture damage'],
                    ['heavyOnBase', 'Heavy handling units placed firmly on compartment deck floor'],
                    ['cargoBraced', 'Load is properly blocked, strapped, and secured against shifting'],
                    ['doorsSealed', 'Truck/container doors closed and verified high-security seal affixed'],
                  ].map(([key, desc]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(verificationChecklist[key])}
                        onChange={(e) => setVerificationChecklist(prev => ({ ...prev, [key]: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                      />
                      <span>{desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Exception Acknowledgment (if discrepancies) */}
              {hasDiscrepancies && (
                <div style={{ padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={exceptionsAcknowledged}
                      onChange={(e) => setExceptionsAcknowledged(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#d97706', marginTop: 2 }}
                    />
                    <div style={{ fontSize: 12.5, color: '#92400e' }}>
                      <strong>Explicit Discrepancy Authorization:</strong> I acknowledge and certify the recorded shortages or damages. I authorize the load manifest to be finalized with these physical variances noted.
                    </div>
                  </label>
                </div>
              )}

              <div className="cargo-step-actions">
                <Button variant="outline" onClick={() => setStage(4)}>← Back to Plan</Button>
                <Button onClick={() => void handleFinalizeVerification()} disabled={saving}>
                  Finalize Verification &amp; Advance to Dispatch →
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* =========================================================================
          STAGE 6: DISPATCH & RELEASE VEHICLE
      ========================================================================= */}
      {stage === 6 && (
        <div style={{ marginBottom: 24 }}>
          <SectionCard title="Stage 6: Pre-Departure Safety Checklist &amp; Dispatch">
            <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Dispatch Status Banner */}
              {activeManifest.status === 'DISPATCHED' ? (
                <div style={{ padding: 18, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#166534' }}>Vehicle Officially Dispatched</div>
                    <div style={{ fontSize: 12.5, color: '#15803d', marginTop: 2 }}>
                      Released on {activeManifest.dispatched_at ? new Date(activeManifest.dispatched_at).toLocaleString() : 'Now'} by {activeManifest.dispatcher_name || 'Fleet Operations'}.
                    </div>
                  </div>
                  {activeManifest.trip_id && (
                    <Button size="sm" asChild>
                      <Link to={`/tracking/trips`}>
                        <Icon name="truck" size={14} /> Open Fleet Trip #{activeManifest.trip_id.slice(0, 8)}
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div style={{ padding: 16, background: 'var(--card-sunken)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Load Verified &amp; Ready for Vehicle Release</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      High-security seal {primarySeal || activeManifest.seal_number || 'AFFIXED'} confirmed on compartment doors.
                    </div>
                  </div>
                  <Badge variant="brand">LOADED &amp; SEALED</Badge>
                </div>
              )}

              {/* Pre-Departure Checklist */}
              <div style={{ padding: 18, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Driver Pre-Departure Safety Inspection</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['driverBriefed', `Driver ${activeDriver?.name || 'Driver'} briefed on route, stops, and delivery receiver contact`],
                    ['sealsVerified', `Physical seal numbers (${primarySeal || activeManifest.seal_number}) verified matching documentation`],
                    ['manifestIssued', 'Official Carrier Manifest printed and handed to driver for transit inspection'],
                    ['roadworthyChecked', 'Vehicle safety walkaround inspection passed (tires, mirrors, indicators, air brake lines)'],
                  ].map(([key, text]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(dispatchChecklist[key])}
                        onChange={(e) => setDispatchChecklist(prev => ({ ...prev, [key]: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                      />
                      <span>{text}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Transit & Equipment Dossier Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Fleet Equipment</div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{activeVehicle?.name || 'Fleet Truck'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Plate: {activeVehicle?.plate_number || '—'}</div>
                  {activeTrailer && <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Trailer: {activeTrailer.name}</div>}
                </div>

                <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Carrier Driver</div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{activeDriver?.name || 'Assigned Driver'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Phone: {activeDriver?.phone || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)' }}>License: {activeDriver?.license_number || '—'}</div>
                </div>

                <div style={{ padding: 14, background: 'var(--card-sunken)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Transit Route &amp; Seal</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--teal)', marginTop: 4 }}>
                    Seal: {primarySeal || activeManifest.seal_number || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{activeManifest.origin} → {activeManifest.destination}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Bay: {dockNumber}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <Button variant="outline" onClick={() => setShowOfficialManifest(true)}>
                  <Icon name="fileText" size={14} /> View &amp; Print Official Carrier Manifest
                </Button>

                {activeManifest.status !== 'DISPATCHED' ? (
                  <Button
                    onClick={() => void handleDispatchVehicle()}
                    disabled={saving || Object.values(dispatchChecklist).some(v => !v)}
                  >
                    <Icon name="truck" size={14} /> Release &amp; Dispatch Vehicle
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link to="/tracking/vehicles">
                      <Icon name="arrowLeft" size={14} /> Return to Fleet Vehicles
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* Driver Picker Modal */}
      {showDriverPicker && (
        <DriverPickerModal
          drivers={drivers}
          currentDriverId={selectedDriverId}
          onClose={() => setShowDriverPicker(false)}
          onSelectDriver={d => {
            setSelectedDriverId(d.id);
            setShowDriverPicker(false);
            setSuccessMsg(`Driver ${d.name} assigned.`);
          }}
        />
      )}

      {/* Add / Edit Cargo Unit Dialog */}
      {showItemModal && (
        <CargoUnitDialog
          initialItem={editingItem}
          onClose={() => { setShowItemModal(false); setEditingItem(null); }}
          onSave={async (itemData) => {
            if (editingItem) {
              try {
                await apiFetch(`/v1/tracking/manifests/${manifestId}/items/${editingItem.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify(itemData),
                });
                setItems(prev => prev.map(x => x.id === editingItem.id ? { ...x, ...itemData } : x));
                setSuccessMsg('Handling unit updated.');
              } catch (e: any) {
                setError(e.message || 'Could not update handling unit.');
              }
            } else {
              try {
                const created = await apiFetch(`/v1/tracking/manifests/${manifestId}/items`, {
                  method: 'POST',
                  body: JSON.stringify(itemData),
                });
                setItems(prev => [...prev, created]);
                setSuccessMsg('Handling unit added to plan.');
              } catch (e: any) {
                setError(e.message || 'Could not add handling unit.');
              }
            }
          }}
        />
      )}

      {/* Official Carrier Manifest Printable Modal */}
      {showOfficialManifest && (
        <OfficialManifestModal
          manifest={activeManifest}
          vehicle={activeVehicle}
          trailer={activeTrailer}
          driver={activeDriver}
          items={items}
          sealNumber={primarySeal || activeManifest.seal_number || ''}
          secondarySeal={secondarySeal || activeManifest.secondary_seal_number || ''}
          dockNumber={dockNumber}
          onClose={() => setShowOfficialManifest(false)}
        />
      )}
    </div>
  );
};

export default TrackingCargoLoading;
