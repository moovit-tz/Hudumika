import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import { MapContainer, Marker } from 'react-leaflet';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import 'leaflet/dist/leaflet.css';
import { CargoScene } from './TrackingCargoLoading.js';
import type { CameraPreset, Manifest as CargoManifest, CargoItem, PackResult } from './TrackingCargoLoading.js';
import { useVehicleMakes, useVehicleModels } from '../hooks/useVehicleMakeModel.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Vehicle {
  id: string; name: string; plate_number: string | null; type: string; status: string;
  vin: string | null; year: number | null; make: string | null; model: string | null;
  trim: string | null; color: string | null; ownership: string; mileage_km: number | null; device_id: string;
  fuel_type: string | null; group_name: string | null;
}
interface Driver { id: string; name: string; phone: string | null }
interface Position {
  latitude: number; longitude: number; speed: number | null; heading: number | null;
  battery_pct: number | null; ignition: string | null; recorded_at: string;
}
interface ActiveTrip {
  origin: string | null; destination: string | null;
  cargo_type: string | null; cargo_weight_kg: number | null; cargo_temp_c: number | null; load_capacity_pct: number | null;
}
interface CostMonth { month: string; fuel: number; service: number; other: number; total: number }
interface Reminder { id: string; title: string; due_date: string; status: string }
interface VDocument { id: string; doc_type: string; doc_number: string | null; expiry_date: string | null }
interface Issue { id: string; title: string; description: string | null; severity: string; status: string; created_at: string }
interface Expense { id: string; category: string; description: string | null; amount: number; expense_date: string }
interface MaintenanceRow { id: string; service_type: string; cost: number | null; service_date: string; next_due_date: string | null }
interface FuelRow { id: string; liters: number; cost: number | null; logged_at: string }
interface MeterReading { id: string; reading_km: number; source: string; recorded_at: string }
interface Assignment { id: string; driver_name: string; start_time: string; end_time: string | null; labels: string | null; comment: string | null }
interface SensorSnapshot { id: string; snapshot_type: string; payload: any; recorded_at: string }

interface Detail {
  vehicle: Vehicle; driver: Driver | null; last_position: Position | null; active_trip: ActiveTrip | null;
  cost_of_ownership: CostMonth[]; total_cost: number; cost_per_km: number | null;
  service_reminders: { overdue: number; due_soon: number; dismissed: number };
  reminders: Reminder[]; documents: VDocument[]; open_issues: Issue[]; issues: Issue[];
  meter_readings: MeterReading[];
}

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: 20 };
const statLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' };

const TABS = ['Overview', 'Service History', 'Fuel', 'Documents', 'Issues', 'Expenses', 'Assignments', 'Load Plan', 'Sensor Snapshots'] as const;
type Tab = typeof TABS[number];

