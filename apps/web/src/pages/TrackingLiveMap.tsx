import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../lib/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Icon } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import type { MapVariant } from '../components/MapTileLayer.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import 'leaflet/dist/leaflet.css';
import './Tracking.css';

interface VehicleWithPosition {
  id: string; name: string; plate_number: string | null; status: string;
  mileage_km?: number | null;
  last_position: { latitude: number; longitude: number; speed: number | null; recorded_at: string; heading?: number; battery_pct?: number; ignition?: boolean | string } | null;
  heading?: number;
  battery?: number;
  ignition?: boolean;
  driver_name?: string;
  driver_id?: string | null;
  // The vehicle's own current IN_PROGRESS trip, if it has one (GET
  // /v1/tracking/vehicles now joins this in from the real trips table) — a
  // vehicle idle between trips genuinely has none, which the UI shows
  // honestly rather than filling in a placeholder route/cargo.
  current_trip?: {
    origin: string | null; destination: string | null; cargo_type: string | null;
    cargo_weight_kg: number | null; cargo_temp_c: number | null;
    load_capacity_pct: number | null; eta: string | null;
  } | null;
}
interface Geofence { id: string; name: string; center_lat: number; center_lon: number; radius_km: number }

const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

// Status derived from speed and recorded_at
function getVehicleState(v: VehicleWithPosition) {
  if (!v.last_position) return 'offline';
  const diff = Date.now() - new Date(v.last_position.recorded_at).getTime();
  if (diff > 1000 * 60 * 60 * 2) return 'offline'; // no signal for 2 hours
  if ((v.last_position.speed || 0) > 3) return 'moving';
  return 'stopped';
}

