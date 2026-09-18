import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

// Shape of GET /v1/tracking/dashboard-summary — real, derived-from-data
// figures only. There is no historical baseline stored anywhere for these
// (no day-over-day snapshot table), so unlike the mockup this page was
// built from, there are no trend/percentage-change figures here: a
// fabricated trend arrow is exactly the same category of problem as a
// fabricated total, just easier to miss on a glance.
interface DashboardKPIs {
  vehicles_total: number;
  trips_today: number;
  avg_delivery_minutes_today: number | null;
  on_time_pct_today: number | null;
}

// Map markers
const customMarkerGreen = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--green); width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});
const customMarkerRed = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:var(--red); width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export const TrackingVehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // A tenant with zero vehicles registered, or a failed request, must never
  // render fabricated trucks with invented driver names and phone numbers
  // in their place — this page used to fall back to five hardcoded sample
  // vehicles whenever the real list came back empty, which is indistinguishable
  // from a real fleet to anyone looking at it. An empty result renders the
  // real empty state below; a failed request surfaces as an error banner
  // instead of silently substituting fake data for it.
  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiFetch('/v1/tracking/vehicles')
        .then(res => setVehicles(Array.isArray(res) ? res : []))
        .catch(() => { setVehicles([]); setLoadError('Could not load vehicles. Try refreshing.'); }),
      // dashboard-summary (not the older /dashboard, which returns hardcoded
      // placeholder KPIs) — every figure here is derived from real rows.
      apiFetch('/v1/tracking/dashboard-summary')
        .then(res => setKpis({
          vehicles_total: res?.vehicles?.total ?? 0,
          trips_today: res?.trips_today ?? 0,
          avg_delivery_minutes_today: res?.avg_delivery_minutes_today ?? null,
          on_time_pct_today: res?.on_time_pct_today ?? null,
        }))
        .catch(() => setKpis(null))
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId]);

  const mapCenter: [number, number] = vehicles.find(v => v.last_position)?.last_position
    ? [vehicles.find(v => v.last_position)!.last_position!.latitude, vehicles.find(v => v.last_position)!.last_position!.longitude]
    : [-6.7924, 39.2083]; // Default Dar es Salaam

  // Deriving status based on speed and actual status
  const getDisplayStatus = (v: Vehicle) => {
    if (v.status !== 'ACTIVE') return 'Maintenance';
    if (v.last_position && (v.last_position.speed ?? 0) > 0) return 'On route';
    if ((v.current_load_pct ?? 0) > 0 && (v.current_load_pct ?? 0) < 100) return 'Loading';
    return 'In warehouse';
  };

  const filteredVehicles = vehicles.filter(v => {
    if (filter !== 'All' && getDisplayStatus(v) !== filter) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !(v.driver_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / PAGE_SIZE));
  const pagedVehicles = filteredVehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filter, search, viewMode]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div className="trk-dashboard">
      {/* Header. The search/range/refresh controls go through PageHeader's own
          `actions` slot rather than sitting beside it in a flex row: as a flex
          child the header shrank to its own text, so the title block was 450px
          wide on a 1680px window and its right edge fell 1186px short of the
          page's. */}
      <PageHeader
        crumbs={['HuduFreight', 'Vehicles']}
        titlePlain="Fleet"
        titleEm="vehicles"
        actions={
          <div className="trk-actions">
            <div className="trk-search-bar">
              <Icon name="search" size={14} style={{color: 'var(--ink3)'}} />
              <input placeholder="Search for Fleet ID.." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select defaultValue="30d">
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
            <button className="trk-icon-btn" title="Refresh" onClick={reload}><Icon name="refresh" size={16} /></button>
          </div>
        }
      />

      {/* Performance Overview */}
      <div className="trk-section-header">
        <div className="trk-section-title">Performance overview</div>
        <div className="trk-section-subtitle">Last updated {kpis ? 'just now' : '…'}</div>
      </div>

      <div className="trk-kpi-grid">
        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="truck" size={14} /> Active fleet</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis ? kpis.vehicles_total.toLocaleString() : '—'}</span>
          </div>
          <div className="trk-kpi-desc">Vehicles registered to this workspace</div>
        </div>

        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="package" size={14} /> Trips today</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis ? kpis.trips_today.toLocaleString() : '—'}</span>
          </div>
          <div className="trk-kpi-desc">Scheduled to start today</div>
        </div>

        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="clock" size={14} /> Avg. delivery time</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">
              {kpis?.avg_delivery_minutes_today != null
                ? `${Math.floor(kpis.avg_delivery_minutes_today / 60)}h ${Math.round(kpis.avg_delivery_minutes_today % 60)}m`
                : '—'}
            </span>
          </div>
          <div className="trk-kpi-desc">Trips completed today</div>
        </div>

        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="checkCircle" size={14} /> On-time performance</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis?.on_time_pct_today != null ? `${kpis.on_time_pct_today}%` : '—'}</span>
          </div>
          <div className="trk-kpi-desc">Deliveries completed on schedule today</div>
        </div>
      </div>
      {loadError && (
        <div style={{ padding: '10px 16px', margin: '0 0 16px', background: 'var(--red-l)', color: 'var(--red)', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
          {loadError}
        </div>
      )}

      <div className="trk-main-grid">
        {/* Left Column: Monitoring & Map */}
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
            <Icon name="moreVertical" size={14} style={{color: 'var(--ink3)'}}/>
          </div>
          <div className="trk-card" style={{padding: 0}}>
            <div className="trk-map-container" style={{marginTop: 0, border: 'none'}}>
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
            <div style={{display: 'flex', gap: 16, padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--ink2)'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: 'var(--green)'}}></span> On schedule
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)'}}></span> Delayed
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: 'var(--red)'}}></span> Issue
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Fleet Overview Grid */}
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
            <div style={{display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0}}>
              <Tabs value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)} variant="segmented">
                <TabsList>
                  <TabsTrigger value="grid">
                    <Icon name="grid" size={14} />
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <Icon name="list" size={14} />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Link to="/tracking/vehicles/new" className="trk-icon-btn" title="Register a vehicle" style={{width: 'auto', padding: '0 14px'}}>
                <Icon name="truck" size={15} />
              </Link>
              <Link to="/tracking/shipments/new" className="trk-primary-btn">
                <Icon name="plus" size={15} /> New Shipment
              </Link>
            </div>
          </div>

          {loading ? (
            <div style={{padding: 40, textAlign: 'center', color: 'var(--ink3)'}}>Loading fleet data...</div>
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
                    
                    <div className="trk-vcard-img-container" style={{height: 140, marginBottom: 16, borderRadius: 'var(--r)'}}>
                      {v.photo_url ? (
                        <img
                          src={v.photo_url}
                          alt={v.name}
                          className="trk-vcard-img"
                          style={{objectFit: 'cover', width: '100%', height: '100%', borderRadius: 'var(--r)'}}
                        />
                      ) : (
                        // No stock photo of an unrelated truck stands in here — it
                        // would read as a real photo of this specific vehicle.
                        <div style={{ width: '100%', height: '100%', borderRadius: 'var(--r)', background: 'var(--bg-subtle, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="truck" size={32} style={{ color: 'var(--ink3)' }} />
                        </div>
                      )}
                    </div>

                    <div className="trk-vcard-specs">
                      <div className="trk-spec-line">
                        <span>Brand/Model:</span>
                        <span style={{fontWeight: 600, color: 'var(--ink)'}}>{v.make || 'Unknown'} {v.model || ''}</span>
                      </div>
                      <div className="trk-spec-line">
                        <span>Dimensions:</span>
                        <span style={{fontWeight: 600, color: 'var(--ink)'}}>{v.dimensions || 'N/A'}</span>
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
                          Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), {addSuffix: true}) : 'No GPS data yet'}
                        </div>
                      </div>

                      <div className="trk-vcard-load">
                        <span style={{fontWeight: 600, color: 'var(--ink3)'}}>Load status</span>
                        <span style={{fontWeight: 700, color: 'var(--ink)'}}>{v.current_load_pct ?? 0}%</span>
                      </div>
                      <div className="trk-vcard-load-bar-bg">
                        <div className="trk-vcard-load-bar-fill" style={{width: `${v.current_load_pct ?? 0}%`}}></div>
                      </div>
                    </div>
                  </Link>
                )
              })}
              {filteredVehicles.length === 0 && (
                <div style={{padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13, gridColumn: '1 / -1'}}>
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
                        <img
                          src={v.photo_url}
                          alt={v.name}
                          className="trk-vlist-img"
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle, #f1f5f9)' }}>
                          <Icon name="truck" size={28} style={{ color: 'var(--ink3)' }} />
                        </div>
                      )}
                    </div>
                    
                    <div className="trk-vlist-content">
                      <div className="trk-vlist-main">
                        <div className="trk-vcard-title" style={{fontSize: 16}}>{v.name}</div>
                        <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
                        <div className="trk-vcard-driver-info" style={{marginTop: 8}}>
                          <PersonAvatar userId={v.driver_id} kind="drivers" name={v.driver_name || 'Unassigned'} size={24} style={{ borderRadius: '50%' }} />
                          <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                          <span style={{color: 'var(--ink3)', fontSize: 11, marginLeft: 8}}>
                            Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), {addSuffix: true}) : 'No GPS data yet'}
                          </span>
                        </div>
                      </div>

                      <div className="trk-vlist-specs">
                        <div className="trk-vcard-label" style={{marginBottom: 2}}>Brand/Model</div>
                        <div style={{fontSize: 13, fontWeight: 600, color: 'var(--ink)'}}>{v.make || 'Unknown'} {v.model || ''}</div>
                        
                        <div className="trk-vcard-label" style={{marginTop: 8, marginBottom: 2}}>Dimensions</div>
                        <div style={{fontSize: 13, fontWeight: 600, color: 'var(--ink)'}}>{v.dimensions || 'N/A'}</div>
                      </div>

                      <div className="trk-vlist-status">
                        <div className={`trk-vcard-badge ${badgeClass}`}>{status}</div>
                        <div style={{width: '100%', maxWidth: 120, marginTop: 12}}>
                          <div className="trk-vcard-load">
                            <span style={{fontWeight: 600, color: 'var(--ink3)'}}>Load</span>
                            <span style={{fontWeight: 700, color: 'var(--ink)'}}>{v.current_load_pct ?? 0}%</span>
                          </div>
                          <div className="trk-vcard-load-bar-bg">
                            <div className="trk-vcard-load-bar-fill" style={{width: `${v.current_load_pct ?? 0}%`}}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
              {filteredVehicles.length === 0 && (
                <div style={{padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13}}>
                  {vehicles.length === 0 ? (
                    <>No vehicles registered yet. <Link to="/tracking/vehicles/new" style={{ color: 'var(--teal)', fontWeight: 600 }}>Add your first vehicle</Link>.</>
                  ) : 'No vehicles match the current filters.'}
                </div>
              )}
            </div>
          )}

          {!loading && filteredVehicles.length > PAGE_SIZE && (
            <div className="trk-pagination">
              <button type="button" title="Previous page" className="trk-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <Icon name="chevronLeft" size={13} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" title={`Page ${n}`} className={`trk-page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>
                  {n}
                </button>
              ))}
              <button type="button" title="Next page" className="trk-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <Icon name="chevronRight" size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
