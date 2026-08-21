import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from './Icon.js';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';

/**
 * A live AIS position badge next to a shipment's vessel name, when one is
 * actually being tracked. The backend (customs.service.ts's AIS WebSocket
 * job, gated on env.AIS_API_KEY) has existed since before ClearOS had any
 * page that called it — this is that first caller. Deliberately silent when
 * there's no match: no key configured, the vessel hasn't broadcast near Dar
 * es Salaam recently, or the name doesn't match — the plain vessel name
 * (today's only behaviour) is exactly what renders in every one of those
 * cases, never a fake "tracking" state.
 */

interface VesselPosition {
  mmsi: string;
  imo?: string | null;
  vessel_name: string;
  // Postgres `numeric` columns come back through pg/Kysely as strings, not
  // JS numbers, to avoid silent precision loss — never call .toFixed() on
  // these without Number(...) first.
  latitude: string | number | null;
  longitude: string | number | null;
  speed: string | number | null;
  course: string | number | null;
  nav_status: string | null;
  destination: string | null;
  last_updated: string;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const STALE_MS = 6 * 60 * 60 * 1000; // AIS goes quiet in port; 6h is still "recent enough to trust"

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function VesselLiveStatus({ vesselName, mode }: { vesselName?: string | null; mode?: string | null }) {
  const [position, setPosition] = useState<VesselPosition | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setPosition(null);
    const name = vesselName?.trim();
    if (!name || !mode?.toUpperCase().startsWith('SEA')) return;
    let alive = true;
    apiFetch(`/v1/customs/vessels?q=${encodeURIComponent(name)}`)
      .then((rows: VesselPosition[]) => {
        if (!alive || !Array.isArray(rows) || rows.length === 0) return;
        const match = rows.find(r => r.vessel_name?.trim().toUpperCase() === name.toUpperCase()) ?? rows[0];
        if (Date.now() - new Date(match.last_updated).getTime() <= STALE_MS) setPosition(match);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [vesselName, mode]);

  if (!position) return <>{vesselName || '—'}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--ink)', textAlign: 'right' }}
        >
          <span>{vesselName}</span>
          <span style={{ display: 'inline-flex', flexShrink: 0, whiteSpace: 'nowrap', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: 'var(--green)', background: 'var(--green-l)', padding: '1px 6px', borderRadius: 20 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
            LIVE
          </span>
        </button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72 p-3">
        <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--ink)' }}>
            <Icon name="anchor" size={13} />
            {position.vessel_name}
          </div>
          {num(position.latitude) != null && num(position.longitude) != null && (
            <div style={{ color: 'var(--ink2)' }}>Position: {num(position.latitude)!.toFixed(3)}, {num(position.longitude)!.toFixed(3)}</div>
          )}
          {num(position.speed) != null && <div style={{ color: 'var(--ink2)' }}>Speed: {num(position.speed)!.toFixed(1)} kn{num(position.course) != null ? ` · course ${Math.round(num(position.course)!)}°` : ''}</div>}
          {position.nav_status && <div style={{ color: 'var(--ink2)' }}>Status: {position.nav_status}</div>}
          {position.destination && <div style={{ color: 'var(--ink2)' }}>Destination: {position.destination}</div>}
          <div style={{ color: 'var(--ink3)', fontSize: 11, marginTop: 2 }}>Last seen {relTime(position.last_updated)} · AIS, near Dar es Salaam</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
