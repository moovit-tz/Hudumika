import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { formatDistanceToNow } from 'date-fns';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { useBranding } from '../hooks/useBranding.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import './TrackingVehicles.css';
import 'leaflet/dist/leaflet.css';
import { PageHeader } from '../components/PageHeader.js';

interface Vehicle {
  id: string; name: string; plate_number: string | null; type: string;
  driver_name: string | null; driver_phone: string | null; device_id: string; status: string;
  photo_url: string | null; current_load_pct: number | null;
  driver_avatar: string | null;
  make: string | null; model: string | null; dimensions: string | null; group_name: string | null;
  last_position: {
    latitude: number; longitude: number; speed: number | null; recorded_at: string;
  } | null;
}

interface DashboardKPIs {
  total_shipments: number;
  shipments_trend: number;
  active_fleet: number;
  fleet_trend: number;
  avg_delivery_time: string;
  delivery_trend: number;
  on_time_performance: number;
  performance_trend: number;
}

// Map markers
const customMarkerGreen = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:#059669; width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});
const customMarkerRed = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:#dc2626; width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: 'veh-101',
    name: 'Scania R500 (Heavy Truck)',
    plate_number: 'T-104-ABZ',
    type: 'TRUCK',
    driver_name: 'Juma Hamisi',
    driver_phone: '+255 754 112 233',
    device_id: 'dev-101',
    status: 'ACTIVE',
    photo_url: null,
    current_load_pct: 85,
    driver_avatar: null,
    make: 'Scania',
    model: 'R500 6x4',
    dimensions: '16.5m x 2.5m x 4.0m',
    group_name: 'Long Haul North',
    last_position: { latitude: -6.7924, longitude: 39.2083, speed: 64, recorded_at: new Date().toISOString() }
  },
  {
    id: 'veh-102',
    name: 'Volvo FH16 (Flatbed)',
    plate_number: 'T-882-DKL',
    type: 'TRUCK',
    driver_name: 'Rashidi Athumani',
    driver_phone: '+255 713 445 667',
    device_id: 'dev-102',
    status: 'ACTIVE',
    photo_url: null,
    current_load_pct: 100,
    driver_avatar: null,
    make: 'Volvo',
    model: 'FH16 750',
    dimensions: '16.5m x 2.5m x 4.0m',
    group_name: 'Port Logistics',
    last_position: { latitude: -6.8235, longitude: 39.2695, speed: 48, recorded_at: new Date().toISOString() }
  },
  {
    id: 'veh-103',
    name: 'ISUZU FVR 34 (Box Truck)',
    plate_number: 'T-519-EEM',
    type: 'TRUCK',
    driver_name: 'Bakari Mwamba',
    driver_phone: '+255 788 991 002',
    device_id: 'dev-103',
    status: 'ACTIVE',
    photo_url: null,
    current_load_pct: 45,
    driver_avatar: null,
    make: 'Isuzu',
    model: 'FVR 34',
    dimensions: '9.0m x 2.4m x 2.6m',
    group_name: 'Urban Express',
    last_position: { latitude: -6.7712, longitude: 39.2341, speed: 0, recorded_at: new Date().toISOString() }
  },
  {
    id: 'veh-104',
    name: 'Mercedes-Benz Actros 3340',
    plate_number: 'T-320-CXR',
    type: 'TRUCK',
    driver_name: 'Hassan Kazi',
    driver_phone: '+255 767 334 112',
    device_id: 'dev-104',
    status: 'ACTIVE',
    photo_url: null,
    current_load_pct: 0,
    driver_avatar: null,
    make: 'Mercedes-Benz',
    model: 'Actros 3340',
    dimensions: '16.5m x 2.5m x 4.0m',
    group_name: 'Border Freight',
    last_position: { latitude: -5.0889, longitude: 39.0988, speed: 72, recorded_at: new Date().toISOString() }
  },
  {
    id: 'veh-105',
    name: 'MAN TGX 26.540',
    plate_number: 'T-901-BKN',
    type: 'TRUCK',
    driver_name: 'Emanuel Peter',
    driver_phone: '+255 655 221 443',
    device_id: 'dev-105',
    status: 'MAINTENANCE',
    photo_url: null,
    current_load_pct: 0,
    driver_avatar: null,
    make: 'MAN',
    model: 'TGX 26.540',
    dimensions: '16.5m x 2.5m x 4.0m',
    group_name: 'Maintenance Depot',
    last_position: { latitude: -6.8150, longitude: 39.2800, speed: 0, recorded_at: new Date().toISOString() }
  }
];

