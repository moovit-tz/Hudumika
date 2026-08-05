import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';

const BRAND = 'var(--ink)';
const NAVY  = '#0e1f3d';

interface TrackingEvent {
  timestamp: string;
  location: string;
  description: string;
  status_code: string;
}

interface SharedSnap {
  tracking_type: 'AWB' | 'BL';
  tracking_number: string;
  carrier: string | null;
  origin_name: string | null;
  origin_code: string | null;
  dest_name: string | null;
  dest_code: string | null;
  current_location: string | null;
  status: string | null;
  status_code: string | null;
  eta: string | null;
  progress_pct: number;
  events: string | TrackingEvent[];
  created_at: string;
}

function parseEvts(raw: string | TrackingEvent[]): TrackingEvent[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  DELIVERED:       { bg: 'var(--bg)', fg: '#059669' },
  IN_TRANSIT:      { bg: 'var(--border)', fg: '#2563eb' },
  TRANSIT:         { bg: 'var(--border)', fg: '#2563eb' },
  PICKED_UP:       { bg: 'var(--bg)', fg: '#6366f1' },
  DEPARTED:        { bg: 'var(--border)', fg: '#0284c7' },
  CUSTOMS_CLEARED: { bg: '#fef9c3', fg: '#ca8a04' },
  ON_HOLD:         { bg: 'var(--bg)', fg: 'var(--red)' },
  DELAYED:         { bg: 'var(--bg)', fg: 'var(--red)' },
  ARRIVED:         { bg: 'var(--bg)', fg: '#059669' },
};

export const TrackingShared: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [snap, setSnap]     = useState<SharedSnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/v1/tracker/shared/${token}`)
      .then(setSnap)
      .catch((e: any) => setError(e.message ?? 'Not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const events = snap ? parseEvts(snap.events) : [];
  const sc = snap?.status_code ? STATUS_COLORS[snap.status_code] ?? { bg: 'var(--bg)', fg: '#64748b' } : { bg: 'var(--bg)', fg: '#64748b' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--white)', fontFamily: "'Inter', 'Helvetica Neue', sans-serif" }}>

      {/* Header */}
      <div style={{ background: NAVY, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-dark.svg" alt="Hudumika ClearOS" style={{ height: 28, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.18)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.6)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Shipment Tracker</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>ClearOS powered by Hudumika</div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px' }}>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: `3px solid #e2e8f0`, borderTopColor: BRAND, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading tracking information…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="alertCircle" size={28} color="var(--red)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Snapshot not found</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>This tracking link may have expired or been removed.</div>
          </div>
        )}

        {snap && !loading && (
          <>
            {/* Hero card */}
            <div style={{ background: NAVY, borderRadius: 18, padding: '28px 28px 24px', marginBottom: 16, color: '#fff' }}>

              {/* Top row: number + status */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                    {snap.tracking_type === 'AWB' ? 'Air Waybill' : 'Bill of Lading'} · {snap.carrier ?? 'Carrier unknown'}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', fontFamily: 'monospace', color: '#fff' }}>
                    {snap.tracking_number}
                  </div>
                </div>
                <div style={{ background: sc.bg, color: sc.fg, borderRadius: 8, padding: '5px 13px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {snap.status ?? 'Unknown'}
                </div>
              </div>

              {/* Route row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 2 }}>Origin</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{snap.origin_code ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 1, maxWidth: 100 }}>{snap.origin_name ?? ''}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ height: 2, width: '100%', background: 'rgba(255,255,255,.12)', borderRadius: 2, position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${snap.progress_pct}%`, background: `linear-gradient(90deg,${BRAND},#f97316)`, borderRadius: 2 }} />
                    <div style={{ position: 'absolute', top: '50%', left: `${snap.progress_pct}%`, transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: BRAND, boxShadow: `0 0 0 3px rgba(232,70,26,.3)` }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)' }}>{snap.progress_pct}% complete</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 2 }}>Destination</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{snap.dest_code ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 1, maxWidth: 100 }}>{snap.dest_name ?? ''}</div>
                </div>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'ETA', value: fmtDate(snap.eta) },
                  { label: 'Last Location', value: snap.current_location ?? '—' },
                  { label: 'Snapshot Date', value: fmtDate(snap.created_at) },
                ].map(k => (
                  <div key={k.label} style={{ background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{k.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Events */}
            {events.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '22px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 18 }}>
                  Tracking Events ({events.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {events.map((ev, i) => {
                    const isFirst = i === 0;
                    const evSc = STATUS_COLORS[ev.status_code] ?? { bg: 'var(--bg)', fg: '#64748b' };
                    return (
                      <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < events.length - 1 ? 18 : 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isFirst ? BRAND : 'var(--border)', flexShrink: 0, marginTop: 4 }} />
                          {i < events.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--bg)', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? 0 : 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: isFirst ? 700 : 500, color: isFirst ? '#1e293b' : '#334155' }}>{ev.description}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{ev.location}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>{fmtDate(ev.timestamp)}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtTime(ev.timestamp)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
              Tracking data is a saved snapshot · last updated {fmtDate(snap.created_at)}<br />
              <span style={{ color: BRAND, fontWeight: 600 }}>Hudumika ClearOS</span> — Freight Management Platform
            </div>
          </>
        )}
      </div>
    </div>
  );
};
