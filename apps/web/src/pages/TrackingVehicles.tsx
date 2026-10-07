import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { formatDistanceToNow } from 'date-fns';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import './TrackingVehicles.css';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Tip } from '../components/ui/tooltip.js';
import { SectionCard } from '../components/SectionCard.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { Badge } from '../components/ui/badge.js';

interface Vehicle {
  id: string; name: string; plate_number: string | null; type: string;
  driver_name: string | null; driver_phone: string | null; device_id: string; status: string;
  photo_url: string | null; current_load_pct: number | null;
  driver_id: string | null;
  make: string | null; model: string | null; dimensions: string | null; group_name: string | null;
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

// Vehicle category mapping — types that belong to each category.
// Uses substring matching so "PICKUP_TRUCK" matches both "PICKUP" and "TRUCK"
// keywords; unmatched types fall through to the "trucks" default bucket.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  trucks: ['TRUCK', 'SEMI', 'FLATBED', 'BOX', 'TANKER', 'DUMP', 'TRACTOR', 'LORRY', 'RIGID', 'TIPPER'],
  shuttle: ['SUV', 'MINIVAN', 'VAN', 'BUS', 'SEDAN', 'COACH', 'HIACE', 'PASSENGER', 'SHUTTLE'],
  horse: ['PICKUP', 'HORSE', 'LIVESTOCK', 'EQUINE'],
};

const CATEGORY_HINTS: Record<string, string> = {
  trucks: 'Flatbed, box, tanker, dump trucks, semi-trailers and rigid lorries',
  shuttle: 'SUVs, minivans and vans for shuttle or passenger transport',
  horse: 'Pickup trucks (F-250/F-350, Ram 2500/3500), horse lorries and livestock vans',
};

function getCategoryForType(type: string): string {
  const u = (type || '').toUpperCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => u.includes(kw))) return cat;
  }
  return 'trucks';
}

const TRAILER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'gray'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', OUT_OF_SERVICE: 'error', DECOMMISSIONED: 'gray',
};

