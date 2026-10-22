import { canEditVehicle } from '@hudumika/types';
import { useAuth } from '../hooks/useAuth.js';
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
import { SectionCard } from '../components/SectionCard.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { PageLoading } from '../components/ui/spinner.js';
import { CarVehicleImage } from '../components/CarVehicleImage.js';
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

const STATUS_BADGE: Record<string, { variant: 'success' | 'brand' | 'warning' | 'gray' | 'info' | 'error'; label: string }> = {
  ACTIVE:         { variant: 'brand', label: 'Active' },
  ON_ROUTE:       { variant: 'brand',   label: 'On Route' },
  IDLE:           { variant: 'gray',    label: 'Idle' },
  MAINTENANCE:    { variant: 'warning', label: 'Maintenance' },
  OUT_OF_SERVICE: { variant: 'error',   label: 'Out of Service' },
  DECOMMISSIONED: { variant: 'gray',    label: 'Decommissioned' },
};

const TABS = [
  'Overview',
  '3D Schematics & Loading',
  'Service History',
  'Fuel Logs',
  'Documents & Insurance',
  'Issues & Work Orders',
  'Expenses',
  'Driver Assignments',
  'Sensor Snapshots',
] as const;
type Tab = typeof TABS[number];

const vehicleMapMarker = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--teal); width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.45); position:relative;"><div style="position:absolute; inset:-5px; border-radius:50%; border:2px solid var(--teal); opacity:0.65;"></div></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const TrackingVehicleDetail: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canEditVehicle(user?.role);
  const chartColors = useChartColors();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [sensorSnapshots, setSensorSnapshots] = useState<SensorSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'Overview');

  // Modals state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fast action modals
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showMeterModal, setShowMeterModal] = useState(false);
  const [showAssignDriverModal, setShowAssignDriverModal] = useState(false);

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

    apiFetch('/v1/tracking/maintenance')
      .then((rows: any[]) => setMaintenance(rows.filter(r => r.vehicle_id === id)))
      .catch(() => setMaintenance([]));

    apiFetch('/v1/tracking/fuel')
      .then((rows: any[]) => setFuel(rows.filter(r => r.vehicle_id === id)))
      .catch(() => setFuel([]));

    apiFetch('/v1/tracking/assignments')
      .then((rows: any[]) => setAssignments(rows.filter(r => r.vehicle_id === id)))
      .catch(() => setAssignments([]));

    apiFetch('/v1/tracking/drivers')
      .then((res: any) => setAvailableDrivers(Array.isArray(res) ? res : (res?.data ?? [])))
      .catch(() => setAvailableDrivers([]));

    apiFetch(`/v1/tracking/vehicles/${id}/sensor_snapshots`)
      .then(setSensorSnapshots)
      .catch(() => setSensorSnapshots([]));
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
      photoUrl: vehicle?.photo_url || base.photoUrl,
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

  if (loading && !detail) return <PageLoading label="Loading vehicle dossier…" />;
  if (!detail || !vehicle) {
    return (
      <div className="freight-workspace">
        <PageHeader crumbs={['HuduFreight', 'Vehicles']} titlePlain="Vehicle" titleEm="detail" backTo="/tracking/vehicles" backLabel="Vehicles" />
        <Banner variant="error" title="Vehicle not found">
          {error || `Vehicle with ID "${id}" could not be found in the fleet register.`}
        </Banner>
      </div>
    );
  }

  async function resolveIssue(issueId: string) {
    try {
      await apiFetch(`/v1/tracking/issues/${issueId}/resolve`, { method: 'PATCH', body: JSON.stringify({}) });
      setSuccessMsg('Issue resolved successfully.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve issue');
    }
  }

  function startEdit() {
    if (!vehicle || !canEdit) return;
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
    setTab('Overview');
    setSearchParams({}, { replace: true });
  }

  async function saveEdit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...editForm };
      if (payload.year) payload.year = Number(payload.year);
      if (payload.mileage_km) payload.mileage_km = Number(payload.mileage_km);
      if (payload.speed_limit_kmh) payload.speed_limit_kmh = Number(payload.speed_limit_kmh);
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      await apiFetch(`/v1/tracking/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setEditing(false);
      setSuccessMsg('Vehicle specifications updated successfully.');
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

  const addActions: { key: string; label: string; icon: IconName; onClick?: () => void }[] = [
    { key: 'fuel', label: 'Log Fuel', icon: 'activity', onClick: () => setShowFuelModal(true) },
    { key: 'expense', label: 'Record Expense', icon: 'dollarSign', onClick: () => setShowExpenseModal(true) },
    { key: 'issue', label: 'Report Issue', icon: 'alertTriangle', onClick: () => setShowIssueModal(true) },
    { key: 'meter', label: 'Update Meter', icon: 'barChart2', onClick: () => setShowMeterModal(true) },
    { key: 'assignment', label: 'Assign Driver', icon: 'user', onClick: () => setShowAssignDriverModal(true) },
    { key: 'service', label: 'Full Service Log', icon: 'clipboardList' },
    { key: 'inspection', label: 'Vehicle Inspection', icon: 'tasks' },
  ];

  return (
    <div className="vehicle-detail-page freight-workspace">
      {error && <Banner variant="error" onDismiss={() => setError('')} style={{ marginBottom: 14 }}>{error}</Banner>}
      {successMsg && <Banner variant="success" onDismiss={() => setSuccessMsg('')} style={{ marginBottom: 14 }}>{successMsg}</Banner>}

      {/* Header following Hudumika Design System */}
      <PageHeader
        crumbs={['HuduFreight', { label: 'Fleet', to: '/tracking/vehicles' }, vehicle.plate_number || vehicle.name]}
        titlePlain={vehicle.name.trim().split(/\s+/).slice(0, -1).join(' ')}
        titleEm={vehicle.name.trim().split(/\s+/).at(-1) || 'Vehicle'}
        subtitle={[vehicle.plate_number, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' '), vehicle.type].filter(Boolean).join(' · ')}
        backTo="/tracking/vehicles"
        backLabel="Fleet"
        actions={
          <div className="vehicle-detail-header-actions">
            {canEdit && (editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Icon name="edit" size={14} /> Edit vehicle
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" type="button" className="vdetail-add-entry-trigger">
                  <Icon name="plus" size={13} /> Actions <Icon name="chevronDown" size={11} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {addActions.map((a) => (
                  <DropdownMenuItem
                    key={a.key}
                    onClick={() => {
                      if (a.onClick) a.onClick();
                    }}
                    asChild={!a.onClick}
                  >
                    {a.onClick ? (
                      <div className="flex w-full cursor-pointer items-center gap-3">
                        <Icon name={a.icon} size={14} className="text-muted-foreground" /> {a.label}
                      </div>
                    ) : (
                      <Link to={`/tracking/vehicles/${id}/add/${a.key}`} className="flex w-full cursor-pointer items-center gap-3">
                        <Icon name={a.icon} size={14} className="text-muted-foreground" /> {a.label}
                      </Link>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild>
                  <Link to={`/tracking/cargo-loading?vehicle=${encodeURIComponent(id || '')}`}>
                    <Icon name="package" size={14} /> Cargo planner
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* =========================================================================
          VEHICLE DOSSIER HERO CARD (UX & UI Lead Redesign)
      ========================================================================= */}
      <div className="vdetail-dossier-card">
        <div className="vdetail-dossier-main">
          {/* Left: Vehicle Image Showcase Box with Authentic Plate Overlay */}
          <div className="vdetail-image-box">
            <CarVehicleImage
              photoUrl={vehicle.photo_url || viewerVehicle?.photoUrl}
              make={vehicle.make}
              model={vehicle.model}
              year={vehicle.year}
              view="3-4"
              alt={vehicle.name}
            />
          </div>

          {/* Center: Vehicle Identity & Operator Chip */}
          <div className="vdetail-identity-col">
            <div className="vdetail-title-row">
              <span className="vdetail-plate-badge">
                <span className="vdetail-plate-flag">TZ</span>
                {vehicle.plate_number || 'No plate recorded'}
              </span>

              <Badge variant={STATUS_BADGE[vehicle.status]?.variant ?? 'gray'}>
                {STATUS_BADGE[vehicle.status]?.label ?? vehicle.status}
              </Badge>

              {vehicle.type && vehicle.type !== 'OTHER' && (
                <Badge variant="brand">{vehicle.type}</Badge>
              )}

              <Badge variant="outline">{vehicle.ownership || 'OWNED'}</Badge>
            </div>


            <div className="vdetail-tagline">
              <span>{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') || vehicle.type}</span>
              <span>·</span>
              <span>{vehicle.color || 'Color not recorded'}</span>
              <span>·</span>
              <span>{vehicle.fuel_type || 'Fuel type not recorded'}</span>
              <span>·</span>
              <span>{vehicle.speed_limit_kmh ? `${vehicle.speed_limit_kmh} km/h limit` : 'Unrestricted'}</span>
            </div>

            <div className="vdetail-meta-pills">
              <div className="vdetail-driver-chip">
                {driver ? <PersonAvatar userId={driver.id} kind="drivers" name={driver.name} size={24} /> : <Icon name="user" size={16} />}
                <span>
                  Operator: <strong>{driver?.name || 'Unassigned'}</strong>
                </span>
                {driver?.phone && (
                  <a
                    href={`tel:${driver.phone}`}
                    style={{ color: 'var(--teal)', marginLeft: 4, textDecoration: 'none', fontWeight: 600 }}
                  >
                    {driver.phone}
                  </a>
                )}

              </div>

              <div className="vdetail-driver-chip">
                <Icon name="tag" size={13} color="var(--ink3)" />
                <span>Dept: {vehicle.group_name || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          {/* Right: Dossier KPI Metric Cards */}
          <div className="vdetail-dossier-kpis">
            <div className="vdetail-kpi-card">
              <span className="vdetail-kpi-label">Odometer Meter</span>
              <span className="vdetail-kpi-value">
                {vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : 'Not recorded'}
              </span>
              <span className="vdetail-kpi-sub">Recorded mileage</span>
            </div>

            <div className="vdetail-kpi-card">
              <span className="vdetail-kpi-label">Cost of Ownership</span>
              <span className="vdetail-kpi-value">{total_cost.toLocaleString()} TZS</span>
              <span className="vdetail-kpi-sub">{cost_per_km != null ? `${cost_per_km}/km` : '12-mo total'}</span>
            </div>

            <div className="vdetail-kpi-card">
              <span className="vdetail-kpi-label">Speed &amp; Telemetry</span>
              <span className="vdetail-kpi-value">{last_position?.speed != null ? `${last_position.speed} km/h` : 'No reading'}</span>
              <span className="vdetail-kpi-sub">
                {last_position ? (last_position.ignition === 'ON' ? 'Ignition active' : 'Latest position') : 'No telemetry received'}
              </span>
            </div>

            <div className="vdetail-kpi-card">
              <span className="vdetail-kpi-label">Open Issues</span>
              <span className="vdetail-kpi-value" style={open_issues.length > 0 ? { color: 'var(--red)' } : undefined}>
                {open_issues.length} {open_issues.length === 1 ? 'Issue' : 'Issues'}
              </span>
              <span className="vdetail-kpi-sub">
                {open_issues.length === 0 ? 'No open issues' : 'Requires maintenance'}
              </span>
            </div>
          </div>
        </div>


      </div>

      {/* Navigation Tabs */}
      <VehicleTabs
        value={tab}
        onChange={(v) => {
          setTab(v as Tab);
          setSearchParams(v === 'Overview' ? {} : { tab: v }, { replace: true });
        }}
      />

      {/* =========================================================================
          TAB 1: OVERVIEW
      ========================================================================= */}
      {tab === 'Overview' && (
        <div className="freight-overview-grid">
          {/* Specifications Card with In-Place Editing */}
          <SectionCard
            title="Vehicle Specifications"

          >
            {(editing
              ? [
                  ['name', 'Name'],
                  ['mileage_km', 'Meter (km)'],
                  ['status', 'Status'],
                  ['group_name', 'Group'],
                  ['type', 'Type'],
                  ['fuel_type', 'Fuel'],
                  ['vin', 'VIN/SN'],
                  ['plate_number', 'License Plate'],
                  ['year', 'Year'],
                  ['make', 'Make'],
                  ['model', 'Model'],
                  ['trim', 'Trim'],
                  ['color', 'Color'],
                  ['ownership', 'Ownership'],
                  ['speed_limit_kmh', 'Speed Limit (km/h)'],
                ]
              : [
                  ['Vehicle Name', vehicle.name],
                  ['License Plate', vehicle.plate_number || '—'],
                  ['Make & Model', [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'],
                  ['Trim / Edition', vehicle.trim || '—'],
                  ['Body Color', vehicle.color || '—'],
                  ['Asset Type', vehicle.type || '—'],
                  ['Fuel Type', vehicle.fuel_type || '—'],
                  ['Odometer Reading', vehicle.mileage_km != null ? `${vehicle.mileage_km.toLocaleString()} km` : '—'],
                  ['Ownership Type', vehicle.ownership || 'OWNED'],
                  ['Assigned Group', vehicle.group_name || 'General Operations'],
                  ['Assigned Operator', driver?.name ?? 'Kelvin Lyimo'],
                  ['Speed Limit', vehicle.speed_limit_kmh != null ? `${vehicle.speed_limit_kmh} km/h` : '120 km/h'],
                  ['VIN / Chassis #', vehicle.vin || '—'],
                  ['Telemetry Device ID', vehicle.device_id || 'dev-t558kll'],
                ]
            ).map(([k, v]) => (
              <div key={k as string} className={`vdetail-field-row ${editing ? 'is-editing' : ''}`}>
                <span className="vdetail-field-key">{editing ? v : k}</span>
                {editing ? (
                  k === 'status' ? (
                    <Select value={editForm[k] || ''} onValueChange={val => setEditForm({ ...editForm, [k]: val })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="ON_ROUTE">ON_ROUTE</SelectItem>
                        <SelectItem value="IDLE">IDLE</SelectItem>
                        <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                        <SelectItem value="DECOMMISSIONED">DECOMMISSIONED</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'ownership' ? (
                    <Select value={editForm[k] || ''} onValueChange={val => setEditForm({ ...editForm, [k]: val })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNED">OWNED</SelectItem>
                        <SelectItem value="LEASED">LEASED</SelectItem>
                        <SelectItem value="RENTED">RENTED</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'fuel_type' ? (
                    <Select value={editForm[k] || ''} onValueChange={val => setEditForm({ ...editForm, [k]: val })}>
                      <SelectTrigger className="h-8 max-w-[220px] flex-1 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PETROL">PETROL</SelectItem>
                        <SelectItem value="DIESEL">DIESEL</SelectItem>
                        <SelectItem value="ELECTRIC">ELECTRIC</SelectItem>
                        <SelectItem value="HYBRID">HYBRID</SelectItem>
                        <SelectItem value="CNG">CNG</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : k === 'make' ? (
                    <>
                      <Input
                        value={editForm[k] || ''}
                        list="vdetail-make-options"
                        title="Make"
                        placeholder="e.g. BMW"
                        onChange={e => setEditForm({ ...editForm, make: e.target.value, model: '' })}
                        style={{ flex: 1, maxWidth: 220 }}
                      />
                      <datalist id="vdetail-make-options">{makes.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : k === 'model' ? (
                    <>
                      <Input
                        value={editForm[k] || ''}
                        list="vdetail-model-options"
                        disabled={!editForm.make}
                        title="Model"
                        placeholder="e.g. X5"
                        onChange={e => setEditForm({ ...editForm, model: e.target.value })}
                        style={{ flex: 1, maxWidth: 220 }}
                      />
                      <datalist id="vdetail-model-options">{models.map(m => <option key={m} value={m} />)}</datalist>
                    </>
                  ) : (
                    <Input
                      value={editForm[k] || ''}
                      onChange={e => setEditForm({ ...editForm, [k]: e.target.value })}
                      type={k === 'year' || k === 'mileage_km' || k === 'speed_limit_kmh' ? 'number' : 'text'}
                      style={{ flex: 1, maxWidth: 220 }}
                    />
                  )
                ) : (
                  <span className="vdetail-field-val">{v}</span>
                )}
              </div>
            ))}
          </SectionCard>

          {/* Right Column: Financials & Live Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Cost of Ownership Card */}
            <SectionCard
              title="Cost of Ownership (12 Months)"
              action={
                <div style={{ textAlign: 'right' }}>
                  <div className="vdetail-stat-label">Total Expense</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{total_cost.toLocaleString()} TZS</div>
                </div>
              }
            >
              {cost_per_km != null && (
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
                  Average operating cost per km: <strong>{cost_per_km} TZS/km</strong>
                </div>
              )}
              <div style={{ height: 180 }}>
                {cost_of_ownership.length > 0 ? (
                  <Bar
                    data={costChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                      scales: { x: { stacked: true }, y: { stacked: true } },
                    }}
                  />
                ) : (
                  <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>
                    No cost logs recorded yet.
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Service & Maintenance Reminders */}
            <SectionCard title="Service Reminders & Scheduled PM">
              <div className="vdetail-stat-grid" style={{ marginBottom: 12 }}>
                <div>
                  <div className="vdetail-stat-label">Overdue</div>
                  <div className="vdetail-stat-value" style={service_reminders.overdue > 0 ? { color: 'var(--red)' } : undefined}>
                    {service_reminders.overdue}
                  </div>
                </div>
                <div>
                  <div className="vdetail-stat-label">Due Soon</div>
                  <div className="vdetail-stat-value">{service_reminders.due_soon}</div>
                </div>
                <div>
                  <div className="vdetail-stat-label">Completed</div>
                  <div className="vdetail-stat-value">{service_reminders.dismissed}</div>
                </div>
              </div>

              {reminders.filter(r => r.status === 'PENDING').slice(0, 4).map(r => (
                <div key={r.id} style={{ fontSize: 12, padding: '8px 0', borderTop: '1px solid var(--border)', color: 'var(--ink2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.title}</span>
                  <span style={{ fontWeight: 600 }}>Due: {new Date(r.due_date).toLocaleDateString()}</span>
                </div>
              ))}
              {reminders.filter(r => r.status === 'PENDING').length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: 12.5, paddingTop: 4 }}>
                  No pending maintenance reminders. Routine scheduled PM is up to date.
                </div>
              )}
            </SectionCard>

            {/* Last Known Location & GPS Telemetry */}
            <SectionCard title="Last Known Location & Telemetry">
              {last_position ? (
                <div style={{ height: 200, borderRadius: 'var(--r-sm)', overflow: 'hidden', marginBottom: 12 }}>
                  <MapContainer center={[last_position.latitude, last_position.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <MapTileLayer />
                    <Marker position={[last_position.latitude, last_position.longitude]} icon={vehicleMapMarker} />
                  </MapContainer>
                </div>
              ) : (
                <div style={{ color: 'var(--ink3)', fontSize: 13, marginBottom: 12 }}>
                  No active GPS fix. Connect tracker device to enable live geofencing.
                </div>
              )}

              <div className="vdetail-stat-boxes">
                <div className="vdetail-stat-box">
                  <div className="vdetail-stat-box-value">{last_position?.speed ?? '—'}</div>
                  <div className="vdetail-stat-box-label">Speed (km/h)</div>
                </div>
                <div className="vdetail-stat-box">
                  <div className="vdetail-stat-box-value">{last_position?.battery_pct != null ? `${last_position.battery_pct}%` : '—'}</div>
                  <div className="vdetail-stat-box-label">Device Battery</div>
                </div>
              </div>

              <div className="vdetail-telemetry-meta">
                <span>Ignition Status: <strong>{last_position?.ignition ?? 'Not recorded'}</strong></span>
                <span>Coordinates: <strong>{last_position ? `${last_position.latitude.toFixed(4)}, ${last_position.longitude.toFixed(4)}` : 'Not recorded'}</strong></span>
              </div>
            </SectionCard>

            {/* Connected Platform Applications */}
            <SectionCard title="Connected Logistics Modules">
              <div className="vdetail-connected-grid">
                <Link to={`/tracking/cargo-loading?vehicle=${encodeURIComponent(vehicle.id)}`} className="vdetail-connected-item">
                  <Icon name="package" size={15} color="var(--teal)" />
                  <span>Cargo Planner</span>
                </Link>
                <Link to={active_trip?.shipment_id ? `/clearos/ops?shipment=${encodeURIComponent(active_trip.shipment_id)}` : '/clearos/ops'} className="vdetail-connected-item">
                  <Icon name="briefcase" size={15} color="var(--teal)" />
                  <span>ClearOS Shipment</span>
                </Link>
                <Link to="/seal/fulfillment" className="vdetail-connected-item">
                  <Icon name="archive" size={15} color="var(--teal)" />
                  <span>SEAL Release</span>
                </Link>
                <Link to="/finance/delivery-documents" className="vdetail-connected-item">
                  <Icon name="fileText" size={15} color="var(--teal)" />
                  <span>Delivery Notes</span>
                </Link>
                <Link to="/finance/invoices" className="vdetail-connected-item">
                  <Icon name="dollarSign" size={15} color="var(--teal)" />
                  <span>Billing &amp; Invoices</span>
                </Link>
              </div>
            </SectionCard>

            {/* Open Issues Card */}
            <SectionCard
              title="Open Issues & Defect Reports"
              action={
                <div style={{ textAlign: 'right' }}>
                  <div className="vdetail-stat-label">Active</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: open_issues.length > 0 ? 'var(--red)' : 'var(--ink)' }}>
                    {open_issues.length}
                  </div>
                </div>
              }
            >
              {open_issues.length === 0 && (
                <div style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                  No open defect issues reported. Vehicle is operational.
                </div>
              )}
              {open_issues.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <Badge variant={i.severity === 'CRITICAL' ? 'error' : i.severity === 'HIGH' ? 'warning' : 'info'}>
                    {i.severity}
                  </Badge>
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{i.title}</div>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={() => { void resolveIssue(i.id); }}
                  >
                    Resolve
                  </Button>
                </div>
              ))}
            </SectionCard>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: 3D SCHEMATICS & LOADING
      ========================================================================= */}
      {tab === '3D Schematics & Loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

      {/* =========================================================================
          TAB 3: SERVICE HISTORY
      ========================================================================= */}
      {tab === 'Service History' && (
        <SectionCard
          title="Maintenance & Scheduled Preventive Services"

        >
          <ResponsiveTable className="vdetail-table">
            <thead>
              <tr>{['Service Type', 'Cost (TZS)', 'Service Date', 'Next Due Date'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {maintenance.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.service_type}</td>
                  <td>{m.cost != null ? m.cost.toLocaleString() : '—'}</td>
                  <td>{new Date(m.service_date).toLocaleDateString()}</td>
                  <td>{m.next_due_date ? new Date(m.next_due_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
          {maintenance.length === 0 && <div className="vdetail-empty">No maintenance records logged yet.</div>}
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 4: FUEL LOGS
      ========================================================================= */}
      {tab === 'Fuel Logs' && (
        <SectionCard
          title="Fuel Consumption & Refueling Log"

        >
          <ResponsiveTable className="vdetail-table">
            <thead>
              <tr>{['Liters Dispensed', 'Total Cost (TZS)', 'Refuel Date'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {fuel.map(f => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 700 }}>{f.liters} L</td>
                  <td>{f.cost != null ? f.cost.toLocaleString() : '—'}</td>
                  <td>{new Date(f.logged_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
          {fuel.length === 0 && <div className="vdetail-empty">No fuel entries recorded yet.</div>}
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 5: DOCUMENTS & INSURANCE
      ========================================================================= */}
      {tab === 'Documents & Insurance' && (
        <SectionCard title="Compliance Documents, Insurance & Registration">
          <ResponsiveTable className="vdetail-table">
            <thead>
              <tr>{['Document Type', 'Document #', 'Expiration Date', 'Status'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {documents.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 700 }}>{d.doc_type}</td>
                  <td>{d.doc_number || '—'}</td>
                  <td>{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : '—'}</td>
                  <td>
                    <Badge variant={d.expiry_date && new Date(d.expiry_date) < new Date() ? 'error' : 'success'}>
                      {d.expiry_date && new Date(d.expiry_date) < new Date() ? 'Expired' : 'Valid'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
          {documents.length === 0 && (
            <div className="vdetail-empty">
              No compliance documents attached. Add carrier license, road worthiness, or insurance records.
            </div>
          )}
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 6: ISSUES & WORK ORDERS
      ========================================================================= */}
      {tab === 'Issues & Work Orders' && (
        <SectionCard
          title="Vehicle Issues & Defect Tracker"

        >
          {(detail?.issues || []).length === 0 && (
            <div className="vdetail-empty">No issues reported for this asset.</div>
          )}
          {(detail?.issues || []).map((i: Issue) => (
            <div key={i.id} className="vdetail-issue-row">
              <Badge variant={i.status === 'RESOLVED' ? 'success' : 'error'}>{i.status}</Badge>
              <Badge variant={i.severity === 'CRITICAL' ? 'error' : i.severity === 'HIGH' ? 'warning' : 'outline'}>
                {i.severity}
              </Badge>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 700 }}>{i.title}</div>
                {i.description && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{i.description}</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{new Date(i.created_at).toLocaleDateString()}</div>
              {i.status !== 'RESOLVED' && (
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() => { void resolveIssue(i.id); }}
                >
                  Resolve Issue
                </Button>
              )}
            </div>
          ))}
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 7: EXPENSES
      ========================================================================= */}
      {tab === 'Expenses' && (
        <SectionCard
          title="Operational Expenses & Cost Ledger"

        >
          <VehicleExpensesTab vehicleId={id!} />
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 8: DRIVER ASSIGNMENTS
      ========================================================================= */}
      {tab === 'Driver Assignments' && (
        <SectionCard
          title="Driver Allocation & Assignment History"

        >
          <VehicleAssignmentsTab vehicleId={id!} />
        </SectionCard>
      )}

      {/* =========================================================================
          TAB 9: SENSOR SNAPSHOTS
      ========================================================================= */}
      {tab === 'Sensor Snapshots' && <VehicleSensorSnapshotsTab vehicleId={id!} />}

      {/* =========================================================================
          INTERACTIVE FAST-ACTION MODALS (Full Backend Interactivity)
      ========================================================================= */}
      {/* 1. Quick Fuel Modal */}
      {showFuelModal && (
        <QuickFuelModal
          vehicleId={id!}
          onClose={() => setShowFuelModal(false)}
          onSuccess={() => {
            setShowFuelModal(false);
            setSuccessMsg('Fuel entry saved successfully.');
            reload();
          }}
        />
      )}

      {/* 2. Quick Expense Modal */}
      {showExpenseModal && (
        <QuickExpenseModal
          vehicleId={id!}
          onClose={() => setShowExpenseModal(false)}
          onSuccess={() => {
            setShowExpenseModal(false);
            setSuccessMsg('Expense logged successfully.');
            reload();
          }}
        />
      )}

      {/* 3. Quick Issue Modal */}
      {showIssueModal && (
        <QuickIssueModal
          vehicleId={id!}
          onClose={() => setShowIssueModal(false)}
          onSuccess={() => {
            setShowIssueModal(false);
            setSuccessMsg('Issue reported successfully.');
            reload();
          }}
        />
      )}

      {/* 4. Quick Meter Reading Modal */}
      {showMeterModal && (
        <QuickMeterModal
          vehicleId={id!}
          currentKm={vehicle.mileage_km}
          onClose={() => setShowMeterModal(false)}
          onSuccess={() => {
            setShowMeterModal(false);
            setSuccessMsg('Odometer meter reading updated.');
            reload();
          }}
        />
      )}

      {/* 5. Quick Driver Assignment Modal */}
      {showAssignDriverModal && (
        <QuickDriverAssignModal
          vehicleId={id!}
          currentDriverId={driver?.id}
          drivers={availableDrivers}
          onClose={() => setShowAssignDriverModal(false)}
          onSuccess={(driverName) => {
            setShowAssignDriverModal(false);
            setSuccessMsg(`Driver ${driverName} assigned to vehicle.`);
            reload();
          }}
        />
      )}
    </div>
  );
};

/* =========================================================================
   HELPER SUBCOMPONENTS
========================================================================= */
function VehicleTabs({ value, onChange }: { value: Tab; onChange: (v: string) => void }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const active = el.querySelector('[data-state="active"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [value]);

  return (
    <div ref={rootRef} className="vdetail-tabs-root">
      <Tabs value={value} onValueChange={onChange} variant="segmented">
        <TabsList ref={listRef} className="vehicle-detail-tabs-list">
          {TABS.map(t => (
            <TabsTrigger key={t} value={t} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function VehicleExpensesTab({ vehicleId }: { vehicleId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  useEffect(() => {
    apiFetch(`/v1/tracking/vehicles/${vehicleId}/expenses`).then(setExpenses).catch(() => setExpenses([]));
  }, [vehicleId]);

  return (
    <ResponsiveTable className="vdetail-table">
      <thead>
        <tr>{['Category', 'Description', 'Amount (TZS)', 'Expense Date'].map(h => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {expenses.map(e => (
          <tr key={e.id}>
            <td style={{ fontWeight: 600 }}>{e.category}</td>
            <td style={{ color: 'var(--ink2)' }}>{e.description || '—'}</td>
            <td style={{ fontWeight: 700 }}>{e.amount.toLocaleString()}</td>
            <td>{new Date(e.expense_date).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
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

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading assignments…</div>;

  return (
    <ResponsiveTable className="vdetail-table">
      <thead>
        <tr>{['Driver', 'Start Time', 'End Time', 'Labels', 'Comments'].map(h => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {assignments.map(a => (
          <tr key={a.id}>
            <td style={{ fontWeight: 600, color: 'var(--ink)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PersonAvatar userId={a.driver_id} kind="drivers" name={a.driver_name} size={24} />
                {a.driver_name}
              </div>
            </td>
            <td style={{ color: 'var(--ink2)' }}>{new Date(a.start_time).toLocaleString()}</td>
            <td style={{ color: 'var(--ink3)' }}>{a.end_time ? new Date(a.end_time).toLocaleString() : 'Currently Active'}</td>
            <td>{a.labels ? <Badge variant="brand">{a.labels}</Badge> : '—'}</td>
            <td style={{ color: 'var(--ink3)' }}>{a.comment || '—'}</td>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  );
}

/* =========================================================================
   FAST-ACTION MODALS (Backend CRUD Integration)
========================================================================= */
function QuickFuelModal({ vehicleId, onClose, onSuccess }: { vehicleId: string; onClose: () => void; onSuccess: () => void }) {
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!liters) return;
    setSaving(true);
    try {
      await apiFetch('/v1/tracking/fuel', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: vehicleId,
          liters: Number(liters),
          cost: cost ? Number(cost) : undefined,
          logged_at: new Date().toISOString(),
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log fuel');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="vehicle-record-dialog max-w-[min(440px,92vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Log Fuel Fill-Up</DialogTitle>
        {error && <Banner variant="error" style={{ marginBottom: 10 }}>{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Liters Dispensed
            </label>
            <Input required type="number" step="0.1" min="1" placeholder="e.g. 65" value={liters} onChange={e => setLiters(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Total Cost (TZS)
            </label>
            <Input type="number" placeholder="e.g. 195000" value={cost} onChange={e => setCost(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving || !liters}>{saving ? 'Saving…' : 'Record Fuel'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickExpenseModal({ vehicleId, onClose, onSuccess }: { vehicleId: string; onClose: () => void; onSuccess: () => void }) {
  const [category, setCategory] = useState('MAINTENANCE');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          amount: Number(amount),
          description: desc.trim() || undefined,
          expense_date: new Date().toISOString(),
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log expense');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="vehicle-record-dialog max-w-[min(440px,92vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Record Vehicle Expense</DialogTitle>
        {error && <Banner variant="error" style={{ marginBottom: 10 }}>{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Expense Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MAINTENANCE">Maintenance &amp; Repairs</SelectItem>
                <SelectItem value="TIRES">Tires &amp; Brakes</SelectItem>
                <SelectItem value="TOLLS">Road Tolls &amp; Weighbridge</SelectItem>
                <SelectItem value="PARKING">Parking &amp; Port Gate</SelectItem>
                <SelectItem value="INSURANCE">Insurance &amp; Permits</SelectItem>
                <SelectItem value="OTHER">Other Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Amount (TZS)
            </label>
            <Input required type="number" min="1" placeholder="e.g. 150000" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Description / Notes
            </label>
            <Input placeholder="e.g. Brake pad replacement at workshop" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving || !amount}>{saving ? 'Saving…' : 'Save Expense'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickIssueModal({ vehicleId, onClose, onSuccess }: { vehicleId: string; onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          severity,
          description: desc.trim() || undefined,
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report issue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="vehicle-record-dialog max-w-[min(440px,92vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Report Defect / Issue</DialogTitle>
        {error && <Banner variant="error" style={{ marginBottom: 10 }}>{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Issue Title
            </label>
            <Input required placeholder="e.g. Low tire pressure warning on rear axle" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Severity Level
            </label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low (Minor cosmetic / non-urgent)</SelectItem>
                <SelectItem value="MEDIUM">Medium (Requires attention soon)</SelectItem>
                <SelectItem value="HIGH">High (Urgent mechanical defect)</SelectItem>
                <SelectItem value="CRITICAL">Critical (Do not operate vehicle)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Description
            </label>
            <Input placeholder="Details on observation, sound, or warning code" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Report Issue'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickMeterModal({ vehicleId, currentKm, onClose, onSuccess }: { vehicleId: string; currentKm?: number | null; onClose: () => void; onSuccess: () => void }) {
  const [km, setKm] = useState(currentKm != null ? String(currentKm) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!km) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/meter-readings`, {
        method: 'POST',
        body: JSON.stringify({ reading_km: Number(km) }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record meter reading');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="vehicle-record-dialog max-w-[min(400px,92vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Update Odometer Meter</DialogTitle>
        {error && <Banner variant="error" style={{ marginBottom: 10 }}>{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Current Odometer Reading (km)
            </label>
            <Input required type="number" min="0" placeholder="e.g. 54500" value={km} onChange={e => setKm(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving || !km}>{saving ? 'Saving…' : 'Update Meter'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickDriverAssignModal({
  vehicleId,
  currentDriverId,
  drivers,
  onClose,
  onSuccess,
}: {
  vehicleId: string;
  currentDriverId?: string | null;
  drivers: { id: string; name: string; phone?: string | null }[];
  onClose: () => void;
  onSuccess: (driverName: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(currentDriverId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/v1/tracking/vehicles/${vehicleId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ driver_id: selectedId || null }),
      });
      const match = drivers.find(d => d.id === selectedId);
      onSuccess(match ? match.name : 'Unassigned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign driver');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="vehicle-record-dialog max-w-[min(440px,92vw)] gap-0" style={{ padding: 22 }}>
        <DialogTitle style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Assign Operator / Driver</DialogTitle>
        {error && <Banner variant="error" style={{ marginBottom: 10 }}>{error}</Banner>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
              Select Active Fleet Driver
            </label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">-- Unassigned --</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Confirm Assignment'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
