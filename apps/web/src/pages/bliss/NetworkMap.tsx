import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapTileLayer } from '../../components/MapTileLayer.js';
import { Button } from '../../components/ui/button.js';
import type { CentreLive, GeoZone } from '../../lib/supportNetwork.js';

/**
 * Centres and zones on a map: one pin per centre, numbered with its open
 * tickets and coloured by state (red = tickets past SLA, gold = unassigned
 * work, green = open, grey = closed now); zones drawn as their circles.
 */
function pin(c: CentreLive) {
  const tone = c.breached ? 'var(--red)' : c.unassigned ? 'var(--gold)' : c.open_now ? 'var(--green)' : 'var(--ink3)';
  const html = `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${tone};border:2px solid var(--white);box-shadow:0 2px 6px rgba(0,0,0,.3)">
    <span style="transform:rotate(45deg);color:var(--white);font:700 12px/1 var(--font, system-ui)">${c.open}</span></div>`;
  return L.divIcon({ className: '', html, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
}

function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 11);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
  }, [map, JSON.stringify(points)]);
  return null;
}

export function NetworkMap({ centres, zones, onOpenInbox }: { centres: CentreLive[]; zones: GeoZone[]; onOpenInbox: (id: string) => void }) {
  const placed = centres.filter(c => c.latitude != null && c.longitude != null);
  const circles = zones.filter(z => z.center_lat != null && z.center_lng != null && z.radius_km);
  const points = useMemo(() => [
    ...placed.map(c => [Number(c.latitude), Number(c.longitude)] as [number, number]),
    ...circles.map(z => [Number(z.center_lat), Number(z.center_lng)] as [number, number]),
  ], [placed, circles]);
  const zoneName = (id: string | null) => zones.find(z => z.id === id)?.name;
  // SVG attributes can't take var(); read the workspace accent once.
  const accent = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--teal').trim() || 'teal', []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 'min(70vh, 640px)', minHeight: 360, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {/* East Africa until the network has coordinates to fit to. */}
        <MapContainer center={[-6.37, 34.89]} zoom={6} style={{ height: '100%', width: '100%', zIndex: 1 }}>
          <MapTileLayer />
          <FitTo points={points} />
          {circles.map(z => (
            <Circle key={z.id} center={[Number(z.center_lat), Number(z.center_lng)]} radius={Number(z.radius_km) * 1000}
              pathOptions={{ color: accent, weight: 1.5, fillOpacity: 0.06 }}>
              <Popup><strong>{z.name}</strong><br />{z.radius_km} km</Popup>
            </Circle>
          ))}
          {placed.map(c => (
            <Marker key={c.id} position={[Number(c.latitude), Number(c.longitude)]} icon={pin(c)} title={c.name}>
              <Popup>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 190 }}>
                  <strong>{c.name}</strong>
                  <span style={{ color: 'var(--ink3)' }}>{[zoneName(c.zone_id), c.city].filter(Boolean).join(' · ')} · {c.open_now ? 'Open now' : 'Closed now'}</span>
                  <span>{c.open} open · {c.unassigned} unassigned · {c.breached} past SLA</span>
                  <span>{c.agents_online}/{c.agents} agents online · {c.calls_24h} calls today{c.unanswered_calls_24h ? ` (${c.unanswered_calls_24h} unanswered)` : ''}</span>
                  <Button size="sm" onClick={() => onOpenInbox(c.id)}>Open inbox</Button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink3)' }}>
        {[['var(--red)', 'Tickets past SLA'], ['var(--gold)', 'Unassigned work'], ['var(--green)', 'Open, on track'], ['var(--ink3)', 'Closed now']].map(([c, l]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{l}</span>
        ))}
        <span>Number on a pin = open tickets.</span>
        {centres.length > placed.length && <span>{centres.length - placed.length} centre{centres.length - placed.length === 1 ? '' : 's'} without coordinates — add them on the Centres tab.</span>}
      </div>
    </div>
  );
}
