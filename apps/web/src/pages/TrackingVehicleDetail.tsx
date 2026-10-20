import { useChartColors } from '../hooks/useChartColors.js';
import { ResponsiveTable } from '../components/ui/responsive-table.js';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import { MapContainer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import type { IconName } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import 'leaflet/dist/leaflet.css';
import { useVehicleMakes, useVehicleModels } from '../hooks/useVehicleMakeModel.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { BackButton } from '../components/ui/BackButton.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { PageLoading } from '../components/ui/spinner.js';
import './FreightOperations.css';
import './TrackingVehicleDetail.css';
import { Truck3DViewer } from '../components/tracking/Truck3DViewer.js';
import { TruckLoadOverview } from '../components/tracking/TruckLoadOverview.js';
import { getFleetVehicleById, type FleetVehicle } from '../lib/freightFleetData.js';
import { VehicleSensorSnapshotsTab } from '../components/tracking/VehicleSensorSnapshotsTab.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Vehicle {
  id: string; name: string; plate_number: string | null; type: string; status: string;
  vin: string | null; year: number | null; make: string | null; model: string | null;
  trim: string | null; color: string | null; ownership: string; mileage_km: number | null; device_id: string;
  fuel_type: string | null; group_name: string | null; speed_limit_kmh: number | null;
  photo_url?: string | null;
}
interface Driver { id: string; name: string; phone: string | null }
interface Position {
  latitude: number; longitude: number; speed: number | null; heading: number | null;
  battery_pct: number | null; ignition: string | null; recorded_at: string;
}
interface ActiveTrip {
  id?: string;
  shipment_id?: string | null;
  shipment_ref?: string | null;
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

const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 20 };
const statLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.04em' };

const TABS = ['Overview', '3D Schematics & Loading', 'Service History', 'Fuel', 'Documents', 'Issues', 'Expenses', 'Assignments', 'Load Plan', 'Sensor Snapshots'] as const;
type Tab = typeof TABS[number];