export const TrackingVehicleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sensorSnapshots, setSensorSnapshots] = useState<SensorSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { makes } = useVehicleMakes('truck');
  const { models } = useVehicleModels(editForm.make || '');

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/tracking/vehicles/${id}/detail`).then(setDetail).catch(() => setDetail(null)).finally(() => setLoading(false));
    apiFetch('/v1/tracking/maintenance').then((rows: MaintenanceRow[] & { vehicle_id: string }[]) => setMaintenance((rows as any[]).filter(r => r.vehicle_id === id))).catch(() => setMaintenance([]));
    apiFetch('/v1/tracking/fuel').then((rows: any[]) => setFuel(rows.filter(r => r.vehicle_id === id))).catch(() => setFuel([]));
    apiFetch('/v1/tracking/assignments').then((rows: any[]) => setAssignments(rows.filter(r => r.vehicle_id === id))).catch(() => setAssignments([]));
    apiFetch(`/v1/tracking/vehicles/${id}/sensor_snapshots`).then(setSensorSnapshots).catch(() => setSensorSnapshots([]));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Loading vehicle…</div>;
  if (!detail) return <div style={{ padding: 24, color: 'var(--ink3)', fontSize: 13 }}>Vehicle not found.</div>;

  const { vehicle, driver, last_position, active_trip, cost_of_ownership, total_cost, cost_per_km, service_reminders, reminders, documents, open_issues } = detail;
  const minutesAgo = last_position ? Math.round((Date.now() - new Date(last_position.recorded_at).getTime()) / 60000) : null;

  async function resolveIssue(issueId: string) {
    await apiFetch(`/v1/tracking/issues/${issueId}/resolve`, { method: 'PATCH', body: JSON.stringify({}) });
    reload();
  }

  function startEdit() {
    setEditForm({
      name: vehicle.name || '',
      plate_number: vehicle.plate_number || '',
      vin: vehicle.vin || '',
      year: vehicle.year != null ? String(vehicle.year) : '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      trim: vehicle.trim || '',
      color: vehicle.color || '',
      type: vehicle.type || '',
      fuel_type: vehicle.fuel_type || '',
      group_name: vehicle.group_name || '',
      ownership: vehicle.ownership || '',
      mileage_km: vehicle.mileage_km != null ? String(vehicle.mileage_km) : '',
      status: vehicle.status || 'ACTIVE',
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...editForm };
      if (payload.year) payload.year = Number(payload.year);
      if (payload.mileage_km) payload.mileage_km = Number(payload.mileage_km);
      // Remove empty strings to avoid overwriting with blanks
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      await apiFetch(`/v1/tracking/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditing(false);
      reload();
    } catch (err) {
      console.error('Failed to save vehicle', err);
    } finally {
      setSaving(false);
    }
  }

  const costChartData = {
    labels: cost_of_ownership.map(c => c.month),
    datasets: [
      { label: 'Fuel', data: cost_of_ownership.map(c => c.fuel), backgroundColor: '#0891b2' },
      { label: 'Service', data: cost_of_ownership.map(c => c.service), backgroundColor: '#d97706' },
      { label: 'Other', data: cost_of_ownership.map(c => c.other), backgroundColor: '#64748b' },
    ],
  };

  const addActions: { key: string; label: string; icon: IconName }[] = [
    { key: 'assignment', label: 'Add Vehicle Assignment', icon: 'user' },
    { key: 'fuel', label: 'Add Fuel Entry', icon: 'activity' },
    { key: 'expense', label: 'Add Expense Entry', icon: 'dollarSign' },
    { key: 'service', label: 'Add Service Entry', icon: 'clipboardList' },
    { key: 'issue', label: 'Add Issue', icon: 'alertTriangle' },
    { key: 'inspection', label: 'Add Inspection Submission', icon: 'tasks' },
    { key: 'workorder', label: 'Add Work Order', icon: 'tool' },
    { key: 'reminder', label: 'Add Service Reminder', icon: 'bell' },
    { key: 'renewal', label: 'Add Vehicle Renewal Reminder', icon: 'refresh' },
    { key: 'meter', label: 'Add Meter Entry', icon: 'barChart2' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Link to="/tracking/vehicles" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={12} /> Back to Vehicles
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="truck" size={28} color="var(--teal)" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{vehicle.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.type} · {vehicle.plate_number || 'No plate'} · {vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : 'No mileage recorded'}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
          <span style={{ alignSelf: 'center', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '4px 12px', background: vehicle.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9', color: vehicle.status === 'ACTIVE' ? '#065f46' : '#64748b' }}>
            {vehicle.status}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <Icon name="plus" size={15} /> Add <Icon name="chevronDown" size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {addActions.map(a => (
                <DropdownMenuItem key={a.key} asChild>
                  <Link to={`/tracking/vehicles/${id}/add/${a.key}`} className="flex w-full cursor-pointer items-center gap-3">
                    <Icon name={a.icon} size={14} className="text-muted-foreground" /> {a.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{ padding: '10px 16px', border: 'none', borderBottom: tab === t ? '2px solid var(--teal)' : '2px solid transparent', background: 'none', color: tab === t ? 'var(--ink)' : 'var(--ink3)', fontWeight: tab === t ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>All Fields Details</div>
              {!editing ? (
                <button type="button" onClick={startEdit}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Icon name="edit" size={13} /> Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setEditing(false)}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={saveEdit} disabled={saving}
                    style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--teal)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            {(editing ? [
              ['name', 'Name'], ['mileage_km', 'Meter (km)'], ['status', 'Status'], ['group_name', 'Group'],
              ['type', 'Type'], ['fuel_type', 'Fuel'], ['vin', 'VIN/SN'], ['plate_number', 'License Plate'],
              ['year', 'Year'], ['make', 'Make'], ['model', 'Model'], ['trim', 'Trim'],
              ['color', 'Color'], ['ownership', 'Ownership'],
            ] as [string, string][] : [
              ['Name', vehicle.name], ['Meter', vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : '—'],
              ['Status', vehicle.status], ['Group', vehicle.group_name || 'No Group'], ['Operator', driver?.name ?? '—'], ['Type', vehicle.type],
              ['Fuel', vehicle.fuel_type || '—'],
              ['VIN/SN', vehicle.vin || '—'], ['License Plate', vehicle.plate_number || '—'],
              ['Year', vehicle.year ?? '—'], ['Make', vehicle.make || '—'], ['Model', vehicle.model || '—'],
              ['Trim', vehicle.trim || '—'], ['Color', vehicle.color || '—'], ['Ownership', vehicle.ownership],
              ['Device ID', vehicle.device_id],
            ] as [string, any][]).map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--ink3)', minWidth: 110 }}>{editing ? v : k}</span>
                {editing ? (
                  k === 'status' ? (
                    <Select value={editForm[k] || ''} onValueChange={v => setEditForm({ ...editForm, [k]: v })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="IDLE">IDLE</SelectItem>
                        <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                        <SelectItem value="DECOMMISSIONED">DECOMMISSIONED</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'ownership' ? (
                    <Select value={editForm[k] || ''} onValueChange={v => setEditForm({ ...editForm, [k]: v })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNED">OWNED</SelectItem>
                        <SelectItem value="LEASED">LEASED</SelectItem>
                        <SelectItem value="RENTED">RENTED</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'fuel_type' ? (
                    <Select value={editForm[k] || ''} onValueChange={v => setEditForm({ ...editForm, [k]: v })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DIESEL">DIESEL</SelectItem>
                        <SelectItem value="PETROL">PETROL</SelectItem>
                        <SelectItem value="ELECTRIC">ELECTRIC</SelectItem>
                        <SelectItem value="HYBRID">HYBRID</SelectItem>
                        <SelectItem value="CNG">CNG</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'make' ? (
                    <>
                      <input value={editForm[k] || ''} list="vdetail-make-options" title="Make" placeholder="e.g. Isuzu"
                        onChange={e => setEditForm({ ...editForm, make: e.target.value, model: '' })}
                        style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                      <datalist id="vdetail-make-options">{makes.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : k === 'model' ? (
                    <>
                      <input value={editForm[k] || ''} list="vdetail-model-options" disabled={!editForm.make} title="Model" placeholder="e.g. NPR"
                        onChange={e => setEditForm({ ...editForm, model: e.target.value })}
                        style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                      <datalist id="vdetail-model-options">{models.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : (
                    <input value={editForm[k] || ''} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })}
                      type={k === 'year' || k === 'mileage_km' ? 'number' : 'text'}
                      style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                  )
                ) : (
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{v}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Cost of Ownership</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={statLabel}>Total costs</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{total_cost.toLocaleString()}</div>
                </div>
              </div>
              {cost_per_km != null && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Cost per km: <strong>{cost_per_km}</strong></div>}
              <div style={{ height: 180 }}>
                {cost_of_ownership.length > 0
                  ? <Bar data={costChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true } } }} />
                  : <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>No cost data yet.</div>}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Service Reminders</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><div style={statLabel}>Overdue</div><div style={{ fontSize: 20, fontWeight: 800, color: service_reminders.overdue > 0 ? '#dc2626' : 'var(--ink)' }}>{service_reminders.overdue}</div></div>
                <div><div style={statLabel}>Due Soon</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{service_reminders.due_soon}</div></div>
                <div><div style={statLabel}>Dismissed</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{service_reminders.dismissed}</div></div>
              </div>
              {reminders.filter(r => r.status === 'PENDING').slice(0, 5).map(r => (
                <div key={r.id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border)', color: 'var(--ink2)' }}>
                  {r.title} — due {new Date(r.due_date).toLocaleDateString()}
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Last Known Location</div>
            {last_position ? (
              <div style={{ height: 200, borderRadius: 9, overflow: 'hidden' }}>
                <MapContainer center={[last_position.latitude, last_position.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <MapTileLayer />
                  <Marker position={[last_position.latitude, last_position.longitude]} />
                </MapContainer>
              </div>
            ) : <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No GPS position recorded yet.</div>}
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>Live Status</div>
            {active_trip ? (
              <>
                <div style={statLabel}>Cargo &amp; Capacity</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '8px 0 14px' }}>
                  <div><div style={{ fontSize: 10, color: 'var(--ink3)' }}>Type</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{active_trip.cargo_type || '—'}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--ink3)' }}>Weight</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{active_trip.cargo_weight_kg != null ? `${active_trip.cargo_weight_kg} kg` : '—'}</div></div>
                  <div><div style={{ fontSize: 10, color: 'var(--ink3)' }}>Temp</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{active_trip.cargo_temp_c != null ? `${active_trip.cargo_temp_c}°C` : '—'}</div></div>
                </div>
                {active_trip.load_capacity_pct != null && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink3)', marginBottom: 4 }}><span>Load Capacity</span><span>{active_trip.load_capacity_pct}%</span></div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${active_trip.load_capacity_pct}%`, height: '100%', background: 'var(--teal)' }} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>No active trip — not currently hauling cargo.</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{last_position?.speed ?? 0}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>km/h</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{last_position?.battery_pct != null ? `${last_position.battery_pct}%` : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>Battery</div>
              </div>
            </div>

            <div style={statLabel}>Status Overview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              <span>Ignition {last_position?.ignition ?? '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: (last_position?.speed ?? 0) > 3 ? '#059669' : '#dc2626' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                {(last_position?.speed ?? 0) > 3 ? 'Moving' : 'Stopped'}
              </span>
            </div>

            <div style={statLabel}>Location Data</div>
            <div style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink2)' }}>
              {last_position ? (
                <>
                  <div style={{ fontFamily: 'var(--mono)' }}>{last_position.latitude.toFixed(5)}, {last_position.longitude.toFixed(5)}</div>
                  <div style={{ color: 'var(--ink3)', marginTop: 2 }}>Updated {minutesAgo != null ? `${minutesAgo}m ago` : '—'} · Heading {last_position.heading ?? '—'}°</div>
                </>
              ) : <div style={{ color: 'var(--ink3)' }}>No telemetry yet.</div>}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Open Issues</div>
              <div style={{ textAlign: 'right' }}><div style={statLabel}>Open</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{open_issues.length}</div></div>
            </div>
            {open_issues.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No open issues.</div>}
            {open_issues.map(i => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <Icon name="alertTriangle" size={14} color="#dc2626" />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{i.title}</div>
                <button type="button" onClick={() => resolveIssue(i.id)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>Resolve</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Service History' && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left' }}>{['Service', 'Cost', 'Date', 'Next Due'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {maintenance.map(m => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>{m.service_type}</td>
                  <td style={{ padding: '8px 10px' }}>{m.cost != null ? m.cost.toLocaleString() : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{new Date(m.service_date).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 10px' }}>{m.next_due_date ? new Date(m.next_due_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {maintenance.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No service history yet.</div>}
        </div>
      )}

      {tab === 'Fuel' && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left' }}>{['Liters', 'Cost', 'Date'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {fuel.map(f => (
                <tr key={f.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>{f.liters} L</td>
                  <td style={{ padding: '8px 10px' }}>{f.cost != null ? f.cost.toLocaleString() : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{new Date(f.logged_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fuel.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No fuel entries yet.</div>}
        </div>
      )}

      {tab === 'Documents' && (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left' }}>{['Type', 'Number', 'Expiry'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>
              {documents.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px' }}>{d.doc_type}</td>
                  <td style={{ padding: '8px 10px' }}>{d.doc_number || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {documents.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No documents on file. Registration, insurance &amp; renewal records live here — add them from the Documents &amp; Insurance page.</div>}
        </div>
      )}

      {tab === 'Issues' && (
        <div style={cardStyle}>
          {detail.issues.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No issues reported.</div>}
          {detail.issues.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 8px', background: i.status === 'RESOLVED' ? '#ecfdf5' : '#fee2e2', color: i.status === 'RESOLVED' ? '#065f46' : '#dc2626' }}>{i.status}</span>
              <Link to={`/tracking/issues/${i.id}`} style={{ flex: 1, fontSize: 13, color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}>
                {i.title}
              </Link>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(i.created_at).toLocaleDateString()}</div>
              {i.status !== 'RESOLVED' && <button type="button" onClick={() => resolveIssue(i.id)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}>Resolve</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'Expenses' && <VehicleExpensesTab vehicleId={id!} />}
      {tab === 'Assignments' && <VehicleAssignmentsTab vehicleId={id!} />}
      {tab === 'Load Plan' && <VehicleLoadPlanTab vehicleId={id!} />}
      {tab === 'Sensor Snapshots' && <VehicleSensorSnapshotsTab vehicleId={id!} />}
    </div>
  );
};

function VehicleExpensesTab({ vehicleId }: { vehicleId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  useEffect(() => { apiFetch(`/v1/tracking/vehicles/${vehicleId}/expenses`).then(setExpenses).catch(() => setExpenses([])); }, [vehicleId]);
  return (
    <div style={cardStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left' }}>{['Category', 'Description', 'Amount', 'Date'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
        <tbody>
          {expenses.map(e => (
            <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '8px 10px' }}>{e.category}</td>
              <td style={{ padding: '8px 10px', color: 'var(--ink3)' }}>{e.description || '—'}</td>
              <td style={{ padding: '8px 10px' }}>{e.amount.toLocaleString()}</td>
              <td style={{ padding: '8px 10px' }}>{new Date(e.expense_date).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {expenses.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No expenses logged yet.</div>}
    </div>
  );
}

function VehicleSensorSnapshotsTab({ vehicleId }: { vehicleId: string }) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/v1/tracking/vehicles/${vehicleId}/sensor_snapshots`)
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading sensor data...</div>;

  return (
    <div style={{ display: 'flex', gap: 24, flexDirection: 'column' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="activity" size={14} /> Total Snapshots</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>{snapshots.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={14} /> Last Snapshot</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>
            {snapshots.length > 0 ? new Date(snapshots[0].recorded_at).toLocaleString() : 'N/A'}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Recent Sensor Data</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              {['Type', 'Payload', 'Recorded At'].map(h => (
                <th key={h} style={{ padding: '12px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshots.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 10px', fontWeight: 600, color: 'var(--ink)' }}>{s.snapshot_type}</td>
                <td style={{ padding: '12px 10px' }}>
                  <pre style={{ margin: 0, fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 6, color: 'var(--ink2)', maxWidth: 400, overflowX: 'auto' }}>
                    {typeof s.payload === 'string' ? s.payload : JSON.stringify(s.payload, null, 2)}
                  </pre>
                </td>
                <td style={{ padding: '12px 10px', color: 'var(--ink3)' }}>{new Date(s.recorded_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {snapshots.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No sensor snapshots recorded.</div>}
      </div>
    </div>
  );
}

function VehicleAssignmentsTab({ vehicleId }: { vehicleId: string }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/tracking/assignments')
      .then((rows: any[]) => setAssignments(rows.filter(r => r.vehicle_id === vehicleId)))
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading assignments...</div>;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Driver Assignments History</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            {['Driver', 'Start Time', 'End Time', 'Labels', 'Comments'].map(h => (
              <th key={h} style={{ padding: '12px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 10px', fontWeight: 600, color: 'var(--ink)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={a.driver_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.driver_name)}&background=random`} alt={a.driver_name} style={{ width: 24, height: 24, borderRadius: '50%' }} />
                  {a.driver_name}
                </div>
              </td>
              <td style={{ padding: '12px 10px', color: 'var(--ink2)' }}>{new Date(a.start_time).toLocaleString()}</td>
              <td style={{ padding: '12px 10px', color: 'var(--ink3)' }}>{a.end_time ? new Date(a.end_time).toLocaleString() : 'Currently Active'}</td>
              <td style={{ padding: '12px 10px' }}>
                {a.labels ? (
                  <span style={{ background: 'var(--teal-l)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{a.labels}</span>
                ) : '—'}
              </td>
              <td style={{ padding: '12px 10px', color: 'var(--ink3)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.comment || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {assignments.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No driver assignments recorded.</div>}
    </div>
  );
}

// Compact reuse of the standalone Cargo Loading page's manifest+pack UI,
// scoped to this one vehicle. Entitlement is enforced backend-side same as
// the standalone page — this tab just shows an inline upgrade message scoped
// to its own content instead of blocking the whole vehicle-detail page.
function VehicleLoadPlanTab({ vehicleId }: { vehicleId: string }) {
  const [manifests, setManifests] = useState<CargoManifest[]>([]);
  const [manifestId, setManifestId] = useState('');
  const [items, setItems] = useState<CargoItem[]>([]);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [packing, setPacking] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');

  const [itemLabel, setItemLabel] = useState('');
  const [itemL, setItemL] = useState('100');
  const [itemW, setItemW] = useState('100');
  const [itemH, setItemH] = useState('100');
  const [itemWeight, setItemWeight] = useState('50');
  const [itemQty, setItemQty] = useState('1');

  const reloadManifests = useCallback(() => {
    apiFetch(`/v1/tracking/manifests?vehicle_id=${vehicleId}`)
      .then((list: CargoManifest[]) => { setManifests(list); if (list.length > 0) setManifestId(prev => prev || list[0].id); })
      .catch((e: any) => { if (e.message?.includes('plan')) setLocked(true); })
      .finally(() => setLoading(false));
  }, [vehicleId]);

  useEffect(() => { reloadManifests(); }, [reloadManifests]);

  const reloadItems = useCallback(() => {
    if (!manifestId) { setItems([]); return; }
    apiFetch(`/v1/tracking/manifests/${manifestId}/items`).then(setItems).catch(() => setItems([]));
    setPackResult(null);
  }, [manifestId]);

  useEffect(() => { reloadItems(); }, [reloadItems]);

  const manifest = manifests.find(m => m.id === manifestId);

  async function createDefaultPlan() {
    setCreating(true);
    try {
      const created = await apiFetch('/v1/tracking/manifests', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Load Plan', vehicle_id: vehicleId,
          container_length_cm: 1200, container_width_cm: 235, container_height_cm: 260, max_weight_kg: 24000,
        }),
      });
      setManifestId(created.id);
      reloadManifests();
    } finally { setCreating(false); }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!manifestId) return;
    await apiFetch(`/v1/tracking/manifests/${manifestId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        label: itemLabel, length_cm: Number(itemL), width_cm: Number(itemW), height_cm: Number(itemH),
        weight_kg: Number(itemWeight), quantity: Number(itemQty),
      }),
    });
    setItemLabel('');
    reloadItems();
  }

  async function removeItem(itemId: string) {
    await apiFetch(`/v1/tracking/items/${itemId}`, { method: 'DELETE' });
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

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading load plan…</div>;

  if (locked) {
    return (
      <div style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center' }}>
        <Icon name="lock" size={24} color="var(--ink3)" />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 10 }}>Cargo Loading is an Enterprise feature</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Upgrade your plan to plan and visualize loads for this vehicle.</div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 12 }}>No load plan yet for this vehicle.</div>
        <button type="button" onClick={createDefaultPlan} disabled={creating}
          style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
          {creating ? 'Creating…' : 'Create load plan'}
        </button>
      </div>
    );
  }

  const smallInput: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12, background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{manifest.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            {manifest.container_length_cm} × {manifest.container_width_cm} × {manifest.container_height_cm} cm · max {manifest.max_weight_kg.toLocaleString()} kg
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Add item</div>
          <form onSubmit={addItem} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input required value={itemLabel} onChange={e => setItemLabel(e.target.value)} placeholder="Label" style={smallInput} />
            <div style={{ display: 'flex', gap: 5 }}>
              <input type="number" value={itemL} onChange={e => setItemL(e.target.value)} placeholder="L cm" style={smallInput} />
              <input type="number" value={itemW} onChange={e => setItemW(e.target.value)} placeholder="W cm" style={smallInput} />
              <input type="number" value={itemH} onChange={e => setItemH(e.target.value)} placeholder="H cm" style={smallInput} />
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <input type="number" value={itemWeight} onChange={e => setItemWeight(e.target.value)} placeholder="kg" style={smallInput} />
              <input type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} placeholder="Qty" style={smallInput} />
            </div>
            <button type="submit" style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Add item</button>
          </form>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Items ({items.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
            {items.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 9, height: 9, borderRadius: 3, background: it.color || '#0891b2', flexShrink: 0 }} />
                <div style={{ flex: 1, color: 'var(--ink)' }}>{it.label} × {it.quantity}</div>
                <button type="button" onClick={() => removeItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="close" size={11} /></button>
              </div>
            ))}
            {items.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 12 }}>No items added yet.</div>}
          </div>
          <button type="button" onClick={pack} disabled={packing || items.length === 0}
            style={{ marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 7, border: 'none', background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: items.length === 0 ? 'default' : 'pointer', opacity: items.length === 0 ? 0.5 : 1 }}>
            {packing ? 'Packing…' : 'Pack load'}
          </button>
        </div>

        {packResult && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Utilization</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span>Volume</span><strong>{packResult.volume_utilization_pct}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>Weight</span><strong>{packResult.weight_utilization_pct}%</strong>
            </div>
            {packResult.unplaced_items.length > 0 && (
              <div style={{ marginTop: 8, padding: '7px 9px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 7, fontSize: 11, color: '#dc2626' }}>
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
                padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${cameraPreset === preset ? 'var(--teal)' : 'var(--border)'}`,
                background: cameraPreset === preset ? 'var(--teal-l)' : 'var(--white)',
                color: cameraPreset === preset ? 'var(--teal)' : 'var(--ink2)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ height: 480, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <CargoScene manifest={manifest} items={items} cameraPreset={cameraPreset} />
        </div>
      </div>
    </div>
  );
}