function vehicleIcon(state: 'moving' | 'stopped' | 'offline', heading: number = 0, selected: boolean = false) {
  return L.divIcon({
    className: '',
    html: `<div class="trk-marker-wrap ${state} ${selected ? 'selected' : ''}">
             ${state === 'moving' ? `<div class="trk-marker-pulse"></div>` : ''}
             <div class="trk-marker-arrow" style="transform: rotate(${heading}deg);"></div>
             <div class="trk-marker-icon">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink2)"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5"/><path d="M14 17h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
             </div>
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// Bridges the Leaflet map instance out to the floating control buttons, which
// render outside <MapContainer> and so can't call useMap() directly.
function MapControlsBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function RecenterOnSelection({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

// Ensure the map initially centers on the first vehicle if no selection
function RecenterOnFirstFix({ position, hasSelection }: { position: [number, number] | null, hasSelection: boolean }) {
  const map = useMap();
  const recentered = useRef(false);
  useEffect(() => {
    if (position && !recentered.current && !hasSelection) {
      recentered.current = true;
      map.setView(position, 12);
    }
  }, [position, map, hasSelection]);
  return null;
}

export const TrackingLiveMap: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleWithPosition[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapVariant, setMapVariant] = useState<MapVariant | null>(null);
  const [leafletMap, setLeafletMap] = useState<L.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A tenant with zero vehicles, or a failed request, must see that real
  // state — not three sample trucks with invented GPS fixes and driver
  // names standing in for it, indistinguishable from a real fleet on a
  // live map. heading/battery/ignition come straight off the vehicle's own
  // last_position; current_trip (real IN_PROGRESS trip data, joined
  // server-side) drives the route/cargo panel, present only when the
  // vehicle actually has one.
  const reload = useCallback(() => {
    setLoadError(null);
    apiFetch('/v1/tracking/vehicles').then(data => {
      const list = Array.isArray(data) ? data : [];
      setVehicles(list.map((v: any) => ({
        ...v,
        heading: v.last_position?.heading ?? 0,
        battery: v.last_position?.battery_pct ?? null,
        ignition: v.last_position?.ignition === 'ON' || (v.last_position?.speed || 0) > 0,
      })));
    }).catch(() => { setVehicles([]); setLoadError('Could not load vehicles. Try refreshing.'); });
    apiFetch('/v1/tracking/geofences')
      .then(res => setGeofences(Array.isArray(res) ? res : []))
      .catch(() => setGeofences([]));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useWebSocket(useCallback((event) => {
    if (event.type !== 'vehicle.position_updated') return;
    setVehicles(prev => prev.map(v => v.id === event.vehicleId
      ? { 
          ...v, 
          last_position: { 
            latitude: event.latitude, 
            longitude: event.longitude, 
            speed: v.last_position?.speed ?? null, 
            recorded_at: new Date().toISOString(),
            heading: (event as any).heading ?? v.last_position?.heading,
            battery_pct: (event as any).battery_pct ?? v.last_position?.battery_pct,
            ignition: (event as any).ignition ?? v.last_position?.ignition
          },
          heading: (event as any).heading ?? v.heading,
          battery: (event as any).battery_pct ?? v.battery,
          ignition: (event as any).ignition === 'ON' || (event as any).ignition === true || v.ignition
        }
      : v));
  }, []));

  const filteredVehicles = useMemo(() => {
    if (!search) return vehicles;
    const lower = search.toLowerCase();
    return vehicles.filter(v => v.name.toLowerCase().includes(lower) || (v.plate_number && v.plate_number.toLowerCase().includes(lower)));
  }, [vehicles, search]);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedId), [vehicles, selectedId]);
  const withPosition = vehicles.filter(v => v.last_position);

  const initialCenter: [number, number] = withPosition[0]?.last_position
    ? [withPosition[0].last_position.latitude, withPosition[0].last_position.longitude]
    : DEFAULT_CENTER;

  const totalActive = vehicles.filter(v => getVehicleState(v) === 'moving').length;
  const totalDelayed = vehicles.filter(v => (v.last_position?.speed === 0 && v.ignition)).length;
  const avgBattery = vehicles.length ? Math.round(vehicles.reduce((acc, v) => acc + (v.battery || 0), 0) / vehicles.length) : 0;

  return (
    /* No PageHeader here, deliberately — see CLAUDE.md's full-screen app
       surface exclusion. This shell is `flex: 1; overflow: hidden` and
       everything in it (.trk-sidebar, .trk-top-kpi-bar, .trk-map-controls) is
       absolutely positioned against it, so an in-flow title block does not sit
       *above* the map, it lands underneath the floating panels while pushing
       the map's `height: 100%` past the bottom of the window. That is exactly
       what it did: the breadcrumb and title showed through the gaps in the
       vehicle panel, and the panel's `bottom: 16px` fell below the fold. */
    <div className="trk-livemap-shell">
      {loadError && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'var(--red-l)', color: 'var(--red)', padding: '8px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, boxShadow: 'var(--elev-sm)' }}>
          {loadError}
        </div>
      )}
      {/* TOP KPI BAR */}
      <div className="trk-top-kpi-bar">
        <div className="trk-kpi-item">
          <span className="trk-kpi-val">{vehicles.length}</span>
          <span className="trk-kpi-lbl">Total Fleet</span>
        </div>
        <div className="trk-kpi-item">
          <span className="trk-kpi-val active">{totalActive}</span>
          <span className="trk-kpi-lbl">In Transit</span>
        </div>
        <div className="trk-kpi-item">
          <span className="trk-kpi-val delayed">{totalDelayed}</span>
          <span className="trk-kpi-lbl">Delayed</span>
        </div>
        <div className="trk-kpi-item">
          <span className="trk-kpi-val">{avgBattery}%</span>
          <span className="trk-kpi-lbl">Avg Battery</span>
        </div>
      </div>

      {/* MAP LAYER */}
      <MapContainer center={initialCenter} zoom={withPosition.length ? 12 : 6} style={{ height: '100%', width: '100%', zIndex: 1 }} zoomControl={false}>
        <MapTileLayer override={mapVariant} />
        <MapControlsBridge onReady={setLeafletMap} />
        <RecenterOnFirstFix position={withPosition[0]?.last_position ? [withPosition[0].last_position.latitude, withPosition[0].last_position.longitude] : null} hasSelection={!!selectedId} />
        {selectedVehicle?.last_position && (
          <RecenterOnSelection position={[selectedVehicle.last_position.latitude, selectedVehicle.last_position.longitude]} />
        )}
        
        {geofences.map(g => (
          <Circle key={g.id} center={[g.center_lat, g.center_lon]} radius={g.radius_km * 1000}
            pathOptions={{ color: '#0891b2', fillOpacity: 0.08 }}>
          </Circle>
        ))}
        {withPosition.map(v => {
          const state = getVehicleState(v);
          return (
            <Marker 
              key={v.id} 
              position={[v.last_position!.latitude, v.last_position!.longitude]} 
              icon={vehicleIcon(state, v.heading, selectedId === v.id)}
              eventHandlers={{ click: () => setSelectedId(v.id) }}
            >
            </Marker>
          );
        })}
      </MapContainer>

      {/* FLOATING MAP CONTROLS */}
      <div className="trk-map-controls">
        <button className="trk-mc-btn" title="Zoom In" onClick={() => leafletMap?.zoomIn()}><Icon name="plus" size={16} /></button>
        <button className="trk-mc-btn" title="Zoom Out" onClick={() => leafletMap?.zoomOut()}><Icon name="minus" size={16} /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="trk-mc-btn" title="Map Layers">
              <Icon name="layers" size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {([
              ['Auto', null],
              ['Light', 'light'],
              ['Dark', 'dark'],
              ['Satellite', 'satellite'],
            ] as [string, MapVariant | null][]).map(([label, value]) => (
              <DropdownMenuItem key={label} onClick={() => setMapVariant(value)} className="cursor-pointer justify-between">
                {label}
                {mapVariant === value && <Icon name="check" size={13} className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* FLOATING SIDEBAR */}
      <div className="trk-sidebar">
        <div className="trk-sidebar-header">
          {/* Names the panel and carries the page's identity now that there is
              no PageHeader above it. "TrackOS" was the only occurrence of that
              word anywhere in the platform — the app is HuduFreight. */}
          <div className="trk-sidebar-title">Live map</div>
          <div className="trk-search-box">
            <Icon name="search" size={14} />
            <input 
              type="text" 
              placeholder="Search vehicles by name or plate..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ul className="trk-vehicle-list">
          {filteredVehicles.map(v => {
            const state = getVehicleState(v);
            return (
              <li 
                key={v.id} 
                className={`trk-vehicle-item ${selectedId === v.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(v.id)}
              >
                <div className="trk-v-head">
                  <div className="trk-v-name-wrap">
                    <PersonAvatar userId={v.driver_id} kind="drivers" name={v.driver_name || 'Unassigned'} size={32} />
                    <div>
                      <div className="trk-v-name">{v.name}</div>
                      <div className="trk-v-sub">{v.plate_number || 'No Plate'}</div>
                    </div>
                  </div>
                  <div className={`trk-status-badge ${state}`}>{state === 'moving' ? 'In Transit' : state === 'stopped' ? 'Idle' : 'Offline'}</div>
                </div>
                <div className="trk-v-micro-metrics">
                  <div className="trk-v-metric-bar-wrap">
                    <div className="trk-v-metric-bar-lbl">Fuel/Batt</div>
                    <div className="trk-v-metric-bar"><div style={{ width: `${v.battery ?? 0}%` }}></div></div>
                  </div>
                  <div className="trk-v-metric-bar-wrap">
                    <div className="trk-v-metric-bar-lbl">Load</div>
                    <div className="trk-v-metric-bar"><div style={{ width: `${v.current_trip?.load_capacity_pct ?? 0}%` }}></div></div>
                  </div>
                </div>
              </li>
            );
          })}
          {filteredVehicles.length === 0 && (
            <li style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No vehicles found.</li>
          )}
        </ul>
      </div>

      {/* SLIDING DETAIL PANEL */}
      <div className={`trk-detail-panel ${selectedVehicle ? 'open' : ''}`}>
        {selectedVehicle && (
          <>
            <div className="trk-detail-hero">
              <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=800" alt="Truck" className="trk-hero-img" />
              <button className="trk-close-btn" onClick={() => setSelectedId(null)}>
                <Icon name="x" size={20} />
              </button>
              <div className="trk-hero-overlay">
                <div className="trk-detail-title">{selectedVehicle.name}</div>
                <div className="trk-detail-plate">{selectedVehicle.plate_number || 'UNKNOWN'}</div>
              </div>
            </div>
            
            <div className="trk-detail-body">
              {/* Timeline — only for a vehicle actually on an IN_PROGRESS
                  trip; one idle between trips has no route to show, and
                  showing an invented origin/destination for it would be
                  indistinguishable from a real one. */}
              <div className="trk-info-group">
                <div className="trk-info-label">Route Progress</div>
                {selectedVehicle.current_trip ? (
                <div className="trk-route-timeline">
                  <div className="trk-rt-item completed">
                    <div className="trk-rt-dot"></div>
                    <div className="trk-rt-content">
                      <div className="trk-rt-title">{selectedVehicle.current_trip.origin || 'Unknown origin'}</div>
                      <div className="trk-rt-sub">Departed</div>
                    </div>
                  </div>
                  <div className={`trk-rt-item ${getVehicleState(selectedVehicle) === 'moving' ? 'active' : ''}`}>
                    <div className="trk-rt-dot"></div>
                    <div className="trk-rt-content">
                      <div className="trk-rt-title">In Transit</div>
                      <div className="trk-rt-sub">{selectedVehicle.last_position?.speed} km/h</div>
                    </div>
                  </div>
                  <div className="trk-rt-item pending">
                    <div className="trk-rt-dot"></div>
                    <div className="trk-rt-content">
                      <div className="trk-rt-title">{selectedVehicle.current_trip.destination || 'Unknown destination'}</div>
                      <div className="trk-rt-sub">ETA: {selectedVehicle.current_trip.eta ? new Date(selectedVehicle.current_trip.eta).toLocaleString() : 'Not scheduled'}</div>
                    </div>
                  </div>
                </div>
                ) : (
                  <div className="trk-rt-sub" style={{ padding: '4px 0' }}>No active trip right now.</div>
                )}
              </div>

              {/* Driver info */}
              <div className="trk-info-group trk-driver-card">
                 <PersonAvatar userId={selectedVehicle.driver_id} kind="drivers" name={selectedVehicle.driver_name || 'Unassigned'} size={40} />
                 <div>
                    <div className="trk-info-label" style={{marginBottom: 2}}>Driver</div>
                    <div className="trk-driver-name">{selectedVehicle.driver_name}</div>
                 </div>
              </div>

              {/* Cargo meters — real figures off the vehicle's own active
                  trip; absent entirely when it has none. */}
              {selectedVehicle.current_trip && (
                <div className="trk-info-group">
                  <div className="trk-info-label">Cargo & Capacity</div>
                  <div className="trk-cargo-stats">
                    <div className="trk-cargo-stat"><span>Type</span> <strong>{selectedVehicle.current_trip.cargo_type || '—'}</strong></div>
                    <div className="trk-cargo-stat"><span>Weight</span> <strong>{selectedVehicle.current_trip.cargo_weight_kg != null ? `${selectedVehicle.current_trip.cargo_weight_kg} kg` : '—'}</strong></div>
                    <div className="trk-cargo-stat"><span>Temp</span> <strong>{selectedVehicle.current_trip.cargo_temp_c != null ? `${selectedVehicle.current_trip.cargo_temp_c}°C` : '—'}</strong></div>
                  </div>
                  {selectedVehicle.current_trip.load_capacity_pct != null && (
                    <div className="trk-capacity-meter-wrap">
                      <div className="trk-capacity-header"><span>Load Capacity</span> <span>{selectedVehicle.current_trip.load_capacity_pct}%</span></div>
                      <div className="trk-capacity-meter"><div style={{ width: `${selectedVehicle.current_trip.load_capacity_pct}%` }}></div></div>
                    </div>
                  )}
                </div>
              )}
              <div className="trk-kpi-grid" style={{ marginBottom: 24 }}>
                <div className="trk-kpi-card">
                  <div className="trk-kpi-val">{selectedVehicle.last_position?.speed || 0}</div>
                  <div className="trk-kpi-lbl">km/h</div>
                </div>
                <div className="trk-kpi-card">
                  <div className="trk-kpi-val">{selectedVehicle.battery != null ? `${selectedVehicle.battery}%` : '—'}</div>
                  <div className="trk-kpi-lbl">Battery</div>
                </div>
              </div>

              <div className="trk-info-group">
                <div className="trk-info-label">Status Overview</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                  <div className="trk-info-value">
                    <Icon name="zap" size={16} style={{ color: selectedVehicle.ignition ? 'var(--green)' : 'var(--ink3)' }}/>
                    {selectedVehicle.ignition ? 'Ignition ON' : 'Ignition OFF'}
                  </div>
                  <div className="trk-info-value" style={{ textTransform: 'capitalize' }}>
                    <div className={`trk-status-dot ${getVehicleState(selectedVehicle)}`}></div> 
                    {getVehicleState(selectedVehicle)}
                  </div>
                </div>
              </div>

              <div className="trk-info-group">
                <div className="trk-info-label">Location Data</div>
                <div className="trk-info-value" style={{ marginBottom: 6 }}>
                  <Icon name="mapPin" size={16} />
                  {selectedVehicle.last_position?.latitude.toFixed(5)}, {selectedVehicle.last_position?.longitude.toFixed(5)}
                </div>
                <div className="trk-info-value" style={{ fontSize: 12, color: 'var(--ink3)' }}>
                  <Icon name="clock" size={14} />
                  Updated {selectedVehicle.last_position ? relTime(selectedVehicle.last_position.recorded_at) : 'Never'}
                </div>
              </div>

              <div className="trk-info-group">
                <div className="trk-info-label">Vehicle Info</div>
                <div className="trk-info-value" style={{ marginBottom: 6 }}>
                  <Icon name="user" size={16} /> Driver: {selectedVehicle.driver_name}
                </div>
                <div className="trk-info-value">
                  <Icon name="compass" size={16} /> Heading: {selectedVehicle.heading}°
                </div>
                <div className="trk-info-value" style={{ marginTop: 6 }}>
                  <Icon name="barChart2" size={16} /> Odometer: {selectedVehicle.mileage_km != null ? `${selectedVehicle.mileage_km.toLocaleString()} km` : 'Not logged'}
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
};