const vehicleMapMarker = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--teal); width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.45); position:relative;"><div style="position:absolute; inset:-5px; border-radius:50%; border:2px solid var(--teal); opacity:0.65;"></div></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const TrackingVehicleDetail: React.FC = () => {
  const chartColors = useChartColors();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sensorSnapshots, setSensorSnapshots] = useState<SensorSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.includes(requestedTab as Tab) ? requestedTab as Tab : 'Overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { makes } = useVehicleMakes('truck');
  const { models } = useVehicleModels(editForm.make || '');

  const reload = useCallback(() => {
    if (!id) return;
    setError('');
    setLoading(true);
    apiFetch(`/v1/tracking/vehicles/${id}/detail`)
      .then(res => {
        if (res && res.vehicle) {
          setDetail(res);
        } else {
          setDetail(null);
          setError('Vehicle record not found');
        }
      })
      .catch((err) => {
        setDetail(null);
        setError(err instanceof Error ? err.message : 'Could not load vehicle details');
      })
      .finally(() => setLoading(false));

    apiFetch('/v1/tracking/maintenance').then((rows: MaintenanceRow[] & { vehicle_id: string }[]) => setMaintenance((rows as any[]).filter(r => r.vehicle_id === id))).catch(() => setMaintenance([]));
    apiFetch('/v1/tracking/fuel').then((rows: any[]) => setFuel(rows.filter(r => r.vehicle_id === id))).catch(() => setFuel([]));
    apiFetch('/v1/tracking/assignments').then((rows: any[]) => setAssignments(rows.filter(r => r.vehicle_id === id))).catch(() => setAssignments([]));
    apiFetch(`/v1/tracking/vehicles/${id}/sensor_snapshots`).then(setSensorSnapshots).catch(() => setSensorSnapshots([]));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const vehicle = detail?.vehicle;
  const driver = detail?.driver;
  const last_position = detail?.last_position;
  const active_trip = detail?.active_trip;
  const cost_of_ownership = detail?.cost_of_ownership || [];
  const total_cost = detail?.total_cost || 0;
  const cost_per_km = detail?.cost_per_km;
  const service_reminders = detail?.service_reminders || { overdue: 0, due_soon: 0, dismissed: 0 };
  const reminders = detail?.reminders || [];
  const documents = detail?.documents || [];
  const open_issues = detail?.open_issues || [];
  const minutesAgo = last_position ? Math.round((Date.now() - new Date(last_position.recorded_at).getTime()) / 60000) : null;

  const viewerVehicle = useMemo<FleetVehicle>(() => {
    const base = getFleetVehicleById(vehicle?.make || vehicle?.type || 'truck');
    return {
      ...base,
      id: vehicle?.id || id || 'vehicle',
      name: vehicle?.name || 'Vehicle',
      plate_number: vehicle?.plate_number || 'No plate',
      make: vehicle?.make || base.make,
      model: vehicle?.model || base.model,
      year: vehicle?.year || base.year,
      status: (vehicle?.status || 'ACTIVE') as any,
      specs: {
        ...base.specs,
        mileageKm: vehicle?.mileage_km ?? base.specs.mileageKm,
        currentSpeedKmh: last_position?.speed ?? 0,
        loadCapacityPct: active_trip?.load_capacity_pct ?? 0,
      },
      driver: {
        id: driver?.id || 'unassigned',
        name: driver?.name || 'Unassigned',
        phone: driver?.phone || 'No phone recorded',
        licenseNo: 'Commercial License',
        sinceYear: 2023,
        rating: 5.0,
      },
      activeTrip: active_trip ? {
        id: 'active-trip',
        loadId: 'TRP',
        origin: active_trip.origin || 'Origin not specified',
        destination: active_trip.destination || 'Destination not specified',
        distanceKm: 0,
        remainingKm: 0,
        timeSpent: 'En route',
        etaMinutes: 0,
        progressPct: active_trip.load_capacity_pct ?? 0,
        status: 'On Track',
        waypoints: [],
      } : base.activeTrip,
    };
  }, [id, vehicle, driver, last_position, active_trip]);

  if (loading && !detail) return <PageLoading label="Loading vehicle…" />;
  if (!detail || !vehicle) {
    return (
      <div className="freight-workspace">
        <PageHeader crumbs={['HuduFreight', 'Vehicle']} titlePlain="Vehicle" titleEm="detail" />
        <BackButton to="/tracking/vehicles" label="Back to Vehicles" />
        <Banner variant="error" title="Vehicle not found">
          {error || `Vehicle with ID "${id}" could not be found in the fleet register.`}
        </Banner>
      </div>
    );
  }
  async function resolveIssue(issueId: string) {
    await apiFetch(`/v1/tracking/issues/${issueId}/resolve`, { method: 'PATCH', body: JSON.stringify({}) });
    reload();
  }

  function startEdit() {
    if (!vehicle) return;
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
      speed_limit_kmh: vehicle.speed_limit_kmh != null ? String(vehicle.speed_limit_kmh) : '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...editForm };
      if (payload.year) payload.year = Number(payload.year);
      if (payload.mileage_km) payload.mileage_km = Number(payload.mileage_km);
      if (payload.speed_limit_kmh) payload.speed_limit_kmh = Number(payload.speed_limit_kmh);
      // Remove empty strings to avoid overwriting with blanks
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      await apiFetch(`/v1/tracking/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditing(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save vehicle');
    } finally {
      setSaving(false);
    }
  }

  const costChartData = {
    labels: cost_of_ownership.map(c => c.month),
    datasets: [
      { label: 'Fuel', data: cost_of_ownership.map(c => c.fuel), backgroundColor: chartColors.brand },
      { label: 'Service', data: cost_of_ownership.map(c => c.service), backgroundColor: chartColors.warning },
      { label: 'Other', data: cost_of_ownership.map(c => c.other), backgroundColor: chartColors.neutral },
    ],
  };

  const addActions: { key: string; label: string; icon: IconName }[] = [
    { key: 'assignment', label: 'Assignment', icon: 'user' },
    { key: 'fuel', label: 'Fuel', icon: 'activity' },
    { key: 'expense', label: 'Expense', icon: 'dollarSign' },
    { key: 'service', label: 'Service', icon: 'clipboardList' },
    { key: 'issue', label: 'Issue', icon: 'alertTriangle' },
    { key: 'inspection', label: 'Inspection', icon: 'tasks' },
    { key: 'workorder', label: 'Work order', icon: 'tool' },
    { key: 'reminder', label: 'Reminder', icon: 'bell' },
    { key: 'renewal', label: 'Renewal', icon: 'refresh' },
    { key: 'meter', label: 'Meter', icon: 'barChart2' },
  ];
  const createdEntry = searchParams.get('created');
  const createdLabel = addActions.find(action => action.key === createdEntry)?.label.replace(/^Add /, '') || 'Entry';

  return (
    <div className="freight-workspace">{error && <Banner variant="error">{error}</Banner>}
      <PageHeader
        crumbs={['HuduFreight', 'Vehicle']}
        titlePlain="Vehicle"
        titleEm="detail"
      />
      <BackButton to="/tracking/vehicles" label="Back to Vehicles" />

      {createdEntry && (
        <Banner
          variant="success"
          title={`${createdLabel} saved`}
          onDismiss={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('created');
            setSearchParams(next, { replace: true });
          }}
          style={{ marginBottom: 16 }}
        >
          The vehicle record has been updated successfully.
        </Banner>
      )}

      <div className="vdetail-hero">
        <div className="vdetail-hero-left">
          <div className="vdetail-hero-avatar">
            {vehicle.photo_url ? (
              <img
                src={vehicle.photo_url}
                alt={vehicle.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : viewerVehicle?.photoUrl ? (
              <img
                src={viewerVehicle.photoUrl}
                alt={`${vehicle.name} (Model)`}
                title="Stock asset model representation"
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Icon name="truck" size={28} color="var(--teal)" />
            )}
            {!vehicle.photo_url && viewerVehicle?.photoUrl && (
              <span style={{
                position: 'absolute',
                bottom: 2,
                right: 4,
                fontSize: 9,
                fontWeight: 700,
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                padding: '1px 3px',
                borderRadius: 2,
              }}>MODEL</span>
            )}
          </div>
          <div className="vdetail-hero-meta">
            <div className="vdetail-hero-title-row">
              <span className="vdetail-hero-name">{vehicle.name}</span>
              <Badge variant={vehicle.status === 'ACTIVE' || vehicle.status === 'ON_ROUTE' ? 'success' : 'gray'}>
                {vehicle.status === 'ON_ROUTE' ? 'On Route' : vehicle.status}
              </Badge>
              {viewerVehicle?.category && (
                <span className="vdetail-category-pill">
                  {viewerVehicle.category}
                </span>
              )}
            </div>
            <div className="vdetail-hero-specs">
              <span>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.type}</span>
              <span>·</span>
              <span>{vehicle.plate_number || 'No plate'}</span>
              <span>·</span>
              <span>{vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : 'No mileage recorded'}</span>
            </div>
          </div>
        </div>

        <div className="vdetail-hero-actions">
          <Button variant="outline" asChild>
            <Link to={`/tracking/cargo-loading?vehicle=${encodeURIComponent(id || '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="package" size={14} /> 3D Cargo Planner
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button">
                <Icon name="plus" size={15} /> Add <Icon name="chevronDown" size={12} />
              </Button>
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

      <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSearchParams(v === 'Overview' ? {} : { tab: v }, { replace: true }); }} variant="segmented" className="vdetail-tabs-root">
        <TabsList className="vehicle-detail-tabs-list">
          {TABS.map(t => (
            <TabsTrigger key={t} value={t} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'Overview' && (
        <div className="freight-overview-grid">
          <SectionCard title="All Fields Details" action={
            !editing ? (
              <Button variant="ghost" type="button" onClick={startEdit}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }} data-ui-native-button="">
                <Icon name="edit" size={13} /> Edit
              </Button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" type="button" onClick={() => setEditing(false)}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">Cancel</Button>
                <Button variant="ghost" type="button" onClick={saveEdit} disabled={saving}
                  style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--primary-foreground))', background: 'hsl(var(--primary))', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py-xs) 12px', cursor: 'pointer', opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )
          }>
            {(editing ? [
              ['name', 'Name'], ['mileage_km', 'Meter (km)'], ['status', 'Status'], ['group_name', 'Group'],
              ['type', 'Type'], ['fuel_type', 'Fuel'], ['vin', 'VIN/SN'], ['plate_number', 'License Plate'],
              ['year', 'Year'], ['make', 'Make'], ['model', 'Model'], ['trim', 'Trim'],
              ['color', 'Color'], ['ownership', 'Ownership'], ['speed_limit_kmh', 'Speed Limit (km/h)'],
            ] as [string, string][] : [
              ['Name', vehicle.name], ['Meter', vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : '—'],
              ['Status', vehicle.status], ['Group', vehicle.group_name || 'No Group'], ['Operator', driver?.name ?? '—'], ['Type', vehicle.type],
              ['Fuel', vehicle.fuel_type || '—'],
              ['VIN/SN', vehicle.vin || '—'], ['License Plate', vehicle.plate_number || '—'],
              ['Year', vehicle.year ?? '—'], ['Make', vehicle.make || '—'], ['Model', vehicle.model || '—'],
              ['Trim', vehicle.trim || '—'], ['Color', vehicle.color || '—'], ['Ownership', vehicle.ownership],
              ['Speed Limit', vehicle.speed_limit_kmh != null ? `${vehicle.speed_limit_kmh} km/h` : '—'],
              ['Device ID', vehicle.device_id],
            ] as [string, any][]).map(([k, v]) => (
              <div key={k as string} className={`vdetail-field-row ${editing ? 'is-editing' : ''}`}>
                <span className="vdetail-field-key">{editing ? v : k}</span>
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
                      <Input value={editForm[k] || ''} list="vdetail-make-options" title="Make" placeholder="e.g. Isuzu"
                        onChange={e => setEditForm({ ...editForm, make: e.target.value, model: '' })}
                        style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                      <datalist id="vdetail-make-options">{makes.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : k === 'model' ? (
                    <>
                      <Input value={editForm[k] || ''} list="vdetail-model-options" disabled={!editForm.make} title="Model" placeholder="e.g. NPR"
                        onChange={e => setEditForm({ ...editForm, model: e.target.value })}
                        style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                      <datalist id="vdetail-model-options">{models.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : (
                    <Input value={editForm[k] || ''} onChange={e => setEditForm({ ...editForm, [k]: e.target.value })}
                      type={k === 'year' || k === 'mileage_km' ? 'number' : 'text'}
                      style={{ flex: 1, maxWidth: 220, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--white)', color: 'var(--ink)' }} />
                  )
                ) : (
                  <span className="vdetail-field-val">{v}</span>
                )}
              </div>
            ))}
          </SectionCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionCard title="Cost of Ownership" action={
              <div style={{ textAlign: 'right' }}>
                <div style={statLabel}>Total costs</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{total_cost.toLocaleString()}</div>
              </div>
            }>
              {cost_per_km != null && <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>Cost per km: <strong>{cost_per_km}</strong></div>}
              <div style={{ height: 180 }}>
                {cost_of_ownership.length > 0
                  ? <Bar data={costChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true } } }} />
                  : <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>No cost data yet.</div>}
              </div>
            </SectionCard>

            <SectionCard title="Service Reminders">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><div style={statLabel}>Overdue</div><div style={{ fontSize: 20, fontWeight: 800, color: service_reminders.overdue > 0 ? 'var(--red)' : 'var(--ink)' }}>{service_reminders.overdue}</div></div>
                <div><div style={statLabel}>Due Soon</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{service_reminders.due_soon}</div></div>
                <div><div style={statLabel}>Dismissed</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{service_reminders.dismissed}</div></div>
              </div>
              {reminders.filter(r => r.status === 'PENDING').slice(0, 5).map(r => (
                <div key={r.id} style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border)', color: 'var(--ink2)' }}>
                  {r.title} — due {new Date(r.due_date).toLocaleDateString()}
                </div>
              ))}
            </SectionCard>
          </div>

          <SectionCard title="Last Known Location">
            {last_position ? (
              <div style={{ height: 200, borderRadius: 'var(--r)', overflow: 'hidden' }}>
                <MapContainer center={[last_position.latitude, last_position.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
                  <MapTileLayer />
                  <Marker position={[last_position.latitude, last_position.longitude]} icon={vehicleMapMarker} />
                </MapContainer>
              </div>
            ) : <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No GPS position recorded yet.</div>}
          </SectionCard>

          <SectionCard title="Live Status">
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
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                      <div style={{ width: `${active_trip.load_capacity_pct}%`, height: '100%', background: 'var(--teal)' }} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>No active trip — not currently hauling cargo.</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{last_position?.speed ?? 0}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>km/h</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{last_position?.battery_pct != null ? `${last_position.battery_pct}%` : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--ink3)', textTransform: 'uppercase' }}>Battery</div>
              </div>
            </div>

            <div style={statLabel}>Status Overview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              <span>Ignition {last_position?.ignition ?? '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: (last_position?.speed ?? 0) > 3 ? 'var(--green)' : 'var(--red)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                {(last_position?.speed ?? 0) > 3 ? 'Moving' : 'Stopped'}
              </span>
            </div>

            <div style={statLabel}>Location Data</div>
            <div style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink2)' }}>
              {last_position ? (
                <>
                  <div style={{ fontFamily: 'var(--font)' }}>{last_position.latitude.toFixed(5)}, {last_position.longitude.toFixed(5)}</div>
                  <div style={{ color: 'var(--ink3)', marginTop: 2 }}>Updated {minutesAgo != null ? `${minutesAgo}m ago` : '—'} · Heading {last_position.heading ?? '—'}°</div>
                </>
              ) : <div style={{ color: 'var(--ink3)' }}>No telemetry yet.</div>}
            </div>
          </SectionCard>

          <SectionCard title="Connected Shipment Job" action={
            active_trip?.shipment_ref ? (
              <Badge variant="brand">{active_trip.shipment_ref}</Badge>
            ) : undefined
          }>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14 }}>
              {active_trip?.shipment_id
                ? `Linked to Commercial Clearance Job #${active_trip.shipment_ref || active_trip.shipment_id.slice(0, 8)} across Hudumika.`
                : 'Direct Road Transport Job. A shipment remains one connected job across Hudumika apps.'}
            </div>
            <div className="vdetail-connected-grid">
              <Link
                to={active_trip?.shipment_id ? `/clearos/ops?shipment=${encodeURIComponent(active_trip.shipment_id)}` : '/clearos/ops'}
                className="vdetail-connected-item"
              >
                <Icon name="briefcase" size={15} color="var(--teal)" />
                <span>ClearOS Clearance</span>
              </Link>
              <Link
                to="/cargotracker/track"
                className="vdetail-connected-item"
              >
                <Icon name="anchor" size={15} color="var(--teal)" />
                <span>CargoTracker</span>
              </Link>
              <Link
                to="/seal/fulfillment"
                className="vdetail-connected-item"
              >
                <Icon name="archive" size={15} color="var(--teal)" />
                <span>SEAL Release</span>
              </Link>
              <Link
                to={`/tracking/cargo-loading?vehicle=${encodeURIComponent(vehicle.id)}`}
                className="vdetail-connected-item"
              >
                <Icon name="package" size={15} color="var(--teal)" />
                <span>Cargo Loading</span>
              </Link>
              <Link
                to="/finance/delivery-documents"
                className="vdetail-connected-item"
              >
                <Icon name="fileText" size={15} color="var(--teal)" />
                <span>Delivery Notes</span>
              </Link>
              <Link
                to="/finance/invoices"
                className="vdetail-connected-item"
              >
                <Icon name="dollarSign" size={15} color="var(--teal)" />
                <span>FinOps Invoices</span>
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Open Issues" action={
            <div style={{ textAlign: 'right' }}><div style={statLabel}>Open</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{open_issues.length}</div></div>
          }>
            {open_issues.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No open issues.</div>}
            {open_issues.map(i => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <Icon name="alertTriangle" size={14} color="var(--red)" />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{i.title}</div>
                <Button variant="ghost" type="button" onClick={() => { void resolveIssue(i.id).catch(e => setError(e.message)); }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }} data-ui-native-button="">Resolve</Button>
              </div>
            ))}
          </SectionCard>
        </div>
      )}

      {tab === 'Service History' && (
        <SectionCard>
          <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
          </ResponsiveTable>
          {maintenance.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No service history yet.</div>}
        </SectionCard>
      )}

      {tab === 'Fuel' && (
        <SectionCard>
          <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
          </ResponsiveTable>
          {fuel.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No fuel entries yet.</div>}
        </SectionCard>
      )}

      {tab === 'Documents' && (
        <SectionCard>
          <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
          </ResponsiveTable>
          {documents.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No documents on file. Registration, insurance &amp; renewal records live here — add them from the Documents &amp; Insurance page.</div>}
        </SectionCard>
      )}

      {tab === 'Issues' && (
        <SectionCard>
          {(detail?.issues || []).length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No issues reported.</div>}
          {(detail?.issues || []).map((i: Issue) => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <Badge variant={i.status === 'RESOLVED' ? 'success' : 'error'}>{i.status}</Badge>
              <Link to={`/tracking/issues/${i.id}`} style={{ flex: 1, fontSize: 13, color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}>
                {i.title}
              </Link>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(i.created_at).toLocaleDateString()}</div>
              {i.status !== 'RESOLVED' && <Button variant="ghost" type="button" onClick={() => { void resolveIssue(i.id).catch(e => setError(e.message)); }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }} data-ui-native-button="">Resolve</Button>}
            </div>
          ))}
        </SectionCard>
      )}

      {tab === '3D Schematics & Loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SectionCard title="3D 360° Rotatable Loading Schematics & Telemetry">
            <div className="vdetail-3d-stage">
              <Truck3DViewer vehicle={viewerVehicle} />
            </div>
          </SectionCard>

          <TruckLoadOverview
            manifest={{
              id: `mnf-${viewerVehicle.id}`,
              name: `${vehicle.name} Loading Plan`,
              container_length_cm: viewerVehicle.specs.containerLengthCm,
              container_width_cm: viewerVehicle.specs.containerWidthCm,
              container_height_cm: viewerVehicle.specs.containerHeightCm,
              max_weight_kg: viewerVehicle.specs.maxWeightKg,
              status: active_trip ? 'DISPATCHED' : 'APPROVED',
              vehicle_id: vehicle.id,
              vehicle_plate: vehicle.plate_number || viewerVehicle.plate_number,
              vehicle_name: vehicle.name,
              origin: active_trip?.origin || viewerVehicle.activeTrip?.origin,
              destination: active_trip?.destination || viewerVehicle.activeTrip?.destination,
            }}
            items={(viewerVehicle.cargoItems || []).map((c: any) => ({
              id: c.id,
              label: c.label,
              length_cm: c.length_cm,
              width_cm: c.width_cm,
              height_cm: c.height_cm,
              weight_kg: c.weight_kg,
              quantity: c.quantity,
              color: c.color,
              placements: c.placements,
            }))}
          />
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
    <SectionCard>
      <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
      </ResponsiveTable>
      {expenses.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No expenses logged yet.</div>}
    </SectionCard>
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
    <SectionCard title="Driver Assignments History">
      <ResponsiveTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                  <PersonAvatar userId={a.driver_id} kind="drivers" name={a.driver_name} size={24} />
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
      </ResponsiveTable>
      {assignments.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No driver assignments recorded.</div>}
    </SectionCard>
  );
}

// Compact reuse of the standalone Cargo Loading page's manifest+pack UI,
// scoped to this one vehicle. Entitlement is enforced backend-side same as
// the standalone page — this tab just shows an inline upgrade message scoped
// to its own content instead of blocking the whole vehicle-detail page.
function VehicleLoadPlanTab({ vehicleId }: { vehicleId: string }) {
  return <SectionCard title="Vehicle load plans" collapsible={false}><p className="freight-note">Create, pack, approve and dispatch this vehicle's loads in the shared cargo workspace.</p><Button asChild><Link to={`/tracking/cargo-loading?vehicle=${encodeURIComponent(vehicleId)}`}>Open load plans</Link></Button></SectionCard>;
}