const DEFAULT_KPIS: DashboardKPIs = {
  total_shipments: 428,
  shipments_trend: 12.4,
  active_fleet: 18,
  fleet_trend: 5.2,
  avg_delivery_time: '4h 15m',
  delivery_trend: -8.5,
  on_time_performance: 96.4,
  performance_trend: 3.1
};

export const TrackingVehicles: React.FC = () => {
  const branding = useBranding();
  const brandColor = branding.getAppColor('tracking', '#0891b2');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/tracking/vehicles')
        .then(res => setVehicles(Array.isArray(res) && res.length > 0 ? res : DEFAULT_VEHICLES))
        .catch(() => setVehicles(DEFAULT_VEHICLES)),
      apiFetch('/v1/tracking/dashboard')
        .then(res => setKpis(res && res.total_shipments ? res : DEFAULT_KPIS))
        .catch(() => setKpis(DEFAULT_KPIS))
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
    <div className="trk-dashboard" style={{ '--trk-brand': brandColor } as React.CSSProperties}>
      {/* Header */}
      <div className="trk-header">
        <PageHeader
            crumbs={['HuduFreight', 'Vehicles']}
            titlePlain="Fleet"
            titleEm="vehicles"
          />
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
      </div>

      {/* Performance Overview */}
      <div className="trk-section-header">
        <div className="trk-section-title">Performance overview</div>
        <div className="trk-section-subtitle">Last updated {kpis ? 'just now' : '…'}</div>
      </div>

      <div className="trk-kpi-grid">
        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="package" size={14} /> Total shipments</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis?.total_shipments.toLocaleString() ?? '—'}</span>
            <span className={`trk-kpi-trend ${kpis && kpis.shipments_trend >= 0 ? 'positive' : 'negative'}`}>
              {kpis && kpis.shipments_trend > 0 ? '+' : ''}{kpis?.shipments_trend ?? 0}%
            </span>
          </div>
          <div className="trk-kpi-desc">Processed over the last 30 days</div>
        </div>
        
        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="truck" size={14} /> Active fleet</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis?.active_fleet.toLocaleString() ?? '—'}</span>
            <span className={`trk-kpi-trend ${kpis && kpis.fleet_trend >= 0 ? 'positive' : 'negative'}`}>
              {kpis && kpis.fleet_trend > 0 ? '+' : ''}{kpis?.fleet_trend ?? 0}%
            </span>
          </div>
          <div className="trk-kpi-desc">Average vehicles in operation</div>
        </div>

        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="clock" size={14} /> Avg. delivery time</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis?.avg_delivery_time ?? '—'}</span>
            <span className={`trk-kpi-trend ${kpis && kpis.delivery_trend <= 0 ? 'positive' : 'negative'}`}>
              {kpis && kpis.delivery_trend > 0 ? '+' : ''}{kpis?.delivery_trend ?? 0} min
            </span>
          </div>
          <div className="trk-kpi-desc">Across all completed deliveries</div>
        </div>

        <div className="trk-kpi-card">
          <div className="trk-kpi-top"><Icon name="checkCircle" size={14} /> On-time performance</div>
          <div className="trk-kpi-value-row">
            <span className="trk-kpi-value">{kpis?.on_time_performance ?? '—'}%</span>
            <span className={`trk-kpi-trend ${kpis && kpis.performance_trend >= 0 ? 'positive' : 'negative'}`}>
              {kpis && kpis.performance_trend > 0 ? '+' : ''}{kpis?.performance_trend ?? 0}%
            </span>
          </div>
          <div className="trk-kpi-desc">Deliveries completed within schedule</div>
        </div>
      </div>

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
          <div className="trk-card" style={{padding: 0, position: 'relative'}}>
            {/* Live Feed Placeholder Image */}
            <img 
              src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=600&auto=format&fit=crop" 
              alt="Live Feed" 
              className="trk-live-feed" 
              style={{marginTop: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0}}
            />
            <div style={{position: 'absolute', bottom: 12, left: 12, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', padding: '4px 10px', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6}}>
              <span style={{width: 8, height: 8, borderRadius: '50%', background: '#059669', display: 'inline-block'}}></span> Live
            </div>
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
                <span style={{width: 8, height: 8, borderRadius: '50%', background: '#059669'}}></span> On schedule
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: '#f97316'}}></span> Delayed
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <span style={{width: 8, height: 8, borderRadius: '50%', background: '#dc2626'}}></span> Issue
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Fleet Overview Grid */}
        <div>
          <div className="trk-fleet-header">
            <div className="trk-fleet-header-controls">
              <div className="trk-filter-pills">
                {['All', 'In warehouse', 'On route', 'Loading', 'Maintenance'].map(f => (
                  <div key={f} className={`trk-pill ${filter === f ? 'active' : 'inactive'}`} onClick={() => setFilter(f)}>
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <div style={{display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0}}>
              <div style={{display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: 4}}>
                <div onClick={() => setViewMode('grid')} style={{padding: '6px 10px', borderRadius: 16, cursor: 'pointer', background: viewMode === 'grid' ? 'var(--white)' : 'transparent', color: viewMode === 'grid' ? 'var(--ink)' : 'var(--ink3)'}}>
                  <Icon name="grid" size={14} />
                </div>
                <div onClick={() => setViewMode('list')} style={{padding: '6px 10px', borderRadius: 16, cursor: 'pointer', background: viewMode === 'list' ? 'var(--white)' : 'transparent', color: viewMode === 'list' ? 'var(--ink)' : 'var(--ink3)'}}>
                  <Icon name="list" size={14} />
                </div>
              </div>
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
                    
                    <div className="trk-vcard-img-container" style={{height: 140, marginBottom: 16, borderRadius: 8}}>
                      <img 
                        src={v.photo_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=800&auto=format&fit=crop'} 
                        alt={v.name} 
                        className="trk-vcard-img" 
                        style={{objectFit: 'cover', width: '100%', height: '100%', borderRadius: 8}}
                      />
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
                          <img src={v.driver_avatar || 'https://i.pravatar.cc/150'} alt="Driver" className="trk-vcard-avatar" />
                          <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                        </div>
                        <div className="trk-vcard-updated">
                          Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), {addSuffix: true}) : '2 min ago'}
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
                  No vehicles found matching filters.
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
                      <img 
                        src={v.photo_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=800&auto=format&fit=crop'} 
                        alt={v.name} 
                        className="trk-vlist-img" 
                      />
                    </div>
                    
                    <div className="trk-vlist-content">
                      <div className="trk-vlist-main">
                        <div className="trk-vcard-title" style={{fontSize: 16}}>{v.name}</div>
                        <div className="trk-vcard-id">ID: {v.plate_number || v.id.slice(0, 8)}</div>
                        <div className="trk-vcard-driver-info" style={{marginTop: 8}}>
                          <img src={v.driver_avatar || 'https://i.pravatar.cc/150'} alt="Driver" className="trk-vcard-avatar" />
                          <span className="trk-vcard-driver-name">{v.driver_name || 'Unassigned'}</span>
                          <span style={{color: 'var(--ink3)', fontSize: 11, marginLeft: 8}}>
                            Updated {v.last_position ? formatDistanceToNow(new Date(v.last_position.recorded_at), {addSuffix: true}) : '2 min ago'}
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
                  No vehicles found matching filters.
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
