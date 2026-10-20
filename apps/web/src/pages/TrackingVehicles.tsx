import { Progress } from '../components/ui/progress.js';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { formatDistanceToNow } from 'date-fns';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import './TrackingVehicles.css';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionCard } from '../components/SectionCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Badge } from '../components/ui/badge.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu.js';

interface Vehicle {
  current_trip?: { origin: string | null; destination: string | null } | null;
  id: string; name: string; plate_number: string | null; type: string;
  driver_name: string | null; driver_phone: string | null; device_id: string; status: string;
  photo_url: string | null; current_load_pct: number | null;
  driver_id: string | null;
  make: string | null; model: string | null; dimensions: string | null; group_name: string | null;
  ownership: string | null;
  last_position: {
    latitude: number; longitude: number; speed: number | null; recorded_at: string;
  } | null;
}

interface Trailer {
  id: string; name: string; registration_number: string | null; vin: string | null;
  trailer_type: string; capacity_kg: number | null; axles: number | null;
  ownership: string; transporter_id: string | null; transporter_name: string | null;
  status: string; current_trip: { vehicle_id: string; destination: string | null } | null;
}

interface DashboardKPIs {
  vehicles_total: number;
  trips_today: number;
  avg_delivery_minutes_today: number | null;
  on_time_pct_today: number | null;
}

// Explicit operational-use taxonomy avoids ambiguous substring matches such
// as a horse-towing pickup being classified as a generic commercial truck.
const CATEGORY_TYPES: Record<string, string[]> = {
  trucks: ['TRUCK', 'HEAVY_DUTY_TRUCK', 'FLATBED_TRUCK', 'BOX_TRUCK', 'TANKER_TRUCK', 'FUEL_TANKER', 'REFRIGERATED_TRUCK', 'DUMP_TRUCK', 'SEMI_TRACTOR', 'RIGID_LORRY', 'TIPPER'],
  shuttle: ['PICKUP', 'SUV', 'MINIBUS', 'MINIVAN', 'VAN', 'PASSENGER_VAN', 'SHUTTLE_BUS', 'BUS', 'COACH', 'SEDAN', 'HIACE'],
  horse: ['HORSE', 'HEAVY_DUTY_PICKUP', 'HORSE_TOW_SUV', 'HORSE_LORRY', 'HORSE_VAN', 'LIVESTOCK_TRUCK', 'EQUINE_TRANSPORT'],
};

const CATEGORY_HINTS: Record<string, string> = {
  trucks: 'Flatbed, box, tanker, dump trucks, semi-trailers and rigid lorries',
  shuttle: 'SUVs, minivans and vans for shuttle or passenger transport',
  horse: 'Heavy-duty pickups, tow-rated SUVs, horse lorries and specialized livestock vans',
  other: 'Motorbikes and specialized powered assets outside the main operating categories',
};

function getCategoryForType(type: string): string {
  const u = (type || '').toUpperCase();
  for (const [cat, types] of Object.entries(CATEGORY_TYPES)) {
    if (types.includes(u)) return cat;
  }
  return 'other';
}