const customMarkerGreen = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--green); width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});
const customMarkerRed = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--red); width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
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

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleId) setSelectedVehicleId(vehicles[0].id);
  }, [vehicles, selectedVehicleId]);

  const mapCenter: [number, number] = vehicles.find(v => v.last_position)?.last_position
    ? [vehicles.find(v => v.last_position)!.last_position!.latitude, vehicles.find(v => v.last_position)!.last_position!.longitude]
    : [-6.7924, 39.2083];

  const getDisplayStatus = (v: Vehicle) => {
    if (v.status !== 'ACTIVE') return 'Maintenance';
    if (v.last_position && (v.last_position.speed ?? 0) > 0) return 'On route';
    if ((v.current_load_pct ?? 0) > 0 && (v.current_load_pct ?? 0) < 100) return 'Loading';
    return 'In warehouse';
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
    trailers: trailers.length,
  }), [vehicles, trailers]);

  return (
    <div className="trk-dashboard">
      <PageHeader
        crumbs={['HuduFreight', 'Fleet']}
        titlePlain="Fleet"
        titleEm="vehicles"
        actions={
          <div className="trk-actions">
            <Select defaultValue="30d">
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
            <Tip label="Refresh fleet data">
              <Button variant="outline" size="icon" aria-label="Refresh fleet data" onClick={reload}><Icon name="refresh" size={16} /></Button>
            </Tip>
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
          { title: 'Active fleet', value: kpis ? kpis.vehicles_total.toLocaleString() : '—', icon: 'truck', updatedLabel: 'Vehicles registered to this workspace', loading },
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

      {/* Asset-type category selector — spans full width above the grid */}
      <div className="trk-category-tabs">
        <Tabs value={category} onValueChange={cat => { setCategory(cat); setFilter('All'); setTrailerFilter('All'); }}>
          <TabsList>
            <TabsTrigger value="all">
              All <span className="trk-cat-count">{categoryCounts.all + categoryCounts.trailers}</span>
            </TabsTrigger>
            <TabsTrigger value="trucks">
              <Icon name="truck" size={13} />
              Commercial trucks <span className="trk-cat-count">{categoryCounts.trucks}</span>
            </TabsTrigger>
            <TabsTrigger value="shuttle">
              <Icon name="users" size={13} />
              Shuttle & passenger <span className="trk-cat-count">{categoryCounts.shuttle}</span>
            </TabsTrigger>
            <TabsTrigger value="horse">
              <Icon name="package" size={13} />
              Horse transport <span className="trk-cat-count">{categoryCounts.horse}</span>
            </TabsTrigger>
            <TabsTrigger value="trailers">
              <Icon name="box2" size={13} />
              Trailers <span className="trk-cat-count">{categoryCounts.trailers}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {category !== 'all' && category !== 'trailers' && CATEGORY_HINTS[category] && (
          <div className="trk-category-hint">{CATEGORY_HINTS[category]}</div>
        )}
      </div>

      {/* ── TRAILERS tab: full-width DataTable ── */}
      {category === 'trailers' ? (
        <div className="trk-trailers-section">
          <div className="trk-trailers-toolbar">
            <Tabs value={trailerFilter} onValueChange={setTrailerFilter}>
              <TabsList>
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
        <div className="trk-main-grid">
          {/* Left Column: Map */}
          <div>
            <div className="trk-section-header">
              <div className="trk-section-title">Fleet monitoring</div>
              <Combobox
                options={vehicles.map(v => ({ value: v.id, label: `Vehicle ID: ${v.plate_number || v.name}` }))}
                value={selectedVehicleId} onChange={setSelectedVehicleId}
                triggerClassName="h-7 py-1 text-[11px]"
              />
            </div>
            <div className="trk-section-header">
              <div className="trk-section-title">Logistics network map</div>
              <Icon name="moreVertical" size={14} style={{ color: 'var(--ink3)' }} />
            </div>
            <div className="trk-card" style={{ padding: 0 }}>
              <div className="trk-map-container" style={{ marginTop: 0, border: 'none' }}>
                <MapContainer center={mapCenter} zoom={11} style={{ width: '100%', height: '100%' }}>
                  <MapTileLayer />
                  {vehicles.filter(v => v.last_position).map(v => (
                    <Marker
                      key={v.id}
                      position={[v.last_position!.latitude, v.last_position!.longitude]}
                      icon={v.status === 'ACTIVE' ? customMarkerGreen : customMarkerRed}
                    >
                      <Popup>{v.name}</Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              <div style={{ display: 'flex', gap: 16, padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }}></span> On schedule
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }}></span> Delayed
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }}></span> Issue
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Fleet Grid */}
          <div>
            <div className="trk-fleet-header">
              <div className="trk-fleet-header-controls">
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    {['All', 'In warehouse', 'On route', 'Loading', 'Maintenance'].map(f => (
                      <TabsTrigger key={f} value={f}>{f}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <Tabs value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)} variant="segmented">
                  <TabsList>
                    <TabsTrigger value="grid"><Icon name="grid" size={14} /></TabsTrigger>
                    <TabsTrigger value="list"><Icon name="list" size={14} /></TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button asChild variant="outline" size="icon">
                  <Link to="/tracking/vehicles/new" aria-label="Register a vehicle"><Icon name="truck" size={15} /></Link>
                </Button>
                <Button asChild>
                  <Link to="/tracking/shipments/new"><Icon name="plus" size={15} /> New shipment</Link>
                </Button>
                {returnTo && (
                  <Button type="button" variant="outline" size="sm" onClick={() => window.history.back()}>
                    <Icon name="arrowLeft" size={13} /> Back
                  </Button>
                )}
              </div>
            </div>

            <SearchToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search by vehicle or driver"
              className="mb-3"
            />

            {loading ? (
              <SectionLoading label="Loading fleet data…" />
            ) : viewMode === 'grid' ? (
              <div className="trk-vehicles-grid">
                {pagedVehicles.map(v => {
                  const status = getDisplayStatus(v);
                  const badgeClass = status.toLowerCase().replace(' ', '_');
                  return (
                    <Link to={`/tracking/vehicles/${v.id}`} key={v.id} className="trk-vcard">
                      <div className="trk-vcard-top">
                        <div>
                          <div className="trk-vcard-title">{v.name}</div>
                          <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
                        </div>
                        <div className={`trk-vcard-badge ${badgeClass}`}>{status}</div>
                      </div>
                      <div className="trk-vcard-img-container" style={{ height: 140, marginBottom: 16, borderRadius: 'var(--r)' }}>
                        {v.photo_url ? (
                          <img src={v.photo_url} alt={v.name} className="trk-vcard-img" style={{ objectFit: 'cover', width: '100%', height: '100%', borderRadius: 'var(--r)' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', borderRadius: 'var(--r)', background: 'var(--bg-subtle, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="truck" size={32} style={{ color: 'var(--ink3)' }} />
                          </div>
                        )}
                      </div>
                      <div className="trk-vcard-specs">
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
                        <div className="trk-vcard-label">Driver</div>
                        <div className="trk-vcard-driver">
                          <div className="trk-vcard-driver-info">
                            <PersonAvatar userId={v.driver_id} kind="drivers" name={v.driver_name || 'Unassigned'} size={24} style={{ borderRadius: '50%' }} />
                            <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                          </div>
                          <div className="trk-vcard-updated">
                            Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), { addSuffix: true }) : 'No GPS data yet'}
                          </div>
                        </div>
                        <div className="trk-vcard-load">
                          <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>Load status</span>
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.current_load_pct ?? 0}%</span>
                        </div>
                        <div className="trk-vcard-load-bar-bg">
                          <div className="trk-vcard-load-bar-fill" style={{ width: `${v.current_load_pct ?? 0}%` }}></div>
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
                  const badgeClass = status.toLowerCase().replace(' ', '_');
                  return (
                    <Link to={`/tracking/vehicles/${v.id}`} key={v.id} className="trk-vlist-item">
                      <div className="trk-vlist-img-container">
                        {v.photo_url ? (
                          <img src={v.photo_url} alt={v.name} className="trk-vlist-img" />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle, #f1f5f9)' }}>
                            <Icon name="truck" size={28} style={{ color: 'var(--ink3)' }} />
                          </div>
                        )}
                      </div>
                      <div className="trk-vlist-content">
                        <div className="trk-vlist-main">
                          <div className="trk-vcard-title" style={{ fontSize: 16 }}>{v.name}</div>
                          <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
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
                          <div className={`trk-vcard-badge ${badgeClass}`}>{status}</div>
                          <div style={{ width: '100%', maxWidth: 120, marginTop: 12 }}>
                            <div className="trk-vcard-load">
                              <span style={{ fontWeight: 600, color: 'var(--ink3)' }}>Load</span>
                              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{v.current_load_pct ?? 0}%</span>
                            </div>
                            <div className="trk-vcard-load-bar-bg">
                              <div className="trk-vcard-load-bar-fill" style={{ width: `${v.current_load_pct ?? 0}%` }}></div>
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
                <button type="button" aria-label="Previous page" className="trk-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  <Icon name="chevronLeft" size={13} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined} className={`trk-page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>
                    {n}
                  </button>
                ))}
                <button type="button" aria-label="Next page" className="trk-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
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
