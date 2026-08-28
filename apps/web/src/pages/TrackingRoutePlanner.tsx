import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import { Icon } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import type { MapVariant } from '../components/MapTileLayer.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import 'leaflet/dist/leaflet.css';
import './TrackingRoutePlanner.css';
import L from 'leaflet';
import { format } from 'date-fns';

const DEFAULT_CENTER: [number, number] = [-6.7924, 39.2083];

interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  // etaSeconds is the real cumulative OSRM leg duration from the route start
  // to this waypoint (0 for the first stop) — not a guessed flat interval.
  waypoints: { name: string, location: [number, number], etaSeconds: number }[];
}

interface Vehicle {
  id: string; name: string; plate_number: string | null; type: string;
  driver_name: string | null; driver_avatar: string | null; current_load_pct: number | null;
}

function ClickToAddWaypoint({ onAdd }: { onAdd: (pos: [number, number]) => void }) {
  useMapEvents({ click(e) { onAdd([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

// Custom markers
const stopMarkerIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:#fff; width:16px; height:16px; border-radius:50%; border:4px solid #2563eb; box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export const TrackingRoutePlanner: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'fastest' | 'regular'>('fastest');
  
  // Destination search text state (mock input for UI matching)
  const [destinationStr, setDestinationStr] = useState('');
  const [mapVariant, setMapVariant] = useState<MapVariant | null>(null);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(data => {
      setVehicles(data);
      if (data.length > 0) setSelectedVehicleId(data[0].id);
    }).catch(console.error);
  }, []);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const addWaypoint = useCallback((pos: [number, number]) => {
    setWaypoints(prev => [...prev, pos]);
    setRoute(null);
  }, []);

  const clear = () => { setWaypoints([]); setRoute(null); setError(''); setDestinationStr(''); };

  // Helper to reverse geocode a coordinate for the timeline UI (using nominatim)
  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  async function planRoute() {
    if (waypoints.length < 2) return;
    setLoading(true); setError('');
    try {
      const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route found between these points');
      
      const r = data.routes[0];
      const geometry: [number, number][] = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

      // Real per-leg durations from OSRM (seconds), one entry per waypoint-to-waypoint
      // hop — cumulative sum gives each stop's genuine ETA offset from the route start,
      // instead of a fabricated flat interval per stop.
      const legs: { duration: number }[] = r.legs ?? [];
      const cumulativeSeconds: number[] = [0];
      for (const leg of legs) cumulativeSeconds.push(cumulativeSeconds[cumulativeSeconds.length - 1] + leg.duration);

      // Fetch names for waypoints for the timeline
      const namedWaypoints = await Promise.all(waypoints.map(async (pos, idx) => {
        let name = 'Waypoint';
        if (idx === 0) name = 'Start Point';
        else if (idx === waypoints.length - 1) name = 'Destination';
        else name = `Stop ${idx}`;

        // Let's do a quick mock reverse geocode (to avoid hitting nominatim rate limits in loop)
        const address = await reverseGeocode(pos[0], pos[1]);

        return { name, address, location: pos };
      }));

      setRoute({
        distanceKm: r.distance / 1000,
        durationMin: r.duration / 60,
        geometry,
        waypoints: namedWaypoints.map((w, idx) => ({
          name: w.name + ' - ' + w.address.split(',')[0],
          location: w.location,
          etaSeconds: cumulativeSeconds[idx] ?? 0,
        })),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to plan route');
    } finally { setLoading(false); }
  }

  // Derive ETA dates for timeline rendering
  const now = new Date();

  return (
    <div className="rp-container">
      {/* No PageHeader here, deliberately — see CLAUDE.md's full-screen app
          surface exclusion, same as TrackingLiveMap.tsx. .rp-container is a
          fixed `calc(100vh - 60px)` box with overflow: hidden, and
          .rp-map-wrapper is `position: absolute; inset: 0` — a PageHeader
          rendered above it here doesn't sit over the map, it renders inside
          the same box and gets covered by the absolutely-positioned map, the
          same failure mode CLAUDE.md documents for Email/Drive. */}
      {/* ── Background Fullscreen Map ── */}
      <div className="rp-map-wrapper">
        <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <MapTileLayer override={mapVariant} />
          <ClickToAddWaypoint onAdd={addWaypoint} />
          {waypoints.map((pos, i) => <Marker key={i} position={pos} icon={stopMarkerIcon} />)}
          {route && <Polyline positions={route.geometry} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />}
          {!route && waypoints.length > 1 && <Polyline positions={waypoints} pathOptions={{ color: 'var(--ink3)', weight: 3, dashArray: '8 8' }} />}
        </MapContainer>

        <div className="rp-map-controls">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rp-mc-btn" title="Map Layers">
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
      </div>

      {/* ── Floating Load Info Widget (Top Right) ── */}
      {selectedVehicle && (
        <div className="rp-widget-top-right">
          <div className="rp-widget-header">
            <div className="rp-widget-title">
              <Icon name="truck" size={16} /> Load Info
            </div>
            <Icon name="info" size={14} style={{ color: 'var(--ink3)' }} />
          </div>
          <div style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Icon name="package" size={14} color="#3b82f6" /> {selectedVehicle.type === 'REFRIGERATED' ? 'Refrigerated' : 'General Cargo'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '8px' }}>Cargo Weight</div>
          <div className="rp-widget-val-row">
            <span className="rp-widget-val">6,000 Kg</span>
            <span className="rp-widget-val-sub">{selectedVehicle.current_load_pct ?? 0}% of capacity</span>
          </div>
          <div className="rp-widget-bar-bg">
            <div className="rp-widget-bar-fill" style={{ width: `${selectedVehicle.current_load_pct ?? 0}%` }}></div>
          </div>
        </div>
      )}

      {/* ── Floating Left Panel ── */}
      <div className="rp-sidebar">
        {/* Header - Fixed */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', position: 'relative' }}>
            <Combobox
              options={vehicles.map(v => ({ value: v.id, label: `${v.name} (${v.plate_number})` }))}
              value={selectedVehicleId} onChange={setSelectedVehicleId}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="rp-sidebar-scroll">
          {selectedVehicle && (
            <>
              <div className="rp-driver-card">
                <img src={selectedVehicle.driver_avatar || 'https://i.pravatar.cc/150'} alt="Driver" className="rp-avatar" />
                <div className="rp-driver-info">
                  <div className="rp-driver-name">
                    {selectedVehicle.driver_name || 'Unassigned Driver'}
                    <span className="rp-driver-badge">Driver</span>
                  </div>
                  <div className="rp-driver-desc">Available for deliveries</div>
                </div>
              </div>

              <div className="rp-section-title">
                Info Truck & Container
                <Link to={`/tracking/vehicles/${selectedVehicle.id}`} style={{ fontSize: '11px', color: '#2563eb', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>More details »</Link>
              </div>
              <div className="rp-truck-info-grid">
                <div className="rp-info-block"><Icon name="truck" size={16} /> <span>{selectedVehicle.plate_number || 'N/A'}</span></div>
                <div className="rp-info-block" style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ink3)', letterSpacing: 1, marginTop: 'auto' }}>TYPE</span>
                  <span style={{ marginTop: 2 }}>{selectedVehicle.type}</span>
                </div>
                <div className="rp-info-block"><Icon name="hash" size={16} /> <span>{selectedVehicle.id.split('-')[0].toUpperCase()}</span></div>
              </div>
            </>
          )}

          <div className="rp-section-title" style={{ marginTop: '24px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="compass" size={16} color="#2563eb" /> ETA & Route Tracking Optimization</span>
          </div>
          
          <div className="rp-input-row">
            <div>
              <label className="rp-label">Destination Address</label>
              <input 
                className="rp-input" 
                placeholder="Click map to add waypoints..." 
                value={destinationStr || (waypoints.length > 0 ? `${waypoints.length} waypoints selected` : '')} 
                onChange={e => setDestinationStr(e.target.value)}
              />
            </div>
            <div>
              <label className="rp-label">Preferred Priority</label>
              <Select defaultValue="fast">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="economic">Economic</SelectItem>
                  <SelectItem value="avoid_tolls">Avoid Tolls</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <button className="rp-btn-generate" onClick={planRoute} disabled={waypoints.length < 2 || loading}>
            <Icon name="map" size={16} /> {loading ? 'Optimizing Route...' : 'Generate Route'}
          </button>
          
          {error && <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(220,38,38,0.1)', color: 'var(--red)', fontSize: '12px', borderRadius: '8px' }}>{error}</div>}

          {/* Results & Timeline Area */}
          {(route || waypoints.length > 0) && (
            <div className="rp-results-box">
              <div className="rp-section-title" style={{ margin: '0 0 4px' }}>{route ? 'Route Tracking Result' : 'Selected Waypoints'}</div>

              {route && (
                <>
                  <div className="rp-travel-est">travel estimate - {Math.floor(route.durationMin / 60)} Hours {Math.floor(route.durationMin % 60)} minutes ({route.distanceKm.toFixed(1)} km)</div>

                  <div className="rp-tabs" style={{ marginBottom: '20px' }}>
                    <div className={`rp-tab ${tab === 'fastest' ? 'active' : ''}`} onClick={() => setTab('fastest')}><Icon name="zap" size={12} style={{marginRight: 4}}/> Fastest Route</div>
                    <div className={`rp-tab ${tab === 'regular' ? 'active' : ''}`} onClick={() => setTab('regular')}>Regular Route</div>
                  </div>
                </>
              )}

              {/* Waypoints Timeline */}
              <div className="rp-timeline">
                {route ? route.waypoints.map((wp, idx) => {
                  const isStart = idx === 0;
                  const isEnd = idx === route.waypoints.length - 1;
                  const markerClass = isStart ? 'start' : isEnd ? 'end' : '';
                  return (
                  <div key={idx} className="rp-timeline-item">
                    <div className={`rp-timeline-marker ${markerClass}`}>{idx + 1}</div>
                    <div className="rp-timeline-content">
                      <div className="rp-tl-type">
                        <div className="rp-tl-type-badge">
                          <Icon name={idx === 0 ? "play" : idx === route.waypoints.length - 1 ? "checkCircle" : "mapPin"} size={12} />
                          {idx === 0 ? "Hook Container" : idx === route.waypoints.length - 1 ? "Transit Warehouse" : "Delivery Stop"}
                        </div>
                        <span style={{ color: 'var(--ink3)' }}>{idx === 0 ? 'Start' : idx === route.waypoints.length - 1 ? 'Termination' : 'Stop'}</span>
                      </div>
                      <div className="rp-tl-title">{wp.name}</div>
                      <div className="rp-tl-address">{wp.location[0].toFixed(4)}, {wp.location[1].toFixed(4)}</div>
                      <div className="rp-tl-meta">
                        <span><Icon name="arrowRight" size={10} style={{marginRight: 4}}/> {format(new Date(now.getTime() + wp.etaSeconds * 1000), "MM/dd/yy, hh:mm a")}</span>
                      </div>
                    </div>
                  </div>
                  );
                }) : waypoints.map((pos, idx) => (
                  <div key={idx} className="rp-timeline-item">
                    <div className="rp-timeline-marker">{idx + 1}</div>
                    <div className="rp-timeline-content" style={{ padding: '8px 12px' }}>
                      <div className="rp-tl-title" style={{ fontSize: '12px' }}>Waypoint {idx + 1}</div>
                      <div className="rp-tl-address" style={{ marginBottom: 0 }}>{pos[0].toFixed(4)}, {pos[1].toFixed(4)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="rp-btn-clear" onClick={clear}>Clear route</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