export function getFleetVehiclePhoto(v: { name?: string | null; make?: string | null; model?: string | null; type?: string | null; photo_url?: string | null }): string {
  if (v.photo_url && v.photo_url.trim().length > 0) return v.photo_url;
  const str = `${v.name || ''} ${v.make || ''} ${v.model || ''} ${v.type || ''}`.toLowerCase();
  if (str.includes('scania')) return '/images/freight/scania-r500.jpg';
  if (str.includes('volvo')) return '/images/freight/volvo-fh16.jpg';
  if (str.includes('transit') || str.includes('ford')) return '/images/freight/ford-transit.jpg';
  if (str.includes('canter') || str.includes('fuso') || str.includes('mitsubishi')) return '/images/freight/canter-truck.jpg';
  if (str.includes('sprinter') || str.includes('van') || str.includes('shuttle') || str.includes('hiace') || str.includes('minibus')) return '/images/freight/sprinter-van.jpg';
  if (str.includes('pickup') || str.includes('isuzu') || str.includes('hilux') || str.includes('ranger') || str.includes('horse') || str.includes('d-max')) return '/images/freight/isuzu-pickup.jpg';

  const typeUpper = (v.type || '').toUpperCase();
  if (['SEMI_TRACTOR', 'HEAVY_DUTY_TRUCK', 'FLATBED_TRUCK', 'TANKER_TRUCK', 'FUEL_TANKER'].includes(typeUpper)) return '/images/freight/volvo-fh16.jpg';
  if (['BOX_TRUCK', 'RIGID_LORRY', 'TIPPER', 'DUMP_TRUCK', 'TRUCK'].includes(typeUpper)) return '/images/freight/canter-truck.jpg';
  if (['PICKUP', 'SUV', 'EQUINE_TRANSPORT', 'HORSE_TOW_SUV', 'HORSE_LORRY'].includes(typeUpper)) return '/images/freight/isuzu-pickup.jpg';
  if (['PASSENGER_VAN', 'MINIVAN', 'SHUTTLE_BUS', 'BUS', 'COACH'].includes(typeUpper)) return '/images/freight/sprinter-van.jpg';
  return '/images/freight/volvo-fh16.jpg';
}

function formatAssetType(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

const TRAILER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', OUT_OF_SERVICE: 'error', DECOMMISSIONED: 'gray',
};

