import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { getCompany } from '../data/companyStore.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface TrackingEvent {
  timestamp: string;
  location: string;
  description: string;
  status_code?: string;
}

interface Container {
  number: string;
  size: string;
  status?: string;
  seal?: string;
}

interface PortCallEvent {
  code: string;
  label: string;
  est?: string | null;
  act?: string | null;
}

interface PortCall {
  port_name: string;
  port_code: string;
  country_code: string;
  is_transshipment: boolean;
  events: PortCallEvent[];
}

interface TrackingResult {
  tracking_number: string;
  tracking_type: 'AWB' | 'BL';
  carrier: string;
  origin_name: string;
  origin_code: string;
  dest_name: string;
  dest_code: string;
  current_location: string;
  status: string;
  status_code: string;
  eta: string | null;
  eta_initial?: string | null;
  progress_pct: number;
  events: TrackingEvent[];
  vessel_name?: string;
  vessel_imo?: string;
  voyage_number?: string;
  service_name?: string;
  containers?: Container[];
  port_calls?: PortCall[];
  co2_emission?: number;
  transit_days?: number;
  source: 'live' | 'mock';
  provider?: 'ship24' | 'shipsgo';
}

interface TrackingSnapshot {
  id: string;
  tracking_type: 'AWB' | 'BL';
  tracking_number: string;
  carrier: string | null;
  origin_name: string | null;
  dest_name: string | null;
  current_location: string | null;
  status: string | null;
  status_code?: string;
  eta: string | null;
  progress_pct: number;
  shipment_id: string | null;
  share_token: string;
  created_at: string;
  events: string | TrackingEvent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const daysUntil = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

const parseEvents = (raw: string | TrackingEvent[]): TrackingEvent[] => {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
};

const STATUS: Record<string, { bg: string; fg: string; label: string; icon: IconName }> = {
  DELIVERED:       { bg: '#ecfdf5', fg: '#059669', label: 'Delivered',       icon: 'checkCircle' },
  IN_TRANSIT:      { bg: '#dbeafe', fg: '#2563eb', label: 'In Transit',       icon: 'globe'       },
  TRANSIT:         { bg: '#dbeafe', fg: '#2563eb', label: 'In Transit',       icon: 'globe'       },
  PICKED_UP:       { bg: '#ede9fe', fg: '#6366f1', label: 'Picked Up',        icon: 'package'     },
  DEPARTED:        { bg: '#e0f2fe', fg: '#0284c7', label: 'Departed',         icon: 'compass'     },
  CUSTOMS_CLEARED: { bg: '#fef9c3', fg: '#ca8a04', label: 'Customs Cleared',  icon: 'shield'      },
  ON_HOLD:         { bg: '#fee2e2', fg: '#dc2626', label: 'On Hold',          icon: 'alertCircle' },
  DELAYED:         { bg: '#fee2e2', fg: '#dc2626', label: 'Delayed',          icon: 'alertCircle' },
  ARRIVED:         { bg: '#ecfdf5', fg: '#059669', label: 'Arrived',          icon: 'mapPin'      },
};
const getStatus = (code?: string) =>
  STATUS[code?.toUpperCase() ?? ''] ?? { bg: 'var(--bg)', fg: '#64748b', label: code ?? 'Unknown', icon: 'info' as IconName };

// ── PDF generator ─────────────────────────────────────────────────────────────

// Brand color constant — matches CSS --teal: #0b1e3a
const BRAND = '#0b1e3a';
const NAVY  = '#0e1f3d';
const NAVY2 = '#1a3260';

function generatePDF(result: TrackingResult) {
  const co  = getCompany();
  const st  = getStatus(result.status_code);
  const days = daysUntil(result.eta);

  const logoHtml = co.logoUrl
    ? `<img src="${co.logoUrl}" style="max-height:44px;max-width:160px;object-fit:contain;display:block" alt="${co.name}" />`
    : `<div style="font-size:20px;font-weight:900;color:${NAVY};letter-spacing:-.02em">${co.name}</div>`;

  const evtRows = result.events.map(ev => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;font-weight:600">${ev.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${ev.location || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;white-space:nowrap">${fmtDate(ev.timestamp)} ${fmtTime(ev.timestamp)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Tracking Report — ${result.tracking_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  @page { size: A4; margin: 18mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.5; }

  /* Watermark — company name */
  body::before {
    content: '${co.name.toUpperCase()}';
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-35deg);
    font-size: 72px; font-weight: 900; letter-spacing: .05em;
    color: ${BRAND}; opacity: .035; pointer-events: none; z-index: 0;
    white-space: nowrap;
  }
  .page { position: relative; z-index: 1; }

  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 2.5px solid ${BRAND}; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-sub  { font-size: 10px; color: #64748b; letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
  .report-meta { text-align: right; font-size: 11px; color: #64748b; }

  .title-block { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; }
  .tracking-type { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 4px; }
  .tracking-num  { font-size: 26px; font-weight: 900; letter-spacing: .02em; font-family: monospace; color: ${NAVY}; }
  .carrier-line  { font-size: 13px; color: #64748b; margin-top: 4px; }
  .status-pill   { padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1.5px solid; }

  .journey-box { background: ${NAVY}; border-radius: 12px; padding: 20px 24px; margin-bottom: 22px; color: #f1f5f9; }
  .journey-route { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
  .port { text-align: center; min-width: 70px; }
  .port-code { font-size: 22px; font-weight: 900; font-family: monospace; }
  .port-name { font-size: 10px; color: #64748b; margin-top: 2px; }
  .track-line  { flex: 1; position: relative; height: 6px; background: rgba(255,255,255,.08); border-radius: 6px; }
  .track-fill  { height: 100%; background: linear-gradient(90deg,${NAVY2},${BRAND}); border-radius: 6px; }
  .journey-loc { text-align: center; font-size: 12px; color: #94a3b8; }
  .journey-loc strong { color: #f1f5f9; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 22px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; }
  .kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 4px; }
  .kpi-value { font-size: 17px; font-weight: 800; color: ${NAVY}; }
  .kpi-sub   { font-size: 10px; color: #64748b; margin-top: 2px; }

  .section-title { font-size: 13px; font-weight: 800; color: ${NAVY}; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f1f5f9; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; text-align: left; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) td { background: #fafafa; }

  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .footer strong { color: #64748b; }
  .footer-brand { display:flex; align-items:center; gap:6px; }
  .footer-dot { width:8px; height:8px; border-radius:50%; background:${BRAND}; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      ${logoHtml}
      <div class="brand-sub">Tracking Report</div>
    </div>
    <div class="report-meta">
      Generated: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br/>
      ${new Date().toLocaleTimeString('en-GB')} · ${result.source === 'mock' ? 'Demo Data' : 'Live Data'}
    </div>
  </div>

  <div class="title-block">
    <div>
      <div class="tracking-type">${result.tracking_type === 'AWB' ? 'Air Waybill (AWB)' : 'Bill of Lading (B/L)'}</div>
      <div class="tracking-num">${result.tracking_number}</div>
      <div class="carrier-line">Carrier: <strong>${result.carrier}</strong></div>
    </div>
    <div class="status-pill" style="background:${st.bg};color:${st.fg};border-color:${st.fg}40">${st.label}</div>
  </div>

  <div class="journey-box">
    <div class="journey-route">
      <div class="port"><div class="port-code">${result.origin_code}</div><div class="port-name">${result.origin_name}</div></div>
      <div class="track-line"><div class="track-fill" style="width:${result.progress_pct}%"></div></div>
      <div class="port"><div class="port-code">${result.dest_code}</div><div class="port-name">${result.dest_name}</div></div>
    </div>
    <div class="journey-loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><path d="M12 13a3 3 0 100-6 3 3 0 000 6z"/></svg>Currently at <strong>${result.current_location}</strong> &nbsp;·&nbsp; ${result.progress_pct}% complete</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Estimated Arrival</div>
      <div class="kpi-value" style="font-size:14px">${fmtDate(result.eta)}</div>
      <div class="kpi-sub">${result.eta ? new Date(result.eta).toLocaleDateString('en-GB', { weekday: 'long' }) : ''}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Days Remaining</div>
      <div class="kpi-value" style="color:${(days ?? 0) < 0 ? '#dc2626' : (days ?? 99) <= 3 ? '#d97706' : NAVY}">${days == null ? '—' : days > 0 ? '~' + days + ' days' : days === 0 ? 'Today' : Math.abs(days) + 'd overdue'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Progress</div>
      <div class="kpi-value">${result.progress_pct}%</div>
      <div class="kpi-sub">${result.events.length} checkpoints</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Mode</div>
      <div class="kpi-value" style="font-size:14px">${result.tracking_type === 'AWB' ? 'Air Freight' : 'Ocean Freight'}</div>
      <div class="kpi-sub">${result.carrier}</div>
    </div>
  </div>

  <div class="section-title">Tracking Events</div>
  <table>
    <thead><tr><th>Event</th><th>Location</th><th>Date &amp; Time</th></tr></thead>
    <tbody>${evtRows}</tbody>
  </table>

  <div class="footer">
    <div class="footer-brand"><div class="footer-dot"></div><strong>${co.name}</strong> · ClearOS powered by Hudumika</div>
    <div>Generated automatically · may contain estimated data &copy; ${new Date().getFullYear()}</div>
  </div>
</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { showAlert('Allow popups to generate PDF'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

// ── Snapshot card (dark, embeddable) ─────────────────────────────────────────

export const SnapshotCard = React.forwardRef<HTMLDivElement, { result: TrackingResult }>(({ result }, ref) => {
  const days = daysUntil(result.eta);
  const st = getStatus(result.status_code);
  return (
    <div ref={ref} style={{
      background: `linear-gradient(150deg, ${NAVY} 0%, ${NAVY2} 100%)`,
      borderRadius: 18, padding: '22px 22px 18px', color: 'var(--bg)',
      fontFamily: 'var(--font)', border: '1px solid rgba(255,255,255,.06)',
      boxShadow: '0 24px 64px rgba(0,0,0,.4)', position: 'relative', overflow: 'hidden',
    }}>
      {/* glow blobs */}
      <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,70,26,.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -40, left: -40, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,70,26,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `linear-gradient(135deg,${NAVY2},${BRAND})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>
              {result.tracking_type === 'AWB' ? 'Air Waybill' : 'Bill of Lading'} · {result.carrier}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: '.03em' }}>
              {result.tracking_number}
            </div>
          </div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: st.fg + '22', color: st.fg, border: `1px solid ${st.fg}30`, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <Icon name={st.icon} size={10} color={st.fg} />
          {st.label}
        </div>
      </div>

      {/* Route */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ textAlign: 'center', minWidth: 54 }}>
            <div style={{ fontSize: 19, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: '-.01em' }}>{result.origin_code}</div>
            <div style={{ fontSize: 9, color: 'var(--ink2)', marginTop: 1, maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.origin_name}</div>
          </div>
          <div style={{ flex: 1, position: 'relative', height: 30, display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'rgba(255,255,255,.06)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', left: 0, width: `${result.progress_pct}%`, height: 2, background: `linear-gradient(90deg,${NAVY2},${BRAND})`, borderRadius: 2 }} />
            <div style={{ position: 'absolute', left: `calc(${result.progress_pct}% - 13px)` }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: NAVY, border: `2px solid ${BRAND}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 14px rgba(232,70,26,.45)` }}>
                <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={11} color={BRAND} />
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 54 }}>
            <div style={{ fontSize: 19, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: '-.01em' }}>{result.dest_code}</div>
            <div style={{ fontSize: 9, color: 'var(--ink2)', marginTop: 1, maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.dest_name}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon name="mapPin" size={10} color={BRAND} />
          Currently at <strong style={{ color: 'var(--ink3)', marginLeft: 3 }}>{result.current_location}</strong>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14 }}>
        {[
          { icon: 'calendar' as IconName, label: 'ETA',        value: fmtDate(result.eta) },
          { icon: 'clock'    as IconName, label: 'Time Left',  value: days == null ? '—' : days > 0 ? `~${days} days` : days === 0 ? 'Today' : 'Overdue' },
          { icon: 'layers'   as IconName, label: 'Progress',   value: `${result.progress_pct}%` },
          { icon: 'activity' as IconName, label: 'Updates',    value: `${result.events.length} events` },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 9, padding: '9px 11px', border: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(232,70,26,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={m.icon} size={12} color={BRAND} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{m.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bg)', marginTop: 1 }}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: `linear-gradient(135deg,${NAVY2},${BRAND})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="globe" size={9} color="#fff" />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.04em' }}>Hudumika ClearOS</span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--ink)' }}>{result.source === 'mock' ? 'Demo' : 'Live'} · {fmtDate(new Date().toISOString())}</span>
      </div>
    </div>
  );
});
SnapshotCard.displayName = 'SnapshotCard';

// ── Embedded badge ────────────────────────────────────────────────────────────

export function TrackingBadge({ snap }: { snap: Pick<TrackingSnapshot, 'tracking_type' | 'tracking_number' | 'status' | 'status_code' | 'eta' | 'progress_pct'> }) {
  const days = daysUntil(snap.eta ?? null);
  const st = getStatus(snap.status_code);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', fontSize: 11 }}>
      <Icon name={snap.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={12} color={st.fg} />
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.03em', color: 'var(--ink)' }}>{snap.tracking_number}</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <span style={{ color: st.fg, fontWeight: 600 }}>{st.label}</span>
      {days != null && <span style={{ color: 'var(--ink3)' }}>· {days > 0 ? `${days}d` : days === 0 ? 'Today' : 'OVD'}</span>}
    </div>
  );
}

// ── Metric tile ───────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, accent = 'var(--teal)' }: { icon: IconName; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={16} color={accent} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1, letterSpacing: '-.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export const Tracker: React.FC = () => {
  const isMobile = useIsMobile();

  const [trackType, setTrackType] = useState<'AWB' | 'BL'>('AWB');
  const [inputNumber, setInputNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [snapshots, setSnapshots] = useState<TrackingSnapshot[]>([]);
  const [savingSnap, setSavingSnap] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(true);
  const [demurrageContainers, setDemurrageContainers] = useState<any[]>([]);
  const [carrierReliability, setCarrierReliability] = useState<any | null>(null);

  useEffect(() => {
    loadSnapshots();
    apiFetch('/v1/shipments').then((d: any) => setShipments(d?.data ?? d ?? [])).catch(() => {});
  }, []);

  const loadSnapshots = useCallback(async () => {
    setLoadingSnaps(true);
    try { setSnapshots(await apiFetch('/v1/tracker/snapshots') ?? []); }
    catch { setSnapshots([]); }
    finally { setLoadingSnaps(false); }
  }, []);

  const handleInput = (v: string) => {
    setInputNumber(v);
    const n = v.trim();
    if (!n) return; // don't reset type on clear — user may have manually chosen
    if (/^\d{3}-?\d/.test(n)) setTrackType('AWB');           // standard AWB: 123-12345678
    else if (/^[A-Z]{2,4}\d{6,}/i.test(n)) setTrackType('BL'); // BL: 4 letters + digits (MAEU1234...)
    // otherwise leave the user's chosen type unchanged
  };

  const handleTrack = async () => {
    if (!inputNumber.trim()) return;
    setLoading(true); setError(null); setResult(null); setSavedId(null);
    setDemurrageContainers([]); setCarrierReliability(null);
    try {
      const r: TrackingResult = await apiFetch('/v1/tracker/track', { method: 'POST', body: JSON.stringify({ number: inputNumber.trim(), type: trackType }) });
      setResult(r);

      // Bridge to Demurrage: containers on this BL may already be tracked for dwell/demurrage.
      if (r.containers && r.containers.length > 0) {
        const numbers = r.containers.map(c => c.number).join(',');
        apiFetch(`/v1/demurrage/containers?container_numbers=${encodeURIComponent(numbers)}`)
          .then(setDemurrageContainers)
          .catch(() => {}); // demurrage entitlement may not be enabled — fail silently
      }

      // Bridge to carrier reliability analytics computed from this tenant's own history.
      apiFetch('/v1/cargotracker/dashboard/carrier-analysis')
        .then((rows: any[]) => setCarrierReliability((rows ?? []).find(row => row.carrier === r.carrier) ?? null))
        .catch(() => {});
    }
    catch (e: any) { setError(e.message ?? 'Tracking failed'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!result) return;
    setSavingSnap(true);
    try {
      const s = await apiFetch('/v1/tracker/snapshots', { method: 'POST', body: JSON.stringify({ ...result }) });
      setSavedId(s.id);
      await loadSnapshots();
    } catch (e: any) { showAlert(e.message ?? 'Save failed'); }
    finally { setSavingSnap(false); }
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/track/shared/${token}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const linkSnap = async (snapId: string, shipId: string) => {
    setLinkingId(snapId);
    try {
      await apiFetch(`/v1/tracker/snapshots/${snapId}/link`, { method: 'PATCH', body: JSON.stringify({ shipment_id: shipId }) });
      await loadSnapshots();
    } catch (e: any) { showAlert(e.message ?? 'Link failed'); }
    finally { setLinkingId(null); }
  };

  const deleteSnap = async (id: string) => {
    if (!(await showConfirm('Delete this snapshot?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/tracker/snapshots/${id}`, { method: 'DELETE' });
      setSnapshots(p => p.filter(s => s.id !== id));
    } catch (e: any) { showAlert(e.message ?? 'Delete failed'); }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editCarrier, setEditCarrier] = useState('');
  const [retrackingId, setRetrackingId] = useState<string | null>(null);

  const startEdit = (snap: TrackingSnapshot) => {
    setEditingId(snap.id);
    setEditNumber(snap.tracking_number);
    setEditCarrier(snap.carrier ?? '');
  };

  const saveEdit = async () => {
    if (!editingId || !editNumber.trim()) return;
    try {
      await apiFetch(`/v1/tracker/snapshots/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tracking_number: editNumber.trim(), carrier: editCarrier.trim() || null }),
      });
      setEditingId(null);
      await loadSnapshots();
    } catch (e: any) { showAlert(e.message ?? 'Update failed'); }
  };

  // ── Live (AJAX) search suggestions under the tracking input ──
  // Matches saved snapshots locally + queries the shipments API as you type,
  // so an operator can pull up an already-known BL/AWB instead of retyping it.
  interface Suggestion { kind: 'snapshot' | 'shipment'; number: string; type: 'AWB' | 'BL'; label: string; sub: string }
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [suggLoading, setSuggLoading] = useState(false);
  const suggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = inputNumber.trim().toUpperCase();
    if (suggTimer.current) clearTimeout(suggTimer.current);
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return; }
    setSuggLoading(true);
    suggTimer.current = setTimeout(async () => {
      const out: Suggestion[] = [];
      // 1. Saved snapshots (local)
      for (const s of snapshots) {
        if (s.tracking_number.toUpperCase().includes(q)) {
          out.push({ kind: 'snapshot', number: s.tracking_number, type: s.tracking_type as 'AWB' | 'BL', label: s.tracking_number, sub: `Saved · ${s.carrier ?? s.tracking_type} · ${s.status ?? ''}` });
        }
        if (out.length >= 4) break;
      }
      // 2. Shipments API (live)
      try {
        const res = await apiFetch(`/v1/shipments?search=${encodeURIComponent(q)}`);
        const rows = res?.data ?? res ?? [];
        for (const sh of rows) {
          const num = sh.bl_number || sh.awb_number;
          if (!num) continue;
          if (out.some(o => o.number === num)) continue;
          out.push({
            kind: 'shipment',
            number: num,
            type: sh.bl_number ? 'BL' : 'AWB',
            label: num,
            sub: `${sh.ref_number} · ${sh.customer_name ?? sh.goods_desc ?? 'Shipment'}`,
          });
          if (out.length >= 8) break;
        }
      } catch { /* shipments module not available — local matches only */ }
      setSuggestions(out);
      setShowSugg(out.length > 0);
      setSuggLoading(false);
    }, 300);
    return () => { if (suggTimer.current) clearTimeout(suggTimer.current); };
  }, [inputNumber, snapshots]);

  const pickSuggestion = (s: Suggestion) => {
    setInputNumber(s.number);
    setTrackType(s.type);
    setShowSugg(false);
  };

  // Re-run tracking for a saved entry and write the fresh status back onto it
  const retrack = async (snap: TrackingSnapshot) => {
    setRetrackingId(snap.id);
    try {
      const r = await apiFetch('/v1/tracker/track', { method: 'POST', body: JSON.stringify({ number: snap.tracking_number, type: snap.tracking_type }) });
      await apiFetch(`/v1/tracker/snapshots/${snap.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: r.status, current_location: r.current_location, eta: r.eta, progress_pct: r.progress_pct }),
      });
      await loadSnapshots();
    } catch (e: any) { showAlert(e.message ?? 'Refresh failed'); }
    finally { setRetrackingId(null); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const p = isMobile ? '16px 14px' : '24px 28px';
  const card: React.CSSProperties = { background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', padding: isMobile ? '18px 16px' : '22px 26px', marginBottom: 16 };

  return (
    <div style={{ padding: p, boxSizing: 'border-box', width: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .tr-fade { animation: fadeUp .28s ease both; }
        .tr-btn { transition: all .15s ease; }
        .tr-btn:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,.12); }
        .tr-btn:active:not(:disabled) { transform: translateY(0); }
        .tr-input:focus { border-color: var(--teal) !important; box-shadow: 0 0 0 3px rgba(8,145,178,.12) !important; }
      `}</style>

      {/* ── Header ── */}
      <PageHeader
        crumbs={['Shipments', 'Tracker']}
        titlePlain="AWB & BL"
        titleEm="tracker"
        subtitle="Track air waybills and bills of lading · save snapshots · embed in shipment cards."
        actions={result?.source === 'mock' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 10, fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>
            <Icon name="alertCircle" size={13} color="var(--gold)" />
            Demo mode — add Ship24 key in Settings for live data
          </div>
        ) : undefined}
      />

      {/* ── Search card ── */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 220px', gap: 0, padding: 0, overflow: 'hidden' }}>
        {/* Left: input */}
        <div style={{ padding: isMobile ? '20px 18px' : '24px 28px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'var(--bg)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
            {(['AWB', 'BL'] as const).map(t => (
              <button key={t} className="tr-btn" onClick={() => setTrackType(t)} style={{
                height: 32, padding: '0 16px', borderRadius: 'var(--r)',
                border: 'none',
                background: trackType === t ? 'var(--white)' : 'transparent',
                color: trackType === t ? 'var(--ink)' : 'var(--ink3)',
                boxShadow: trackType === t ? '0 1px 4px rgba(0,0,0,.10)' : 'none',
                fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Icon name={t === 'AWB' ? 'compass' : 'anchor'} size={12} color={trackType === t ? 'var(--teal)' : 'var(--ink3)'} />
                {t === 'AWB' ? 'Air Waybill' : 'Bill of Lading'}
              </button>
            ))}
          </div>

          {/* Input + button */}
          <div style={{ display: 'flex', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: isMobile ? '100%' : 0 }}>
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}>
                <Icon name={trackType === 'AWB' ? 'compass' : 'anchor'} size={18} color="var(--ink3)" />
              </div>
              <input
                type="text"
                value={inputNumber}
                onChange={e => handleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setShowSugg(false); handleTrack(); } if (e.key === 'Escape') setShowSugg(false); }}
                onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                onBlur={() => setTimeout(() => setShowSugg(false), 180)}
                placeholder={trackType === 'AWB' ? 'e.g. 006-12345678' : 'e.g. MAEU1234567890'}
                className="tr-input"
                style={{
                  width: '100%', height: 50, paddingLeft: 46, paddingRight: 14,
                  border: '1.5px solid var(--border)', borderRadius: 12,
                  fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700,
                  background: 'var(--bg)', color: 'var(--ink)',
                  boxSizing: 'border-box', outline: 'none',
                }}
              />
              {suggLoading && inputNumber.trim().length >= 2 && (
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
              )}
              {showSugg && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 40, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden' }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={`${s.kind}-${s.number}-${i}`}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 'var(--ds-btn-py) 14px', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: s.kind === 'snapshot' ? 'rgba(8,145,178,.1)' : 'rgba(232,70,26,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={s.type === 'AWB' ? 'compass' : 'anchor'} size={13} color={s.kind === 'snapshot' ? 'var(--teal)' : BRAND} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>{s.kind === 'snapshot' ? 'Saved' : 'Shipment'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="tr-btn"
              onClick={handleTrack}
              disabled={loading || !inputNumber.trim()}
              style={{
                height: 50, padding: '0 30px', borderRadius: 'var(--r)',
                border: inputNumber.trim() && !loading ? 'none' : '1.5px solid var(--border)',
                background: inputNumber.trim() && !loading ? `linear-gradient(135deg,${NAVY},${BRAND})` : 'var(--bg)',
                color: inputNumber.trim() && !loading ? '#fff' : 'var(--ink3)',
                fontFamily: 'var(--font)', fontWeight: 800, fontSize: 14, cursor: loading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
              } as React.CSSProperties}
            >
              {loading
                ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Tracking…</>
                : <><Icon name="search" size={16} color={inputNumber.trim() ? '#fff' : 'var(--ink3)'} />Track</>
              }
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '11px 14px', background: 'var(--red-l)', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alertCircle" size={14} color="var(--red)" />
              {error}
            </div>
          )}
        </div>

        {/* Right: format guide (desktop) */}
        {!isMobile && (
          <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg)', padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Number formats</div>
            {[
              { icon: 'compass' as IconName, label: 'Air Waybill', eg: '006-12345678', c: BRAND },
              { icon: 'anchor'  as IconName, label: 'Bill of Lading', eg: 'MAEU1234567890', c: NAVY },
              { icon: 'container' as IconName, label: 'Container', eg: 'MSCU1234567', c: 'var(--gold)' },
            ].map(h => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: h.c + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={h.icon} size={13} color={h.c} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{h.label}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{h.eg}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="tr-fade">
          {/* Journey dark banner */}
          <div style={{
            background: `linear-gradient(150deg,${NAVY},${NAVY2})`,
            borderRadius: 16, border: '1px solid rgba(255,255,255,.06)',
            padding: isMobile ? '20px 18px' : '24px 30px', marginBottom: 16, color: 'var(--bg)',
            boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          }}>
            {/* Top row: carrier + BL + status */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(232,70,26,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={20} color={BRAND} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 2 }}>{result.carrier}{result.service_name ? ` · ${result.service_name}` : ''}</div>
                  <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: '.02em', lineHeight: 1.1 }}>{result.tracking_number}</div>
                  {result.vessel_name && (
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="ship" size={11} color="var(--ink3)" />
                      {result.vessel_name}{result.voyage_number ? <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink2)' }}> · VOY {result.voyage_number}</span> : ''}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Delay badge */}
                {result.eta && result.eta_initial && result.eta !== result.eta_initial && (() => {
                  const delayDays = Math.round((new Date(result.eta).getTime() - new Date(result.eta_initial).getTime()) / 86_400_000);
                  return delayDays !== 0 ? (
                    <div style={{ padding: '5px 12px', borderRadius: 20, background: delayDays > 0 ? 'rgba(220,38,38,.2)' : 'rgba(5,150,105,.2)', color: delayDays > 0 ? '#fca5a5' : '#6ee7b7', border: `1px solid ${delayDays > 0 ? 'rgba(220,38,38,.3)' : 'rgba(5,150,105,.3)'}`, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={delayDays > 0 ? 'alertCircle' : 'checkCircle'} size={11} color={delayDays > 0 ? '#fca5a5' : '#6ee7b7'} />
                      {delayDays > 0 ? `+${delayDays}d delay` : `${Math.abs(delayDays)}d early`}
                    </div>
                  ) : null;
                })()}
                {(() => { const st = getStatus(result.status_code); return (
                  <div style={{ padding: '6px 16px', borderRadius: 20, background: st.fg + '22', color: st.fg, border: `1px solid ${st.fg}33`, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name={st.icon} size={13} color={st.fg} />{st.label}
                  </div>
                ); })()}
              </div>
            </div>

            {/* Container chips */}
            {result.containers && result.containers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {result.containers.map(c => (
                  <div key={c.number} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '4px 10px', fontSize: 11 }}>
                    <Icon name="container" size={11} color={BRAND} />
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--bg)', letterSpacing: '.03em' }}>{c.number}</span>
                    <span style={{ color: 'var(--ink2)', fontSize: 10 }}>{c.size}</span>
                  </div>
                ))}
                {result.co2_emission && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(5,150,105,.12)', border: '1px solid rgba(5,150,105,.2)', borderRadius: 7, padding: '4px 10px', fontSize: 11, color: '#6ee7b7' }}>
                    <Icon name="activity" size={11} color="#6ee7b7" />
                    {result.co2_emission.toLocaleString()} kg CO₂
                  </div>
                )}
              </div>
            )}

            {/* Route visualization */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20, marginBottom: 18 }}>
              <div style={{ textAlign: 'center', minWidth: isMobile ? 52 : 72, flexShrink: 0 }}>
                <div style={{ fontSize: isMobile ? 22 : 30, fontWeight: 900, fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-.01em' }}>{result.origin_code}</div>
                <div style={{ fontSize: 10, color: 'var(--ink2)', marginTop: 3 }}>{result.origin_name}</div>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 48, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: 0, width: `${result.progress_pct}%`, height: 3, background: `linear-gradient(90deg,${NAVY2},${BRAND})`, borderRadius: 3, transition: 'width .9s cubic-bezier(.34,1.56,.64,1)' }} />
                <div style={{ position: 'absolute', left: `calc(${result.progress_pct}% - 18px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'left .9s cubic-bezier(.34,1.56,.64,1)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: BRAND, background: 'rgba(232,70,26,.15)', border: '1px solid rgba(232,70,26,.3)', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {result.current_location}
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: NAVY, border: `2.5px solid ${BRAND}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 20px rgba(232,70,26,.45)` }}>
                    <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={15} color={BRAND} />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: isMobile ? 52 : 72, flexShrink: 0 }}>
                <div style={{ fontSize: isMobile ? 22 : 30, fontWeight: 900, fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-.01em' }}>{result.dest_code}</div>
                <div style={{ fontSize: 10, color: 'var(--ink2)', marginTop: 3 }}>{result.dest_name}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,.07)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${result.progress_pct}%`, background: `linear-gradient(90deg,${NAVY2},${BRAND})`, borderRadius: 5, transition: 'width .9s ease' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: BRAND, fontFamily: 'var(--mono)', flexShrink: 0 }}>{result.progress_pct}%</span>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            <KpiCard icon="calendar" label="Estimated Arrival" accent="var(--teal)"
              value={fmtDate(result.eta)}
              sub={result.eta ? new Date(result.eta).toLocaleDateString('en-GB', { weekday: 'long' }) : undefined}
            />
            <KpiCard icon="clock" label="Days Remaining" accent="var(--navy)"
              value={(() => { const d = daysUntil(result.eta); return d == null ? '—' : d > 0 ? `~${d}` : d === 0 ? 'Today' : 'Overdue'; })()}
              sub={(() => { const d = daysUntil(result.eta); return d != null && d < 0 ? `${Math.abs(d)}d overdue` : d != null && d <= 3 ? 'Arriving very soon' : undefined; })()}
            />
            <KpiCard icon="layers" label="Journey Progress" accent="var(--green)"
              value={`${result.progress_pct}%`}
              sub={`${result.events.length} tracking events`}
            />
            <KpiCard icon="truck" label="Carrier & Mode" accent="var(--gold)"
              value={result.carrier}
              sub={result.tracking_type === 'AWB' ? 'Air Freight' : 'Ocean Freight'}
            />
          </div>

          {/* ── Port Routing Table (ShipsGo / rich data) ── */}
          {result.port_calls && result.port_calls.length > 0 && (
            <div style={{ ...card, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="map" size={16} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Port Routing</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{result.port_calls.length} ports · actual dates confirmed · estimated shown in italic</div>
                </div>
                {result.provider && (
                  <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px' }}>
                    via {result.provider === 'shipsgo' ? 'ShipsGo' : 'Ship24'}
                  </div>
                )}
              </div>

              {/* All unique event codes across all port calls */}
              {(() => {
                // Fixed chronological order: gate in → arrive → discharge → load → depart → gate out
                const CODE_ORDER = ['EMSH', 'GTIN', 'ARRV', 'DISC', 'LOAD', 'DEPA', 'GTOT', 'EMRT'];
                const presentCodes = new Set(result.port_calls!.flatMap(pc => pc.events.map(e => e.code)));
                const allCodes = CODE_ORDER.filter(c => presentCodes.has(c));
                const codeLabels: Record<string, string> = {
                  EMSH: 'Empty Ship', GTIN: 'Gate In', ARRV: 'Arrived',
                  DISC: 'Discharged', LOAD: 'Loaded', DEPA: 'Departed',
                  GTOT: 'Gate Out', EMRT: 'Empty Return',
                };

                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600, fontFamily: 'var(--font)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px 10px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.07em', minWidth: 140 }}>Port</th>
                        {allCodes.map(code => (
                          <th key={code} style={{ textAlign: 'center', padding: '8px 10px 10px', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>
                            {codeLabels[code] ?? code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.port_calls!.map((pc, pi) => {
                        const isLast = pi === result.port_calls!.length - 1;
                        const isActive = pc.events.some(e => e.act) && !pc.events.every(e => e.act);
                        return (
                          <tr key={pc.port_code} style={{
                            borderBottom: isLast ? 'none' : '1px solid var(--border)',
                            background: isActive ? 'var(--teal-l)' : 'transparent',
                          }}>
                            {/* Port name cell */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isActive ? 'var(--teal)' : pc.events.every(e => e.act) ? 'var(--green)' : 'var(--border)' }} />
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{pc.port_name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontFamily: 'var(--mono)' }}>{pc.port_code}</span>
                                    {pc.is_transshipment && <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, color: 'var(--ink3)' }}>T/S</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {/* Event date cells */}
                            {allCodes.map(code => {
                              const ev = pc.events.find(e => e.code === code);
                              const date = ev?.act ?? ev?.est ?? null;
                              const isActual = !!ev?.act;
                              return (
                                <td key={code} style={{ padding: '10px', textAlign: 'center', verticalAlign: 'middle' }}>
                                  {date ? (
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: isActual ? 700 : 400, color: isActual ? 'var(--ink)' : 'var(--ink3)', fontStyle: isActual ? 'normal' : 'italic', whiteSpace: 'nowrap' }}>
                                        {fmtDate(date)}
                                      </div>
                                      {isActual && (
                                        <div style={{ fontSize: 9, color: 'var(--teal)', fontWeight: 700, marginTop: 1 }}>✓ actual</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--border)', fontSize: 14 }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}

          {/* Timeline + snapshot */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 16 }}>

            {/* Events */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="activity" size={16} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Tracking Events</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{result.events.length} updates recorded</div>
                </div>
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {result.events.map((ev, i) => {
                  const st = getStatus(ev.status_code);
                  return (
                    <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 22, position: 'relative' }}>
                      {i < result.events.length - 1 && <div style={{ position: 'absolute', left: 16, top: 36, bottom: -22, width: 1, background: 'var(--border)' }} />}
                      <div style={{ width: 33, height: 33, borderRadius: '50%', flexShrink: 0, background: i === 0 ? st.bg : 'var(--bg)', border: `2px solid ${i === 0 ? st.fg : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={st.icon} size={14} color={i === 0 ? st.fg : 'var(--ink3)'} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 3 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{ev.description}</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink3)' }}>
                            <Icon name="mapPin" size={10} color="var(--ink3)" />{ev.location || '—'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{fmtDate(ev.timestamp)} · {fmtTime(ev.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Snapshot panel */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="save" size={16} color="var(--teal)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Tracking Snapshot</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Save · Share · Embed · PDF</div>
                </div>
              </div>

              <div style={{ margin: '16px 0' }}>
                <SnapshotCard result={result} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!savedId ? (
                  <button className="tr-btn" onClick={handleSave} disabled={savingSnap} style={{
                    height: 44, borderRadius: 'var(--r)', border: 'none', width: '100%',
                    background: `linear-gradient(135deg,${NAVY},${BRAND})`,
                    color: '#fff', fontFamily: 'var(--font)', fontWeight: 800, fontSize: 13,
                    cursor: savingSnap ? 'default' : 'pointer', opacity: savingSnap ? .7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    {savingSnap
                      ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Saving…</>
                      : <><Icon name="save" size={14} color="#fff" />Save Snapshot</>
                    }
                  </button>
                ) : (
                  <div style={{ padding: '11px 14px', borderRadius: 11, background: 'var(--green-l)', border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
                    <Icon name="checkCircle" size={15} color="var(--green)" />
                    Snapshot saved
                  </div>
                )}

                {savedId && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button className="tr-btn" onClick={() => copyLink(snapshots.find(s => s.id === savedId)?.share_token ?? '')} style={{
                      height: 40, borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--white)',
                      color: 'var(--teal)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Icon name="link" size={13} color="var(--teal)" />
                      {copied ? 'Copied!' : 'Share Link'}
                    </button>
                    <button className="tr-btn" onClick={() => generatePDF(result)} style={{
                      height: 40, borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--white)',
                      color: 'var(--ink2)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Icon name="fileText" size={13} color="var(--teal)" />
                      PDF Report
                    </button>
                  </div>
                )}

                {result && (
                  <button className="tr-btn" onClick={() => generatePDF(result)} style={{
                    height: 38, borderRadius: 'var(--r)', border: '1.5px dashed var(--border)', background: 'transparent',
                    color: 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 11, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Icon name="download" size={12} color="var(--ink3)" />
                    Export PDF without saving
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Arrival Analytics + Demurrage bridge ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 16, marginTop: 16 }}>
            {/* Arrival Analytics */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="barChart2" size={16} color="var(--blue)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Arrival Analytics</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{result.carrier} reliability, computed from your own tracked shipments</div>
                </div>
              </div>
              {!carrierReliability || carrierReliability.on_time_pct === null ? (
                <div style={{ padding: '20px 4px', fontSize: 12.5, color: 'var(--ink3)' }}>
                  Not enough history for {result.carrier} yet — save a few more shipments on this carrier to build a reliability rating.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                  {[
                    { label: 'On-time Rate', value: `${carrierReliability.on_time_pct}%`, accent: carrierReliability.on_time_pct >= 80 ? 'var(--green)' : carrierReliability.on_time_pct >= 50 ? 'var(--gold)' : 'var(--red)' },
                    { label: 'Avg Deviation', value: carrierReliability.avg_deviation_days === null ? '—' : `${carrierReliability.avg_deviation_days > 0 ? '+' : ''}${carrierReliability.avg_deviation_days}d`, accent: 'var(--ink)' },
                    { label: 'Avg Transit', value: carrierReliability.avg_transit_days === null ? '—' : `${carrierReliability.avg_transit_days}d`, accent: 'var(--ink)' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '14px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.accent, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--ink3)' }}>
                    Based on {carrierReliability.shipments} shipment{carrierReliability.shipments === 1 ? '' : 's'} tracked with {result.carrier}.
                  </div>
                </div>
              )}
            </div>

            {/* Demurrage bridge */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gold-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="alertTriangle" size={16} color="var(--gold)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Demurrage</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>Containers on this BL already under dwell tracking</div>
                </div>
              </div>
              {demurrageContainers.length === 0 ? (
                <div style={{ padding: '8px 4px', fontSize: 12.5, color: 'var(--ink3)' }}>
                  {result.containers && result.containers.length > 0
                    ? 'No demurrage records found for these containers yet.'
                    : 'No containers on this shipment.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {demurrageContainers.map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, background: c.demurrage_days > 0 ? 'var(--red-l)' : 'var(--bg)', border: `1px solid ${c.demurrage_days > 0 ? '#fca5a5' : 'var(--border)'}` }}>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.container_number}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>{c.container_size} · {c.status}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: c.demurrage_days > 0 ? 'var(--red)' : 'var(--ink2)' }}>
                          {c.demurrage_days > 0 ? `${c.demurrage_days}d` : 'On time'}
                        </div>
                        {c.demurrage_cost > 0 && (
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: c.demurrage_currency || 'USD', minimumFractionDigits: 0 }).format(c.demurrage_cost)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Saved Snapshots ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(8,145,178,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="layers" size={16} color="var(--teal)" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>Saved Snapshots</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1 }}>{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <button className="tr-btn" onClick={loadSnapshots} style={{ height: 34, padding: '0 14px', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={13} />Refresh
          </button>
        </div>

        {loadingSnaps ? (
          <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="map" size={28} color="var(--ink3)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>No snapshots yet</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Track a shipment above and save it to see it here</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
            {snapshots.map(snap => {
              const days = daysUntil(snap.eta ?? null);
              const st = getStatus(snap.status_code);
              const evts = parseEvents(snap.events);
              return (
                <div key={snap.id} style={{ background: `linear-gradient(150deg,${NAVY},${NAVY2})`, borderRadius: 14, border: '1px solid rgba(255,255,255,.07)', padding: '16px 18px', color: 'var(--bg)', position: 'relative' }}>
                  <button onClick={() => deleteSnap(snap.id)} style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={12} color="var(--ink3)" />
                  </button>

                  {editingId === snap.id ? (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input value={editNumber} onChange={e => setEditNumber(e.target.value)} placeholder="Tracking number"
                        style={{ height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: 'var(--bg)', padding: '0 10px', fontSize: 12, fontFamily: 'var(--mono)' }} />
                      <input value={editCarrier} onChange={e => setEditCarrier(e.target.value)} placeholder="Carrier"
                        style={{ height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: 'var(--bg)', padding: '0 10px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="tr-btn" onClick={saveEdit} style={{ flex: 1, height: 28, borderRadius: 'var(--r)', border: 'none', background: BRAND, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                        <button className="tr-btn" onClick={() => setEditingId(null)} style={{ flex: 1, height: 28, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'var(--ink3)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(232,70,26,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={snap.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={15} color={BRAND} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.09em' }}>{snap.tracking_type} · {snap.carrier}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)' }}>{snap.tracking_number}</div>
                      </div>
                      <button className="tr-btn" title="Edit entry" onClick={() => startEdit(snap)} style={{ width: 26, height: 26, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="edit" size={11} color="var(--ink3)" />
                      </button>
                      <button className="tr-btn" title="Refresh tracking status" onClick={() => retrack(snap)} disabled={retrackingId === snap.id} style={{ width: 26, height: 26, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 20, opacity: retrackingId === snap.id ? 0.5 : 1 }}>
                        <Icon name="refresh" size={11} color="var(--ink3)" />
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                    <Icon name="mapPin" size={10} color="var(--ink2)" />
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{snap.origin_name} → {snap.dest_name}</span>
                  </div>

                  <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${snap.progress_pct}%`, background: `linear-gradient(90deg,${NAVY2},${BRAND})`, borderRadius: 3 }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.fg, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={st.icon} size={11} color={st.fg} />{st.label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>
                      {fmtDate(snap.eta)}{days != null ? ` · ${days > 0 ? `${days}d` : days === 0 ? 'today' : 'OVD'}` : ''}
                    </span>
                  </div>

                  {/* Snap actions */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="tr-btn" onClick={() => copyLink(snap.share_token)} style={{ flex: 1, height: 30, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Icon name="link" size={10} color="var(--ink3)" />Share
                    </button>
                    <button className="tr-btn" onClick={() => { const base = { tracking_number: snap.tracking_number, tracking_type: snap.tracking_type, carrier: snap.carrier ?? '', origin_name: snap.origin_name ?? '', origin_code: '', dest_name: snap.dest_name ?? '', dest_code: '', current_location: snap.current_location ?? '', status: snap.status ?? '', status_code: snap.status_code ?? '', eta: snap.eta, progress_pct: snap.progress_pct, events: parseEvents(snap.events), source: 'mock' as const }; generatePDF(base); }} style={{ flex: 1, height: 30, borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.04)', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Icon name="fileText" size={10} color="var(--ink3)" />PDF
                    </button>
                    {!snap.shipment_id
                      ? <div style={{ flex: 2 }}>
                          <Combobox
                            options={shipments.slice(0, 30).map((s: any) => ({ value: s.id, label: s.ref_number }))}
                            value="" onChange={v => v && linkSnap(snap.id, v)}
                            disabled={linkingId === snap.id}
                            placeholder="Link to shipment…"
                            triggerClassName="h-[30px] rounded-[7px] border-[rgba(255,255,255,.09)] bg-[rgba(255,255,255,.04)] text-[10px] font-bold text-[var(--ink3)] px-1.5 shadow-none"
                          />
                        </div>
                      : <div style={{ flex: 2, height: 30, borderRadius: 7, border: '1px solid rgba(74,222,128,.25)', background: 'rgba(74,222,128,.07)', fontSize: 10, fontWeight: 700, color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Icon name="checkCircle" size={11} color="#4ade80" />Linked
                        </div>
                    }
                  </div>

                  {evts[0] && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.05)', fontSize: 10, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="activity" size={10} color="var(--ink2)" />
                      {evts[0].description} · {fmtDate(evts[0].timestamp)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
