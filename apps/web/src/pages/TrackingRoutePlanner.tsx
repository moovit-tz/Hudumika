import './FreightOperations.css';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';
import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import { Icon } from '../components/Icon.js';
import { MapTileLayer } from '../components/MapTileLayer.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import type { MapVariant } from '../components/MapTileLayer.js';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../components/ui/dropdown-menu.js';
import { Combobox } from '../components/ui/combobox.js';
import { Tip } from '../components/ui/tooltip.js';
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
  driver_name: string | null; driver_id: string | null; current_load_pct: number | null;
}

function ClickToAddWaypoint({ onAdd }: { onAdd: (pos: [number, number]) => void }) {
  useMapEvents({ click(e) { onAdd([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

// Custom markers
const stopMarkerIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color:#fff; width:16px; height:16px; border-radius:50%; border:4px solid var(--blue); box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>`,
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
  // Destination search text state
  const [destinationStr, setDestinationStr] = useState('');
  const [addresses, setAddresses] = useState<{display_name:string;lat:string;lon:string}[]>([]);
  const [searching, setSearching] = useState(false);
  const [savedTripId, setSavedTripId] = useState('');
  async function searchAddress() {
    if (!destinationStr.trim()) return;
    setSearching(true); setError('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(destinationStr.trim())}`);
      if (!response.ok) throw new Error('Address search is unavailable');
      const results = await response.json(); setAddresses(results);
      if (!results.length) setError('No matching addresses. Try a nearby landmark or select the point on the map.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Address search failed'); } finally { setSearching(false); }
  }
  async function bookTrip() {
    if (!route || !selectedVehicleId) return;
    setLoading(true); setError('');
    try { const trip = await apiFetch('/v1/tracking/trips', { method:'POST', body:JSON.stringify({vehicle_id:selectedVehicleId,origin:route.waypoints[0].name,destination:route.waypoints[route.waypoints.length-1].name,notes:`Road estimate: ${route.distanceKm.toFixed(1)} km, ${Math.round(route.durationMin)} min. Waypoints: ${JSON.stringify(waypoints)}. Requires truck clearance and dispatch review.`}) }); setSavedTripId(trip.id); } catch(e) { setError(e instanceof Error ? e.message : 'Trip could not be saved'); } finally { setLoading(false); }
  }
  const [mapVariant, setMapVariant] = useState<MapVariant | null>(null);

  useEffect(() => {
    apiFetch('/v1/tracking/vehicles').then(data => {
      setVehicles(data);
      if (data.length > 0) setSelectedVehicleId(data[0].id);
    }).catch(e => setError(e.message));
  }, []);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const addWaypoint = useCallback((pos: [number, number]) => {
    setWaypoints(prev => [...prev, pos]);
    setRoute(null); setSavedTripId('');
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
          {route && <Polyline positions={route.geometry} pathOptions={{ color: 'var(--blue)', weight: 5, opacity: 0.8 }} />}
          {!route && waypoints.length > 1 && <Polyline positions={waypoints} pathOptions={{ color: 'var(--ink3)', weight: 3, dashArray: '8 8' }} />}
        </MapContainer>

        <div className="rp-map-controls">
          <DropdownMenu>
            <Tip label="Map layers">
              <DropdownMenuTrigger asChild>
              <Button className="rp-mc-btn" aria-label="Map layers" data-ui-native-button="">
                <Icon name="layers" size={16} />
              </Button>
              </DropdownMenuTrigger>
            </Tip>
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
          <div className="rp-widget-cargo-type">
            <Icon name="package" size={14} color="var(--blue)" /> {selectedVehicle.type === 'REFRIGERATED' ? 'Refrigerated' : 'General Cargo'}
          </div>
          <div className="rp-widget-label">Cargo Weight</div>
          <div className="rp-widget-val-row">
            <span className="rp-widget-val">{(selectedVehicle as any).current_trip?.cargo_weight_kg == null ? 'Not recorded' : `${Number((selectedVehicle as any).current_trip.cargo_weight_kg).toLocaleString()} kg`}</span>
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
                <PersonAvatar userId={selectedVehicle.driver_id} kind="drivers" name={selectedVehicle.driver_name || 'Unassigned Driver'} size={40} />
                <div className="rp-driver-info">
                  <div className="rp-driver-name">
                    {selectedVehicle.driver_name || 'Unassigned Driver'}
                    <Badge variant="info">Driver</Badge>
                  </div>
                  <div className="rp-driver-desc">Assignment shown; dispatch readiness checked when booking</div>
                </div>
              </div>

              <div className="rp-section-title">
                Info Truck & Container
                <Link to={`/tracking/vehicles/${selectedVehicle.id}`} style={{ fontSize: '11px', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>More details »</Link>
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="compass" size={16} color="var(--blue)" /> Route planning</span>
          </div>
          
          <label className="rp-label" htmlFor="route-address">Add a stop</label>
          <div className="rp-address-search"><Input id="route-address" placeholder="Search address or place" value={destinationStr} onChange={e => setDestinationStr(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); void searchAddress(); } }} /><Button variant="outline" disabled={searching || !destinationStr.trim()} onClick={searchAddress}>Find</Button></div>
          {addresses.length > 0 && <Combobox value="" placeholder="Choose a matching address" options={addresses.map((address,index) => ({value:String(index),label:address.display_name}))} onChange={value => { const address=addresses[Number(value)]; addWaypoint([Number(address.lat),Number(address.lon)]); setAddresses([]); setDestinationStr(''); }} />}
          <p className="freight-note">Select two or more stops by address or map. Road estimates do not include live traffic or truck restrictions.</p>

          <Button onClick={planRoute} disabled={waypoints.length < 2 || loading} className="w-full" style={{ marginTop: '16px' }}>
            <Icon name="map" size={16} /> {loading ? 'Planning…' : 'Plan route'}
          </Button>
          
          {error && <div style={{ marginTop: '12px' }}><Banner variant="error">{error}</Banner></div>}

          {/* Results & Timeline Area */}
          {(route || waypoints.length > 0) && (
            <div className="rp-results-box">
              <div className="rp-section-title" style={{ margin: '0 0 4px' }}>{route ? 'Road route estimate' : 'Selected Waypoints'}</div>

              {route && (
                <>
                  <div className="rp-travel-est">travel estimate - {Math.floor(route.durationMin / 60)} Hours {Math.floor(route.durationMin % 60)} minutes ({route.distanceKm.toFixed(1)} km)</div>

                  <Button disabled={loading || !!savedTripId || !selectedVehicleId} onClick={bookTrip} className="w-full">{savedTripId ? 'Trip booked' : 'Book trip'}</Button>
                  {savedTripId && <Banner variant="success">Trip saved. Review the assignment and dispatch from <Link to="/tracking/shipments">Trips</Link>.</Banner>}

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
                        <Badge variant={idx === 0 ? 'success' : idx === route.waypoints.length - 1 ? 'brand' : 'info'}>
                          <Icon name={idx === 0 ? "play" : idx === route.waypoints.length - 1 ? "checkCircle" : "mapPin"} size={12} />
                          {idx === 0 ? "Start" : idx === route.waypoints.length - 1 ? "Destination" : "Delivery Stop"}
                        </Badge>
                        <span>{idx === 0 ? 'Start' : idx === route.waypoints.length - 1 ? 'Termination' : 'Stop'}</span>
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

              <Button variant="outline" onClick={clear} className="w-full" style={{ marginTop: '8px' }}>Clear route</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