export const TrackingVehicles: React.FC = () => {
  const [params] = useSearchParams();
  const returnTo = params.get('return');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // category — page-level asset-type selector
  const [category, setCategory] = useState<string>(params.get('cat') ?? 'all');

  // vehicle-list controls
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // trailer-list controls
  const [trailerFilter, setTrailerFilter] = useState('All');
  const [trailerSearch, setTrailerSearch] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiFetch('/v1/tracking/vehicles')
        .then(res => setVehicles(Array.isArray(res) ? res : []))
        .catch(() => { setVehicles([]); setLoadError('Could not load vehicles. Try refreshing.'); }),
      apiFetch('/v1/tracking/trailers')
        .then(res => setTrailers(Array.isArray(res) ? res : []))
        .catch(() => setTrailers([])),
      apiFetch('/v1/tracking/dashboard-summary')
        .then(res => setKpis({
          vehicles_total: res?.vehicles?.total ?? 0,
          trips_today: res?.trips_today ?? 0,
          avg_delivery_minutes_today: res?.avg_delivery_minutes_today ?? null,
          on_time_pct_today: res?.on_time_pct_today ?? null,
        }))
        .catch(() => setKpis(null)),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const getDisplayStatus = (v: Vehicle) => {
    if (v.status !== 'ACTIVE') return 'Unavailable';
    if (v.current_trip) return 'On trip';
    if (v.last_position && Date.now() - Date.parse(v.last_position.recorded_at) < 15 * 60 * 1000 && (v.last_position.speed ?? 0) > 0) return 'Moving';
    return 'Active';
  };

  // ── Vehicle filtering (status + search + category)
  const vehiclesByCategory = useMemo(() => {
    if (category === 'all' || category === 'trailers') return vehicles;
    return vehicles.filter(v => getCategoryForType(v.type) === category);
  }, [vehicles, category]);

  const filteredVehicles = vehiclesByCategory.filter(v => {
    if (filter !== 'All' && getDisplayStatus(v) !== filter) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !(v.driver_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ── Trailer filtering
  const trailerStats = useMemo(() => ({
    all: trailers.length,
    active: trailers.filter(t => t.status === 'ACTIVE').length,
    inUse: trailers.filter(t => t.current_trip).length,
    maintenance: trailers.filter(t => t.status === 'MAINTENANCE' || t.status === 'OUT_OF_SERVICE').length,
  }), [trailers]);

  const filteredTrailers = trailers.filter(t => {
    if (trailerFilter === 'In use' && !t.current_trip) return false;
    if (trailerFilter === 'Maintenance' && t.status !== 'MAINTENANCE' && t.status !== 'OUT_OF_SERVICE') return false;
    if (trailerSearch) {
      const q = trailerSearch.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.registration_number || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const trailerColumns: TableColumn<Trailer>[] = [
    {
      key: 'trailer', header: 'Trailer', accessor: 'name', sortable: true,
      render: t => (
        <div>
          <Link to={`/tracking/trailers/${t.id}`} className="font-semibold text-foreground hover:text-primary">{t.name}</Link>
          <div className="mt-0.5 text-xs text-muted-foreground">{t.registration_number || 'No registration on file'}</div>
        </div>
      ),
    },
    {
      key: 'type', header: 'Type', accessor: 'trailer_type', sortable: true,
      render: t => `${t.trailer_type.replace(/_/g, ' ')}${t.axles ? ` · ${t.axles} axles` : ''}`,
    },
    {
      key: 'capacity', header: 'Capacity', accessor: 'capacity_kg', sortable: true, align: 'right', hideAt: 'sm',
      render: t => t.capacity_kg != null ? `${t.capacity_kg.toLocaleString()} kg` : '—',
    },
    {
      key: 'ownership', header: 'Ownership', accessor: 'ownership', sortable: true, hideAt: 'md',
      render: t => (
        <div>{t.ownership}{t.transporter_name && <div className="text-xs text-muted-foreground">{t.transporter_name}</div>}</div>
      ),
    },
    {
      key: 'status', header: 'Status', accessor: 'status', sortable: true,
      render: t => <Badge variant={TRAILER_STATUS_VARIANT[t.status] ?? 'gray'}>{t.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'trip', header: 'Current trip', sortable: true,
      render: t => t.current_trip ? `→ ${t.current_trip.destination || 'En route'}` : <span className="text-muted-foreground">Not coupled</span>,
    },
  ];

  // ── Pagination (vehicles only)
  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / PAGE_SIZE));
  const pagedVehicles = filteredVehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filter, search, viewMode, category]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  // ── Category counts for tab labels
  const categoryCounts = useMemo(() => ({
    all: vehicles.length,
    trucks: vehicles.filter(v => getCategoryForType(v.type) === 'trucks').length,
    shuttle: vehicles.filter(v => getCategoryForType(v.type) === 'shuttle').length,
    horse: vehicles.filter(v => getCategoryForType(v.type) === 'horse').length,
    other: vehicles.filter(v => getCategoryForType(v.type) === 'other').length,
    trailers: trailers.length,
  }), [vehicles, trailers]);

  return (
    <div className="trk-dashboard">
      <PageHeader
        crumbs={['HuduFreight', 'Fleet']}
        titlePlain="Fleet"
        titleEm="assets"
        subtitle="Manage vehicles, individually tracked horses, and towable assets in one inventory with clear operating and ownership categories."
        actions={
          <div className="trk-actions">

            <Tip label="Refresh fleet data">
              <Button variant="outline" size="icon" aria-label="Refresh fleet data" onClick={reload}><Icon name="refresh" size={16} /></Button>
            </Tip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Icon name="plus" size={15} /> Add asset</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><Link to="/tracking/vehicles/new"><Icon name="truck" size={14} /> Powered vehicle</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/tracking/trailers/new"><Icon name="box2" size={14} /> Trailer or towable</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="trk-section-header">
        <div className="trk-section-title">Performance overview</div>
        <div className="trk-section-subtitle">Last updated {kpis ? 'just now' : '…'}</div>
      </div>

      {category === 'trailers' ? (
        <MetricsRow cards={[
          { title: 'Trailers', value: String(trailerStats.all), icon: 'box2', updatedLabel: 'Registered fleet', loading },
          { title: 'Active', value: String(trailerStats.active), icon: 'checkCircle', updatedLabel: 'Available or in operation', loading },
          { title: 'In use', value: String(trailerStats.inUse), icon: 'package', updatedLabel: 'Currently coupled to a trip', loading },
          { title: 'Unavailable', value: String(trailerStats.maintenance), icon: 'alertCircle', updatedLabel: 'Maintenance or out of service', loading, empty: !loading && trailerStats.maintenance === 0 },
        ]} />
      ) : (
        <MetricsRow cards={[
          { title: 'Registered vehicles', value: kpis ? kpis.vehicles_total.toLocaleString() : '—', icon: 'truck', updatedLabel: 'Vehicles registered to this workspace', loading },
          { title: 'Trips today', value: kpis ? kpis.trips_today.toLocaleString() : '—', icon: 'package', updatedLabel: 'Scheduled to start today', loading },
          { title: 'Avg. delivery time', value: kpis?.avg_delivery_minutes_today != null ? `${Math.floor(kpis.avg_delivery_minutes_today / 60)}h ${Math.round(kpis.avg_delivery_minutes_today % 60)}m` : '—', icon: 'clock', updatedLabel: 'Trips completed today', loading, empty: !loading && kpis?.avg_delivery_minutes_today == null },
          { title: 'On-time performance', value: kpis?.on_time_pct_today != null ? `${kpis.on_time_pct_today}%` : '—', icon: 'checkCircle', updatedLabel: 'Deliveries completed on schedule today', loading, empty: !loading && kpis?.on_time_pct_today == null, emphasis: 'primary' },
        ]} />
      )}

      {loadError && (
        <div style={{ padding: '10px 16px', margin: '0 0 16px', background: 'var(--red-l)', color: 'var(--red)', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
          {loadError}
        </div>
      )}

      <div className="trk-unified-toolbar">
        <Select value={category} onValueChange={cat => { setCategory(cat); setFilter('All'); setTrailerFilter('All'); }}>
          <SelectTrigger aria-label="Asset category"><SelectValue /></SelectTrigger>
          <SelectContent>
            {([['all', 'All assets'], ['trucks', 'Trucks'], ['shuttle', 'Passenger'], ['horse', 'Horse transport'], ['other', 'Other'], ['trailers', 'Trailers']] as const).map(([value, label]) => <SelectItem key={value} value={value}>{label} ({categoryCounts[value]})</SelectItem>)}
          </SelectContent>
        </Select>
        {category !== 'trailers' && <>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Vehicle status"><SelectValue /></SelectTrigger>
            <SelectContent>{['All', 'Active', 'On trip', 'Moving', 'Unavailable'].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <SearchToolbar search={search} onSearch={setSearch} placeholder="Vehicle or driver" />
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)} variant="segmented"><TabsList><TabsTrigger value="grid" aria-label="Grid view"><Icon name="grid" size={14} /></TabsTrigger><TabsTrigger value="list" aria-label="List view"><Icon name="list" size={14} /></TabsTrigger></TabsList></Tabs>
          {returnTo && <Button type="button" variant="outline" size="sm" onClick={() => window.history.back()}><Icon name="arrowLeft" size={13} /> Back</Button>}
        </>}
      </div>

      {/* ── TRAILERS tab: full-width DataTable ── */}
      {category === 'trailers' ? (
        <div className="trk-trailers-section">
          <div className="trk-trailers-toolbar">
            <Tabs value={trailerFilter} onValueChange={setTrailerFilter}>
              <TabsList wrap>
                <TabsTrigger value="All">All ({trailerStats.all})</TabsTrigger>
                <TabsTrigger value="In use">In use ({trailerStats.inUse})</TabsTrigger>
                <TabsTrigger value="Maintenance">Maintenance ({trailerStats.maintenance})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <SearchToolbar
                search={trailerSearch}
                onSearch={setTrailerSearch}
                placeholder="Search by name or registration…"
                className="w-full lg:max-w-xs"
              />
              <Button asChild>
                <Link to="/tracking/trailers/new"><Icon name="plus" size={15} />Register trailer</Link>
              </Button>
            </div>
          </div>
          <SectionCard padded={false}>
            <DataTable
              columns={trailerColumns}
              rows={filteredTrailers}
              loading={loading}
              error={loadError ?? undefined}
              onRetry={reload}
              filteredEmpty={(!!trailerSearch || trailerFilter !== 'All') && filteredTrailers.length === 0}
              empty={!loading && trailers.length === 0}
              emptyIcon="truck"
              emptyTitle="No trailers registered"
              emptyMessage="Register a trailer to manage its documents, status and trip coupling."
              defaultSortKey="trailer"
              defaultSortDir="asc"
              pageSize={15}
            />
          </SectionCard>
        </div>
      ) : (
        /* ── VEHICLES tabs: two-column map + grid ── */
        <div className="trk-fleet-full-width">
          {/* Right Column: Fleet Grid */}
          <div>
            {loading ? (
              <SectionLoading label="Loading fleet data…" />
            ) : viewMode === 'grid' ? (
              <div className="trk-vehicles-grid">
                {pagedVehicles.map(v => {
                  const status = getDisplayStatus(v);
                  const photo = getFleetVehiclePhoto(v);
                  const hasGps = !!(v.last_position && Number.isFinite(v.last_position.latitude));
                  return (
                    <Link to={`/tracking/vehicles/${v.id}`} key={v.id} className="trk-vcard">
                      <div className="trk-vcard-top">
                        <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                          <div className="trk-vcard-title">{v.name}</div>
                          <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {v.ownership && v.ownership !== 'OWNED' && <Badge variant="info">{v.ownership}</Badge>}
                          <Badge variant={status === 'Unavailable' ? 'gray' : status === 'On trip' || status === 'Moving' ? 'success' : 'info'}>{status}</Badge>
                        </div>
                      </div>
                      <div className="trk-vcard-img-container">
                        <img
                          src={photo}
                          alt={v.name}
                          className="trk-vcard-img"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/images/freight/volvo-fh16.jpg';
                          }}
                        />
                        <div className="trk-vcard-telemetry">
                          <span className={`trk-telemetry-dot ${hasGps ? 'active' : 'offline'}`} />
                          <span>
                            {hasGps
                              ? (v.last_position!.speed != null && v.last_position!.speed > 0
                                ? `${Math.round(v.last_position!.speed)} km/h`
                                : 'GPS Active')
                              : 'Telemetry standby'}
                          </span>
                        </div>
                      </div>
                      <div className="trk-vcard-specs">
                        <div className="trk-spec-line">
                          <span>Asset type:</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatAssetType(v.type)}</span>
                        </div>
                        <div className="trk-spec-line">
                          <span>Brand/Model:</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v.make || 'Unknown'} {v.model || ''}</span>
                        </div>
                        <div className="trk-spec-line">
                          <span>Dimensions:</span>
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{v.dimensions || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="trk-vcard-driver-sec">
                        <div className="trk-vcard-label">Assigned Driver</div>
                        <div className="trk-vcard-driver">
                          <div className="trk-vcard-driver-info">
                            <PersonAvatar userId={v.driver_id} kind="drivers" name={v.driver_name || 'Unassigned'} size={24} style={{ borderRadius: '50%' }} />
                            <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                          </div>
                          <div className="trk-vcard-updated">
                            {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), { addSuffix: true }) : 'No recent pings'}
                          </div>
                        </div>
                        <div className="trk-vcard-load">
                          <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>Load capacity</span>
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.current_load_pct == null ? 'Unknown' : `${v.current_load_pct}%`}</span>
                        </div>
                        <div className="trk-vcard-load-bar-bg">
                          <div className="trk-vcard-load-bar-fill" style={{ width: `${v.current_load_pct == null ? 0 : Math.min(100, Math.max(0, v.current_load_pct))}%` }}></div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {filteredVehicles.length === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13, gridColumn: '1 / -1' }}>
                    {vehicles.length === 0 ? (
                      <>No vehicles registered yet. <Link to="/tracking/vehicles/new" style={{ color: 'var(--teal)', fontWeight: 600 }}>Add your first vehicle</Link>.</>
                    ) : 'No vehicles match the current filters.'}
                  </div>
                )}
              </div>
            ) : (
              <div className="trk-vehicles-list">
                {pagedVehicles.map(v => {
                  const status = getDisplayStatus(v);
                  const photo = getFleetVehiclePhoto(v);
                  const hasGps = !!(v.last_position && Number.isFinite(v.last_position.latitude));
                  return (
                    <Link to={`/tracking/vehicles/${v.id}`} key={v.id} className="trk-vlist-item">
                      <div className="trk-vlist-img-container">
                        <img
                          src={photo}
                          alt={v.name}
                          className="trk-vlist-img"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/images/freight/volvo-fh16.jpg';
                          }}
                        />
                        <div className="trk-vcard-telemetry trk-vcard-telemetry-sm">
                          <span className={`trk-telemetry-dot ${hasGps ? 'active' : 'offline'}`} />
                          <span>{hasGps ? 'GPS' : 'Standby'}</span>
                        </div>
                      </div>
                      <div className="trk-vlist-content">
                        <div className="trk-vlist-main">
                          <div className="trk-vcard-title" style={{ fontSize: 16 }}>{v.name}</div>
                          <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
                          <div style={{ marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Badge variant="gray">{formatAssetType(v.type)}</Badge>
                            {v.ownership && v.ownership !== 'OWNED' && <Badge variant="info">{v.ownership}</Badge>}
                          </div>
                          <div className="trk-vcard-driver-info" style={{ marginTop: 8 }}>
                            <PersonAvatar userId={v.driver_id} kind="drivers" name={v.driver_name || 'Unassigned'} size={24} style={{ borderRadius: '50%' }} />
                            <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                            <span style={{ color: 'var(--ink3)', fontSize: 11, marginLeft: 8 }}>
                              Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), { addSuffix: true }) : 'No GPS data yet'}
                            </span>
                          </div>
                        </div>
                        <div className="trk-vlist-specs">
                          <div className="trk-vcard-label" style={{ marginBottom: 2 }}>Brand/Model</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v.make || 'Unknown'} {v.model || ''}</div>
                          <div className="trk-vcard-label" style={{ marginTop: 8, marginBottom: 2 }}>Dimensions</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v.dimensions || 'N/A'}</div>
                        </div>
                        <div className="trk-vlist-status">
                          <Badge variant={status === 'Unavailable' ? 'gray' : status === 'On trip' || status === 'Moving' ? 'success' : 'info'}>{status}</Badge>
                          <div style={{ width: '100%', maxWidth: 120, marginTop: 12 }}>
                            <div className="trk-vcard-load">
                              <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>Load</span>
                              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.current_load_pct == null ? 'Unknown' : `${v.current_load_pct}%`}</span>
                            </div>
                            <div className="trk-vcard-load-bar-bg">
                              <div className="trk-vcard-load-bar-fill" style={{ width: `${v.current_load_pct == null ? 0 : Math.min(100, Math.max(0, v.current_load_pct))}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {filteredVehicles.length === 0 && (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    {vehicles.length === 0 ? (
                      <>No vehicles registered yet. <Link to="/tracking/vehicles/new" style={{ color: 'var(--teal)', fontWeight: 600 }}>Add your first vehicle</Link>.</>
                    ) : 'No vehicles match the current filters.'}
                  </div>
                )}
              </div>
            )}

            {!loading && filteredVehicles.length > PAGE_SIZE && (
              <div className="trk-pagination">
                <button type="button" aria-label="Previous page" className="trk-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-ui-native-button="">
                  <Icon name="chevronLeft" size={13} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined} className={`trk-page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)} data-ui-native-button="">
                    {n}
                  </button>
                ))}
                <button type="button" aria-label="Next page" className="trk-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-ui-native-button="">
                  <Icon name="chevronRight" size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
