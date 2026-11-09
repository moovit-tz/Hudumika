import { escapePrintData, safePrintImage } from '../lib/print-data.js';
import { CarrierLogo } from '../components/container/CarrierLogo.js';
import { detectShippingLine } from '../components/container/shippingLines.js';
import { ContainerIdentity } from '../components/container/ContainerIdentity.js';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Spinner, SectionLoading, ButtonSpinner } from '../components/ui/spinner.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { MetricsRow } from '../components/MetricCard.js';
import { getCompany } from '../data/companyStore.js';
import { Combobox } from '../components/ui/combobox.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionCard } from '../components/SectionCard.js';
import { Input } from '../components/ui/input.js';
import { Tip } from '../components/ui/tooltip.js';
import './Tracker.css';

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
  source: 'live' | 'mock' | 'manual' | 'unknown';
  proof?: string;
  provider?: 'ship24' | 'shipsgo';
}

interface TrackingSnapshot {
  source: TrackingResult['source'];
  provider?: string;
  fetched_at?: string;
  share_expires_at?: string;
  share_revoked?: boolean;
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
  DELIVERED:       { bg: 'var(--green-l)', fg: 'var(--green)', label: 'Delivered',       icon: 'checkCircle' },
  IN_TRANSIT:      { bg: 'var(--blue-l)', fg: 'var(--blue)', label: 'In Transit',       icon: 'globe'       },
  TRANSIT:         { bg: 'var(--blue-l)', fg: 'var(--blue)', label: 'In Transit',       icon: 'globe'       },
  PICKED_UP:       { bg: 'var(--purple-l)', fg: 'var(--purple)', label: 'Picked Up',        icon: 'package'     },
  DEPARTED:        { bg: 'var(--blue-l)', fg: 'var(--blue)', label: 'Departed',         icon: 'compass'     },
  CUSTOMS_CLEARED: { bg: 'var(--gold-l)', fg: 'var(--gold)', label: 'Customs Cleared',  icon: 'shield'      },
  ON_HOLD:         { bg: 'var(--red-l)', fg: 'var(--red)', label: 'On Hold',          icon: 'alertCircle' },
  DELAYED:         { bg: 'var(--red-l)', fg: 'var(--red)', label: 'Delayed',          icon: 'alertCircle' },
  ARRIVED:         { bg: 'var(--green-l)', fg: 'var(--green)', label: 'Arrived',          icon: 'mapPin'      },
};
const getStatus = (code?: string) =>
  STATUS[code?.toUpperCase() ?? ''] ?? { bg: 'var(--bg)', fg: 'var(--ink2)', label: code ?? 'Unknown', icon: 'info' as IconName };

// ── PDF generator ─────────────────────────────────────────────────────────────

// Brand color constant — matches CSS --teal: #0b1e3a
const BRAND = '#0b1e3a';
const NAVY  = '#0e1f3d';
const NAVY2 = '#1a3260';

function generatePDF(result: TrackingResult) {
  result = escapePrintData(result);
  const company = getCompany();
  const co = escapePrintData({ ...company, logoUrl: safePrintImage(company.logoUrl || '') });
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
      ${new Date().toLocaleTimeString('en-GB')} · ${result.source === 'live' ? 'Provider data' : result.source === 'manual' ? 'Manually entered data' : 'Unverified data'}
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
      <div class="kpi-value" style="color:${(days ?? 0) < 0 ? 'var(--red)' : (days ?? 99) <= 3 ? 'var(--gold)' : NAVY}">${days == null ? '—' : days > 0 ? '~' + days + ' days' : days === 0 ? 'Today' : Math.abs(days) + 'd overdue'}</div>
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
    <div class="footer-brand"><div class="footer-dot"></div><strong>${co.name}</strong> · Safetracker powered by Hudumika</div>
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

// ── Snapshot card (clean, theme-aware operational summary) ───────────────────

export const SnapshotCard = React.forwardRef<HTMLDivElement, { result: TrackingResult }>(({ result }, ref) => {
  const days = daysUntil(result.eta);
  const st = getStatus(result.status_code);
  const badgeVariant = st.fg === 'var(--green)' ? 'success' : st.fg === 'var(--red)' ? 'error' : st.fg === 'var(--gold)' ? 'warning' : st.fg === 'var(--blue)' ? 'info' : 'gray';

  return (
    <div ref={ref} className="tracker-snapshot-card">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-9 rounded-lg bg-(--white) border border-(--trk-border) flex items-center justify-center shrink-0">
            {detectShippingLine(result.carrier) ? (
              <CarrierLogo carrier={result.carrier} size={24} />
            ) : (
              <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={15} color="var(--teal)" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink3)">
              {result.tracking_type === 'AWB' ? 'Air Waybill' : 'Bill of Lading'} · {result.carrier}
            </div>
            <div className="font-mono text-sm font-bold text-(--ink) truncate mt-0.5">
              {result.tracking_number}
            </div>
          </div>
        </div>
        <Badge variant={badgeVariant as any} className="shrink-0">
          <Icon name={st.icon} size={11} color={st.fg} />
          {st.label}
        </Badge>
      </div>

      {/* Route */}
      <div className="tracker-snapshot-route">
        <div className="min-w-0">
          <div className="font-mono text-base font-extrabold text-(--ink) leading-none">{result.origin_code || '—'}</div>
          <div className="text-[11px] text-(--ink3) truncate mt-1">{result.origin_name}</div>
        </div>
        <div className="flex-1 px-2 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full h-1.5 rounded-full bg-(--border)/60 overflow-hidden">
            <div className="h-full rounded-full bg-(--teal)" style={{ width: `${result.progress_pct}%` }} />
          </div>
          <div className="text-[10.5px] text-(--ink2) truncate max-w-full flex items-center gap-1">
            <Icon name="mapPin" size={10} color="var(--teal)" />
            <span className="truncate">{result.current_location}</span>
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="font-mono text-base font-extrabold text-(--ink) leading-none">{result.dest_code || '—'}</div>
          <div className="text-[11px] text-(--ink3) truncate mt-1">{result.dest_name}</div>
        </div>
      </div>

      {/* Metrics */}
      <div className="tracker-snapshot-grid">
        {[
          { label: 'Estimated Arrival', value: fmtDate(result.eta) },
          { label: 'Remaining', value: days == null ? '—' : days > 0 ? `${days} days` : days === 0 ? 'Today' : `${Math.abs(days)}d overdue` },
          { label: 'Completion', value: `${result.progress_pct}%` },
          { label: 'Checkpoints', value: `${result.events.length} events` },
        ].map(m => (
          <div key={m.label} className="tracker-snapshot-cell">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink3)">{m.label}</div>
            <div className="text-xs font-bold text-(--ink) mt-0.5 tabular-nums">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-(--trk-border) text-[11px] text-(--ink3)">
        <span className="font-semibold text-(--ink2)">Safetracker · Consignment Summary</span>
        <span>{result.source === 'live' ? `Verified (${result.provider || 'provider'})` : 'Manual record'}</span>
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
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '4px 9px', fontSize: 11 }}>
      <Icon name={snap.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={12} color={st.fg} />
      <span style={{ fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '.03em', color: 'var(--ink)' }}>{snap.tracking_number}</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <span style={{ color: st.fg, fontWeight: 600 }}>{st.label}</span>
      {days != null && <span style={{ color: 'var(--ink3)' }}>· {days > 0 ? `${days}d` : days === 0 ? 'Today' : 'OVD'}</span>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

import { ContainerDetailView } from './ContainerDetailPage.js';
import { getContainerDetails } from '../components/container/containerData.js';
import type { ContainerDetails, DelayStatus } from '../components/container/containerTypes.js';

function containerTimeline(result: TrackingResult): ContainerDetails['timeline'] {
  return [...result.events].reverse().map(event => ({
    location: event.location || result.current_location || 'Location pending',
    events: [{
      title: event.description,
      date: `${fmtDate(event.timestamp)}, ${fmtTime(event.timestamp)}`,
      status_type: 'actual',
      badge: 'A',
    }],
  }));
}

const TRACKER_PAGE_SIZE = 10;

function TrackerIconAction({ label, icon, onClick, disabled, size = 'default', className }: {
  label: string; icon: IconName; onClick: () => void; disabled?: boolean; size?: 'default' | 'sm'; className?: string;
}) {
  const isSm = size === 'sm';
  return (
    <Tip label={label}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={className ?? (isSm ? 'size-6.5 rounded-none p-0 text-(--ink2) hover:text-(--ink) hover:bg-(--hover-bg)' : '')}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon name={icon} size={isSm ? 12 : 16} />
      </Button>
    </Tip>
  );
}

interface TrackedEntry {
  id: string;
  container: {
    container_number: string;
    iso_code: string | null;
    size_type: string | null;
    carrier_name: string | null;
    carrier_code: string | null;
    customer_name: string | null;
    color_hex: string | null;
    lifecycle_stage: string | null;
  } | null;
  snapshots: TrackingSnapshot[];
}

function TrackerPagination({ label, page, count, loading, hasNext, onPrevious, onNext }: {
  label: string; page: number; count: number; loading: boolean; hasNext: boolean;
  onPrevious: () => void; onNext: () => void;
}) {
  if (!count && page === 1) return null;
  const start = (page - 1) * TRACKER_PAGE_SIZE + 1;
  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span aria-live="polite">{count ? `Showing ${start}–${start + count - 1} · ` : ''}Page {page}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={loading || page === 1} onClick={onPrevious}>Previous</Button>
        <Button variant="outline" size="sm" disabled={loading || !hasNext} onClick={onNext}>Next</Button>
      </div>
    </nav>
  );
}

export const Tracker: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [trackType, setTrackType] = useState<'AWB' | 'BL' | 'CONTAINER'>('CONTAINER');
  const [inputNumber, setInputNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [activeContainerNum, setActiveContainerNum] = useState<string>('');
  const [containerModel, setContainerModel] = useState<ContainerDetails | null>(null);
  const [showContainerSpecs, setShowContainerSpecs] = useState(false);
  const containerRequest = useRef(0);

  const [savingSnap, setSavingSnap] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [demurrageContainers, setDemurrageContainers] = useState<any[]>([]);
  const [carrierReliability, setCarrierReliability] = useState<any | null>(null);
  const [tracked, setTracked] = useState<TrackedEntry[]>([]);
  const [trackedPage, setTrackedPage] = useState(1);
  const [hasMoreTracked, setHasMoreTracked] = useState(false);
  const [loadingTracked, setLoadingTracked] = useState(true);
  const [trackedError, setTrackedError] = useState('');
  const trackedRequest = useRef(0);

  const loadTracked = useCallback(async (page = 1) => {
    const request = ++trackedRequest.current;
    setLoadingTracked(true);
    setTrackedError('');
    try {
      const rows = await apiFetch<{ data: TrackedEntry[]; has_more: boolean }>('/v1/tracker/tracked?page=' + page + '&limit=' + TRACKER_PAGE_SIZE);
      if (request !== trackedRequest.current) return;
      setTracked(rows.data);
      setHasMoreTracked(rows.has_more);
      setTrackedPage(page);
    } catch (error) {
      if (request === trackedRequest.current) setTrackedError(error instanceof Error ? error.message : 'Could not load tracked shipments.');
    } finally {
      if (request === trackedRequest.current) setLoadingTracked(false);
    }
  }, []);

  useEffect(() => {
    void loadTracked();
    apiFetch('/v1/shipments').then((d: any) => setShipments(d?.data ?? d ?? [])).catch(() => {});
  }, [loadTracked]);

  const fleetContainers = useMemo(() => tracked.flatMap(entry => entry.container ? [entry.container] : []), [tracked]);
  const snapshots = useMemo(() => tracked.flatMap(entry => entry.snapshots), [tracked]);

  const handleInput = (v: string) => {
    setInputNumber(v);
    const n = v.trim().toUpperCase();
    if (!n) return;
    if (/^\d{3}-?\d/.test(n)) setTrackType('AWB');
    else if (/^[A-Z]{4}\d{6,7}$/.test(n)) setTrackType('CONTAINER');
    else if (/^[A-Z0-9./-]*[A-Z][A-Z0-9./-]*\d[A-Z0-9./-]*$/.test(n)) setTrackType('BL');
  };

  const executeTrack = async (targetNum: string, targetType: 'AWB' | 'BL' | 'CONTAINER') => {
    const num = targetNum.replace(/\s/g, '').toUpperCase();
    if (!num) return;

    const requestId = ++containerRequest.current;
    setLoading(true); setError(null); setSavedId(null); setContainerModel(null); setActiveContainerNum(''); setResult(null);
    setDemurrageContainers([]); setCarrierReliability(null);
    try {
      const r: TrackingResult = await apiFetch('/v1/tracker/track', { method: 'POST', body: JSON.stringify({ number: num, type: targetType === 'CONTAINER' ? 'BL' : targetType }) });
      if (requestId !== containerRequest.current) return;
      setResult(r);

      // Load container intelligence — prefer real DB record, fall back to generated data
      const contNum = r.containers?.[0]?.number || '';
      setActiveContainerNum(contNum);
      if (targetType !== 'AWB' && contNum) {
        const voyageOverride = {
          timeline: containerTimeline(r),
          voyage: {
            pol_city: r.origin_name || 'Origin Port',
            pol_country: r.origin_code || '',
            pod_city: r.dest_name || 'Destination Port',
            pod_country: r.dest_code || '',
            voyage_no: r.voyage_number || '',
            vessel_name: r.vessel_name || '',
            etd: '',
            eta: r.eta ? new Date(r.eta).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
            current_location: r.current_location || 'Transit Corridor',
            delay_status: (r.status_code === 'DELAYED' ? 'DELAYED' : r.status_code === 'ON_HOLD' ? 'SLIGHTLY_DELAYED' : 'ON_TIME') as DelayStatus,
          },

        };
        // Try the real container intelligence API first.
        // Always use getContainerDetails as base so required fields (status, condition,
        // survey_report, timeline…) are present even when the DB record omits them.
        try {
          const contData: any = await apiFetch(`/v1/tracker/containers/${contNum}`);
          if (requestId !== containerRequest.current) return;
          if (contData?.container_number) {
            setContainerModel({
              ...getContainerDetails(contNum),
              ...contData,
              ...voyageOverride,
            } as any);
          } else {
            setContainerModel(getContainerDetails(contNum, voyageOverride));
          }
        } catch {
          if (requestId !== containerRequest.current) return;
          setContainerModel(getContainerDetails(contNum, voyageOverride));
        }
      }

      // Bridge to Demurrage
      if (r.containers && r.containers.length > 0) {
        const numbers = r.containers.map(c => c.number).join(',');
        apiFetch(`/v1/demurrage/containers?container_numbers=${encodeURIComponent(numbers)}`)
          .then(setDemurrageContainers)
          .catch(() => {});
      }

      // Bridge to carrier reliability
      apiFetch('/v1/cargotracker/dashboard/carrier-analysis')
        .then((rows: any[]) => setCarrierReliability((rows ?? []).find(row => row.carrier === r.carrier) ?? null))
        .catch(() => {});
    }
    catch (e: any) { if (requestId === containerRequest.current) setError(e.message ?? 'Tracking failed'); }
    finally { if (requestId === containerRequest.current) setLoading(false); }
  };

  const handleTrack = () => {
    if (suggTimer.current) clearTimeout(suggTimer.current);
    setSuggLoading(false);
    setShowSugg(false);
    void executeTrack(inputNumber, trackType);
  };

  const selectPreset = (num: string, type: 'AWB' | 'BL' | 'CONTAINER') => {
    if (suggTimer.current) clearTimeout(suggTimer.current);
    setSuggLoading(false);
    setShowSugg(false);
    setInputNumber(num);
    setTrackType(type);
    void executeTrack(num, type);
  };

  const handleSave = async () => {
    if (!result) return;
    setSavingSnap(true);
    try {
      const s = await apiFetch('/v1/tracker/snapshots', { method: 'POST', body: JSON.stringify({ ...result }) });
      setSavedId(s.id);
      await loadTracked();
    } catch (e: any) { showAlert(e.message ?? 'Save failed'); }
    finally { setSavingSnap(false); }
  };

  const copyLink = async (id: string) => {
    try {
      const share = await apiFetch(`/v1/tracker/snapshots/${id}/share`, { method: 'POST', body: JSON.stringify({ revoke: false }) });
      await navigator.clipboard.writeText(`${window.location.origin}/track/shared/${share.share_token}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000); await loadTracked();
    } catch (error: any) { showAlert(error.message || 'Could not create share'); }
  };
  const revokeShare = async (id: string) => {
    try { await apiFetch(`/v1/tracker/snapshots/${id}/share`, { method: 'POST', body: JSON.stringify({ revoke: true }) }); await loadTracked(); showAlert('Share revoked'); }
    catch (error: any) { showAlert(error.message || 'Could not revoke share'); }
  };

  const linkSnap = async (snapId: string, shipId: string) => {
    setLinkingId(snapId);
    try {
      await apiFetch(`/v1/tracker/snapshots/${snapId}/link`, { method: 'PATCH', body: JSON.stringify({ shipment_id: shipId }) });
      await loadTracked();
    } catch (e: any) { showAlert(e.message ?? 'Link failed'); }
    finally { setLinkingId(null); }
  };

  const deleteSnap = async (id: string) => {
    if (!(await showConfirm('Remove this tracking record?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/tracker/snapshots/${id}`, { method: 'DELETE' });
      await loadTracked();
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
      await loadTracked();
    } catch (e: any) { showAlert(e.message ?? 'Update failed'); }
  };

  // Live suggestions
  interface Suggestion { kind: 'snapshot' | 'shipment' | 'preset'; number: string; type: 'AWB' | 'BL' | 'CONTAINER'; label: string; sub: string }
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
      // 1. Tracked containers from DB fleet
      for (const c of fleetContainers) {
        if (c.container_number?.toUpperCase().includes(q)) {
          out.push({ kind: 'preset', number: c.container_number, type: 'CONTAINER', label: c.container_number, sub: `${c.size_type || c.iso_code || 'Container'} · ${c.carrier_name?.split(' ')[0] || 'Fleet'} · ${c.lifecycle_stage?.replace(/_/g, ' ') || ''}` });
          if (out.length >= 4) break;
        }
      }
      // 2. Saved snapshots
      for (const s of snapshots) {
        if (s.tracking_number.toUpperCase().includes(q)) {
          out.push({ kind: 'snapshot', number: s.tracking_number, type: s.tracking_type as any, label: s.tracking_number, sub: `Saved · ${s.carrier ?? s.tracking_type} · ${s.status ?? ''}` });
        }
        if (out.length >= 4) break;
      }
      // 3. Shipments API
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
      } catch { /* shipments module */ }
      setSuggestions(out);
      setShowSugg(out.length > 0);
      setSuggLoading(false);
    }, 300);
    return () => { if (suggTimer.current) clearTimeout(suggTimer.current); };
  }, [inputNumber, snapshots, fleetContainers]);

  const pickSuggestion = (s: Suggestion) => {
    if (suggTimer.current) clearTimeout(suggTimer.current);
    setSuggLoading(false);
    setShowSugg(false);
    setInputNumber(s.number);
    setTrackType(s.type);
    void executeTrack(s.number, s.type);
  };

  const retrack = async (snap: TrackingSnapshot) => {
    setRetrackingId(snap.id);
    try {
      const r = await apiFetch('/v1/tracker/track', { method: 'POST', body: JSON.stringify({ number: snap.tracking_number, type: snap.tracking_type }) });
      await apiFetch(`/v1/tracker/snapshots/${snap.id}`, {
        method: 'PATCH',
        body: JSON.stringify(r),
      });
      await loadTracked();
    } catch (e: any) { showAlert(e.message ?? 'Refresh failed'); }
    finally { setRetrackingId(null); }
  };

  const handleContainerSwitch = async (contNum: string) => {
    const requestId = ++containerRequest.current;
    setLoading(false);
    setActiveContainerNum(contNum);
    setContainerModel(null);
    const voyageOverride = {
      timeline: result ? containerTimeline(result) : [],
      voyage: {
        pol_city: result?.origin_name || 'Origin Port',
        pol_country: result?.origin_code || '',
        pod_city: result?.dest_name || 'Destination Port',
        pod_country: result?.dest_code || '',
        voyage_no: result?.voyage_number || '',
        vessel_name: result?.vessel_name || '',
        etd: '',
        eta: result?.eta ? new Date(result.eta).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        current_location: result?.current_location || 'Transit Corridor',
        delay_status: (result?.status_code === 'DELAYED' ? 'DELAYED' : result?.status_code === 'ON_HOLD' ? 'SLIGHTLY_DELAYED' : 'ON_TIME') as DelayStatus,
      },
    };
    try {
      const contData: any = await apiFetch(`/v1/tracker/containers/${contNum}`);
      if (requestId !== containerRequest.current) return;
      if (contData?.container_number) {
        setContainerModel({
          ...getContainerDetails(contNum),
          ...contData,
          ...voyageOverride,
        } as any);
      } else {
        setContainerModel(getContainerDetails(contNum, voyageOverride));
      }
    } catch {
      if (requestId !== containerRequest.current) return;
      setContainerModel(getContainerDetails(contNum, voyageOverride));
    }
  };

  return (
    <div className="tracker-page">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .tr-fade { animation: fadeUp .22s ease both; }
        .tracker-ghost-dashed { border: 1px dashed var(--trk-border) !important; }
      `}</style>

      {/* ── Header ── */}
      <PageHeader
        crumbs={['Cargo Tracker', 'Shipment Tracker']}
        titlePlain="Shipment"
        titleEm="Tracker"
        subtitle="Track containers, ocean bills of lading, and air waybills across carrier schedules, port calls, and customs milestones."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/cargotracker/customs">
                <Icon name="shield" size={14} color="var(--teal)" />
                Customs Tracker
              </Link>
            </Button>
            <Button size="sm" onClick={() => navigate('/cargotracker/containers/new')}>
              <Icon name="container" size={14} color="hsl(var(--primary-foreground))" />
              Record Container
            </Button>
          </div>
        }
      />

      {/* ── Operational Lookup Bar ── */}
      <div className="tracker-search-shell">
        <div className="tracker-search-top">
          <Tabs value={trackType} onValueChange={(v) => setTrackType(v as any)} variant="segmented">
            <TabsList className="tracker-mode-tabs">
              <TabsTrigger value="CONTAINER">
                <Icon name="container" size={12} color={trackType === 'CONTAINER' ? 'var(--teal)' : 'var(--ink3)'} />
                Container No.
              </TabsTrigger>
              <TabsTrigger value="BL">
                <Icon name="anchor" size={12} color={trackType === 'BL' ? 'var(--teal)' : 'var(--ink3)'} />
                Bill of Lading
              </TabsTrigger>
              <TabsTrigger value="AWB">
                <Icon name="compass" size={12} color={trackType === 'AWB' ? 'var(--teal)' : 'var(--ink3)'} />
                Air Waybill
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {!isMobile && (
            <div className="tracker-format-inline" aria-label="Supported reference formats">
              <span className="font-semibold text-(--ink3)">Examples:</span>
              <span className="tracker-format-pill">
                Container <code>MSCU1234567</code>
              </span>
              <span className="tracker-format-pill">
                B/L <code>MAEU1234567890</code>
              </span>
              <span className="tracker-format-pill">
                AWB <code>006-12345678</code>
              </span>
            </div>
          )}
        </div>

        {/* Input + Track Button */}
        <div className="tracker-search-row">
          <div className="tracker-input-wrap">
            <div className="tracker-input-icon">
              <Icon name={trackType === 'AWB' ? 'compass' : trackType === 'CONTAINER' ? 'container' : 'anchor'} size={16} color="var(--ink3)" />
            </div>
            <input
              data-ui-field="input"
              type="text"
              value={inputNumber}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { setShowSugg(false); handleTrack(); }
                if (e.key === 'Escape') setShowSugg(false);
              }}
              onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 180)}
              placeholder={
                trackType === 'AWB'
                  ? 'Enter Air Waybill number (e.g. 006-12345678)…'
                  : trackType === 'CONTAINER'
                    ? 'Enter ISO Container number (e.g. MSCU1234567)…'
                    : 'Enter Master or House Bill of Lading (e.g. MAEU1234567890)…'
              }
              aria-label={`Track by ${trackType === 'AWB' ? 'air waybill' : trackType === 'CONTAINER' ? 'container number' : 'bill of lading'}`}
              className="tr-input tracker-input"
            />
            {suggLoading && inputNumber.trim().length >= 2 ? (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <Spinner size={14} />
              </div>
            ) : inputNumber ? (
              <button
                type="button"
                data-ui-native-button=""
                className="tracker-input-clear"
                onClick={() => { setInputNumber(''); setShowSugg(false); }}
                aria-label="Clear reference number"
              >
                <Icon name="x" size={13} />
              </button>
            ) : null}

            {showSugg && suggestions.length > 0 && (
              <div className="tracker-suggestions">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.kind}-${s.number}-${i}`}
                    type="button"
                    data-ui-native-button=""
                    className="tracker-suggestion-btn"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--r-sm, 6px)',
                        background: s.type === 'CONTAINER' ? 'var(--gold-l)' : s.kind === 'snapshot' ? 'var(--teal-l)' : 'var(--blue-l)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        name={s.type === 'AWB' ? 'compass' : s.type === 'CONTAINER' ? 'container' : 'anchor'}
                        size={13}
                        color={s.type === 'CONTAINER' ? 'var(--gold)' : s.kind === 'snapshot' ? 'var(--teal)' : 'var(--blue)'}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-mono text-xs font-bold text-(--ink)">{s.label}</div>
                      <div className="text-[11px] text-(--ink3) truncate">{s.sub}</div>
                    </div>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-(--ink3) shrink-0">
                      {s.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleTrack}
            disabled={loading || !inputNumber.trim()}
            variant="default"
            className="tracker-submit"
          >
            {loading ? (
              <>
                <ButtonSpinner />
                Tracking…
              </>
            ) : (
              <>
                <Icon name="search" size={15} color="hsl(var(--primary-foreground))" />
                Track
              </>
            )}
          </Button>
        </div>

        {trackType === 'CONTAINER' && inputNumber.trim().length >= 4 && (
          <ContainerIdentity number={inputNumber} />
        )}

        {/* Fleet quick-access chips — from real DB */}
        {fleetContainers.length > 0 && (
          <div className="tracker-fleet-bar">
            <span className="tracker-fleet-label">Fleet quick-select:</span>
            {fleetContainers.slice(0, 6).map(c => (
              <button
                key={c.container_number}
                type="button"
                data-ui-native-button=""
                onClick={() => selectPreset(c.container_number, 'CONTAINER')}
                title={`${c.size_type || c.iso_code} · ${c.lifecycle_stage?.replace(/_/g, ' ')}`}
                className="tracker-fleet-chip"
              >
                {c.container_number}
              </button>
            ))}
            <button
              type="button"
              data-ui-native-button=""
              onClick={() => navigate('/cargotracker/containers')}
              className="ml-auto text-xs font-semibold text-(--teal) hover:underline"
            >
              All containers →
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              background: 'var(--red-l)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--r-sm, 6px)',
              fontSize: 12.5,
              color: 'var(--red)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alertCircle" size={14} color="var(--red)" />
            {error}
          </div>
        )}
      </div>

      {/* ── Active Tracking Result ── */}
      {result && (
        <div className="tr-fade flex flex-col gap-4">
          {/* Consignment Summary & Route Card */}
          <div className="tracker-result-card">
            <div className="tracker-result-head">
              <div className="tracker-result-id-group">
                <div className="tracker-carrier-box">
                  {detectShippingLine(result.carrier) ? (
                    <CarrierLogo carrier={result.carrier} size={32} />
                  ) : (
                    <Icon name={result.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={18} color="var(--teal)" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="tracker-result-meta">
                    {result.tracking_type === 'AWB' ? 'Air Waybill' : 'Bill of Lading'} · {result.carrier}
                    {result.service_name ? ` · ${result.service_name}` : ''}
                  </div>
                  <div className="tracker-result-number">{result.tracking_number}</div>
                  {result.vessel_name && (
                    <div className="tracker-result-vessel">
                      <Icon name="ship" size={12} color="var(--ink3)" />
                      <span className="font-semibold text-(--ink)">{result.vessel_name}</span>
                      {result.voyage_number && (
                        <span className="font-mono text-xs text-(--ink3)">· VOY {result.voyage_number}</span>
                      )}
                      {result.co2_emission ? (
                        <span className="text-xs text-(--ink3)">· {result.co2_emission.toLocaleString()} kg CO₂e</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {result.eta && result.eta_initial && result.eta !== result.eta_initial && (() => {
                  const delayDays = Math.round((new Date(result.eta).getTime() - new Date(result.eta_initial).getTime()) / 86_400_000);
                  return delayDays !== 0 ? (
                    <Badge variant={delayDays > 0 ? 'error' : 'success'}>
                      <Icon name={delayDays > 0 ? 'alertCircle' : 'checkCircle'} size={11} color={delayDays > 0 ? 'var(--red)' : 'var(--green)'} />
                      {delayDays > 0 ? `+${delayDays}d schedule variance` : `${Math.abs(delayDays)}d ahead`}
                    </Badge>
                  ) : null;
                })()}
                {(() => {
                  const st = getStatus(result.status_code);
                  const bv = st.fg === 'var(--green)' ? 'success' : st.fg === 'var(--red)' ? 'error' : st.fg === 'var(--gold)' ? 'warning' : st.fg === 'var(--blue)' ? 'info' : 'gray';
                  return (
                    <Badge variant={bv as any}>
                      <Icon name={st.icon} size={12} color={st.fg} />
                      {st.label}
                    </Badge>
                  );
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setContainerModel(null);
                    setShowContainerSpecs(false);
                    setError(null);
                    setSavedId(null);
                    setInputNumber('');
                  }}
                >
                  <Icon name="x" size={12} />
                  Clear
                </Button>
              </div>
            </div>

            {/* Route Strip */}
            <div className="tracker-route-strip">
              <div className="tracker-route-Endpoint">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink3)">Port of Loading</div>
                <div className="tracker-port-code mt-0.5">{result.origin_code || 'POL'}</div>
                <div className="tracker-port-name">{result.origin_name}</div>
              </div>

              <div className="tracker-route-center">
                <div className="tracker-route-status-row">
                  <span className="inline-flex items-center gap-1.5 font-medium text-(--ink)">
                    <Icon name="mapPin" size={12} color="var(--teal)" />
                    <span>{result.current_location || 'In transit'}</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-(--teal)">{result.progress_pct}%</span>
                </div>
                <div className="tracker-route-bar">
                  <div className="tracker-route-fill" style={{ width: `${result.progress_pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-(--ink3)">
                  <span>{result.events.length} recorded milestones</span>
                  <span>ETA: <strong className="text-(--ink2)">{fmtDate(result.eta)}</strong></span>
                </div>
              </div>

              <div className="tracker-route-Endpoint tracker-route-Endpoint--dest">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink3)">Port of Discharge</div>
                <div className="tracker-port-code mt-0.5">{result.dest_code || 'POD'}</div>
                <div className="tracker-port-name">{result.dest_name}</div>
              </div>
            </div>

            {/* Containers on Consignment Bar */}
            {result.containers && result.containers.length > 0 && (
              <div className="tracker-containers-bar">
                <div className="tracker-containers-list">
                  <span className="text-xs font-semibold text-(--ink3) mr-1">
                    Containers ({result.containers.length}):
                  </span>
                  {result.containers.map(c => {
                    const isSelected = activeContainerNum === c.number;
                    return (
                      <button
                        key={c.number}
                        type="button"
                        data-ui-native-button=""
                        onClick={() => handleContainerSwitch(c.number)}
                        className={`tracker-container-pill ${isSelected ? 'is-active' : ''}`}
                      >
                        <Icon name="container" size={12} color={isSelected ? 'var(--teal)' : 'var(--ink3)'} />
                        <span className="font-mono font-bold">{c.number}</span>
                        <span className="text-[11px] opacity-75">{c.size}</span>
                      </button>
                    );
                  })}
                </div>

                {activeContainerNum && result.tracking_type !== 'AWB' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowContainerSpecs(v => !v)}
                    >
                      <Icon name="layers" size={13} color="var(--teal)" />
                      {showContainerSpecs ? 'Hide Container Specs' : `Inspect ${activeContainerNum} Specs`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/cargotracker/containers/${encodeURIComponent(activeContainerNum)}`)}
                    >
                      Open Full Record
                      <Icon name="externalLink" size={12} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Standard MetricsRow KPIs */}
          {(() => {
            const d = daysUntil(result.eta);
            return (
              <MetricsRow
                cards={[
                  {
                    emphasis: 'primary',
                    title: 'Estimated Arrival',
                    value: fmtDate(result.eta),
                    sub1Label: 'DAY',
                    sub1Value: result.eta ? new Date(result.eta).toLocaleDateString('en-GB', { weekday: 'short' }) : '—',
                    sub2Label: 'DESTINATION',
                    sub2Value: result.dest_code || result.dest_name || '—',
                    barHighlight: 'var(--teal)',
                  },
                  {
                    title: 'Schedule Window',
                    value: d == null ? '—' : d > 0 ? `${d} days` : d === 0 ? 'Arriving Today' : `${Math.abs(d)}d Overdue`,
                    sub1Label: 'INITIAL ETA',
                    sub1Value: fmtDate(result.eta_initial ?? result.eta),
                    sub2Label: 'STATUS',
                    sub2Value: getStatus(result.status_code).label,
                    barHighlight: d != null && d < 0 ? 'var(--red)' : 'var(--blue)',
                  },
                  {
                    title: 'Journey Progress',
                    value: `${result.progress_pct}%`,
                    sub1Label: 'MILESTONES',
                    sub1Value: `${result.events.length} events`,
                    sub2Label: 'PORT CALLS',
                    sub2Value: `${result.port_calls?.length ?? 0} ports`,
                    barHighlight: 'var(--green)',
                  },
                  {
                    title: 'Carrier & Mode',
                    value: result.carrier || '—',
                    sub1Label: 'MODE',
                    sub1Value: result.tracking_type === 'AWB' ? 'Air Freight' : 'Ocean Freight',
                    sub2Label: 'SOURCE',
                    sub2Value: result.source === 'live' ? (result.provider || 'Live EDI') : 'Manual',
                    barHighlight: 'var(--gold)',
                  },
                ]}
              />
            );
          })()}

          {/* On-demand Container Specification View */}
          {showContainerSpecs && activeContainerNum && result.tracking_type !== 'AWB' && (
            <SectionCard
              title={`Container Specification & Telemetry · ${activeContainerNum}`}
              action={
                <Button variant="ghost" size="sm" onClick={() => setShowContainerSpecs(false)}>
                  <Icon name="x" size={13} />
                  Close preview
                </Button>
              }
            >
              {containerModel ? (
                <ContainerDetailView
                  key={containerModel.container_number}
                  number={containerModel.container_number}
                  providedContainer={containerModel}
                />
              ) : (
                <SectionLoading label="Loading container specifications…" />
              )}
            </SectionCard>
          )}

          {/* ── Port Routing Table (ShipsGo / rich data) ── */}
          {result.port_calls && result.port_calls.length > 0 && (
            <SectionCard
              title="Port Routing Schedule"
              action={
                result.provider ? (
                  <Badge variant="gray">
                    Source: {result.provider === 'shipsgo' ? 'ShipsGo EDI' : 'Ship24'}
                  </Badge>
                ) : undefined
              }
            >
              <div style={{ overflowX: 'auto' }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
                  {result.port_calls.length} scheduled port calls · confirmed actual dates in bold · estimated dates in italic
                </div>

                {(() => {
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
                        <tr style={{ borderBottom: '1px solid var(--trk-border-strong)', background: 'var(--bg)' }}>
                          <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 150 }}>Port</th>
                          {allCodes.map(code => (
                            <th key={code} style={{ textAlign: 'center', padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
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
                            <tr
                              key={pc.port_code}
                              style={{
                                borderBottom: isLast ? 'none' : '1px solid var(--trk-border)',
                                background: isActive ? 'color-mix(in srgb, var(--teal-l) 55%, transparent)' : 'transparent',
                              }}
                            >
                              <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isActive ? 'var(--teal)' : pc.events.every(e => e.act) ? 'var(--green)' : 'var(--border)' }} />
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{pc.port_name}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span className="font-mono">{pc.port_code}</span>
                                      {pc.is_transshipment && (
                                        <span style={{ background: 'var(--bg)', border: '1px solid var(--trk-border)', borderRadius: 'var(--r-sm)', padding: '0 5px', fontSize: 9.5, fontWeight: 700, color: 'var(--ink2)' }}>
                                          Transshipment
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {allCodes.map(code => {
                                const ev = pc.events.find(e => e.code === code);
                                const date = ev?.act ?? ev?.est ?? null;
                                const isActual = !!ev?.act;
                                return (
                                  <td key={code} style={{ padding: '10px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    {date ? (
                                      <div>
                                        <div style={{ fontSize: 11.5, fontWeight: isActual ? 700 : 400, color: isActual ? 'var(--ink)' : 'var(--ink3)', fontStyle: isActual ? 'normal' : 'italic', whiteSpace: 'nowrap' }}>
                                          {fmtDate(date)}
                                        </div>
                                        {isActual && (
                                          <div style={{ fontSize: 9.5, color: 'var(--teal)', fontWeight: 600, marginTop: 1 }}>Confirmed</div>
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ color: 'var(--ink3)', opacity: 0.45, fontSize: 13 }}>—</span>
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
            </SectionCard>
          )}

          {/* Timeline + Snapshot Export */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 16 }}>
            {/* Events */}
            <SectionCard title="Tracking Milestones">
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 14 }}>
                {result.events.length} chronological carrier checkpoints recorded
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                {result.events.map((ev, i) => {
                  const st = getStatus(ev.status_code);
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i === result.events.length - 1 ? 4 : 18, position: 'relative' }}>
                      {i < result.events.length - 1 && (
                        <div style={{ position: 'absolute', left: 15, top: 32, bottom: -18, width: 1, background: 'var(--trk-border)' }} />
                      )}
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: i === 0 ? st.bg : 'var(--bg)',
                          border: `1.5px solid ${i === 0 ? st.fg : 'var(--trk-border)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name={st.icon} size={13} color={i === 0 ? st.fg : 'var(--ink3)'} />
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 }}>{ev.description}</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink2)' }}>
                            <Icon name="mapPin" size={11} color="var(--ink3)" />
                            {ev.location || '—'}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>
                            · {fmtDate(ev.timestamp)} {fmtTime(ev.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* Snapshot & Export Panel */}
            <SectionCard title="Save & Export Consignment">
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
                Save to your tracked register, share a customer status link, or export a PDF report.
              </div>

              <div style={{ marginBottom: 14 }}>
                <SnapshotCard result={result} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!savedId ? (
                  <Button className="w-full" onClick={handleSave} disabled={savingSnap}>
                    {savingSnap ? (
                      <>
                        <ButtonSpinner />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Icon name="save" size={14} color="hsl(var(--primary-foreground))" />
                        Save to Tracked Register
                      </>
                    )}
                  </Button>
                ) : (
                  <Badge variant="success" className="justify-center py-2.5 text-xs">
                    <Icon name="checkCircle" size={14} color="var(--green)" />
                    Saved to Tracked Register
                  </Badge>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: savedId ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {savedId && (
                    <Button variant="outline" size="sm" onClick={() => copyLink(savedId)}>
                      <Icon name="link" size={13} color="var(--teal)" />
                      {copied ? 'Link Copied' : 'Share Status Link'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => generatePDF(result)}>
                    <Icon name="download" size={13} color="var(--teal)" />
                    Export PDF Report
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ── Arrival Analytics + Demurrage bridge ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 16 }}>
            <SectionCard title="Carrier Schedule Reliability">
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
                Historical performance for {result.carrier} across your workspace shipments
              </div>
              {!carrierReliability || carrierReliability.on_time_pct === null ? (
                <div style={{ padding: '16px 4px', fontSize: 12.5, color: 'var(--ink3)' }}>
                  Insufficient historical records for {result.carrier}. Save additional shipments on this carrier to compute schedule reliability.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { label: 'On-Time Arrival', value: `${carrierReliability.on_time_pct}%`, accent: carrierReliability.on_time_pct >= 80 ? 'var(--green)' : carrierReliability.on_time_pct >= 50 ? 'var(--gold)' : 'var(--red)' },
                    { label: 'Avg Schedule Drift', value: carrierReliability.avg_deviation_days === null ? '—' : `${carrierReliability.avg_deviation_days > 0 ? '+' : ''}${carrierReliability.avg_deviation_days}d`, accent: 'var(--ink)' },
                    { label: 'Avg Transit Time', value: carrierReliability.avg_transit_days === null ? '—' : `${carrierReliability.avg_transit_days}d`, accent: 'var(--ink)' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm, 6px)', background: 'var(--bg)', border: '1px solid var(--trk-border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: s.accent, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--ink3)' }}>
                    Computed from {carrierReliability.shipments} tracked consignment{carrierReliability.shipments === 1 ? '' : 's'} with {result.carrier}.
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Demurrage & Free-Time Exposure"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/cargotracker/demurrage')}>
                  Demurrage Ledger →
                </Button>
              }
            >
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>
                Dwell status for containers linked to this bill of lading
              </div>
              {demurrageContainers.length === 0 ? (
                <div style={{ padding: '8px 4px', fontSize: 12.5, color: 'var(--ink3)' }}>
                  {result.containers && result.containers.length > 0
                    ? 'No active demurrage exposure recorded for these containers.'
                    : 'No containers attached to this consignment.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {demurrageContainers.map((c: any) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 'var(--r-sm, 6px)',
                        background: c.demurrage_days > 0 ? 'var(--red-l)' : 'var(--bg)',
                        border: `1px solid ${c.demurrage_days > 0 ? 'var(--red)' : 'var(--trk-border)'}`,
                      }}
                    >
                      <div>
                        <div className="font-mono text-xs font-bold text-(--ink)">{c.container_number}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                          {c.container_size} · {String(c.status || '').replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: c.demurrage_days > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {c.demurrage_days > 0 ? `${c.demurrage_days}d chargeable` : 'Within free time'}
                        </div>
                        {c.demurrage_cost > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)' }}>
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: c.demurrage_currency || 'USD', minimumFractionDigits: 0 }).format(c.demurrage_cost)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* ── Tracked Register ── */}
      <SectionCard
        title="Tracked Shipments & Fleet"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <TrackerIconAction label="Refresh tracked list" icon="refresh" onClick={() => loadTracked(trackedPage)} disabled={loadingTracked} />
            <TrackerIconAction label="Record container" icon="plus" onClick={() => navigate('/cargotracker/containers/new')} />
          </div>
        }
      >
        {trackedError && <p role="alert" className="mb-3 text-sm text-destructive">{trackedError}</p>}
        {loadingTracked && !tracked.length ? (
          <SectionLoading label="Loading tracked shipments and containers…" />
        ) : !tracked.length && trackedPage === 1 ? (
          !trackedError && (
            <p className="py-6 text-center text-sm text-(--ink2)">
              Enter a container, bill of lading, or air waybill number above to track and save it to your register.
            </p>
          )
        ) : (
          <>
            <ul className="tracker-register-list">
              {tracked.map(({ id, container, snapshots: records }) => {
                const primarySnap = records[0] ?? null;
                const extraSnaps = records.slice(1);

                return (
                  <li key={id} className="tracker-register-item">
                    {primarySnap ? (
                      (() => {
                        const snap = primarySnap;
                        const days = daysUntil(snap.eta ?? null);
                        const status = getStatus(snap.status_code);
                        const events = parseEvents(snap.events);
                        const badgeVariant = status.fg === 'var(--green)' ? 'success' : status.fg === 'var(--red)' ? 'error' : status.fg === 'var(--gold)' ? 'warning' : status.fg === 'var(--blue)' ? 'info' : 'gray';

                        return (
                          <div className="min-w-0">
                            <div className="tracker-register-main">
                              {/* Col 1: Consignment / Container Identity */}
                              <div className="tracker-register-col-id">
                                {detectShippingLine(snap.carrier ?? undefined) ? (
                                  <div className="mt-0.5 shrink-0">
                                    <CarrierLogo carrier={snap.carrier} size={26} />
                                  </div>
                                ) : (
                                  <div className="size-7 rounded-md bg-(--bg) border border-(--trk-border) flex items-center justify-center shrink-0 text-(--ink2) mt-0.5">
                                    <Icon name={snap.tracking_type === 'AWB' ? 'compass' : 'anchor'} size={13} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[13.5px] font-bold text-(--ink)">
                                      {container ? container.container_number : snap.tracking_number}
                                    </span>
                                    {container && snap.tracking_number && snap.tracking_number !== container.container_number && (
                                      <span className="font-mono text-[11px] font-medium text-(--ink3) bg-(--bg) border border-(--trk-border) rounded px-1.5 py-0.5">
                                        B/L {snap.tracking_number}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11.5px] text-(--ink3) truncate mt-0.5">
                                    {container
                                      ? [container.size_type || container.iso_code, container.carrier_name || snap.carrier, container.customer_name].filter(Boolean).join(' · ')
                                      : [snap.tracking_type === 'AWB' ? 'Air Waybill' : 'Bill of Lading', snap.carrier].filter(Boolean).join(' · ')}
                                  </div>
                                </div>
                              </div>

                              {/* Col 2: Route & Latest Event */}
                              <div className="tracker-register-col-route">
                                {(snap.origin_name || snap.dest_name) && (
                                  <div className="text-xs font-semibold text-(--ink) flex items-center gap-1.5 truncate">
                                    <span className="truncate">{snap.origin_name || '—'}</span>
                                    <Icon name="arrowRight" size={11} className="text-(--ink3) shrink-0" />
                                    <span className="truncate">{snap.dest_name || '—'}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-[11px] text-(--ink3) min-w-0">
                                  {events[0] ? (
                                    <span className="truncate" title={events[0].description}>
                                      {events[0].description} ({fmtDate(events[0].timestamp)})
                                    </span>
                                  ) : (
                                    <span>No checkpoint events recorded</span>
                                  )}
                                  {snap.source === 'live' ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-(--green) shrink-0">
                                      <Icon name="checkCircle" size={10} />
                                      {snap.provider || 'Live'}
                                    </span>
                                  ) : snap.source === 'manual' ? (
                                    <span className="text-[10.5px] text-(--ink3) shrink-0">· Manual</span>
                                  ) : null}
                                </div>
                              </div>

                              {/* Col 3: Status, Progress & ETA */}
                              <div className="tracker-register-col-eta">
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant={badgeVariant as any} className="text-[10.5px] h-5 px-2 font-semibold shrink-0">
                                    {status.label}
                                  </Badge>
                                  <span className="font-mono text-[11.5px] font-bold text-(--teal) tabular-nums">
                                    {snap.progress_pct}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-(--bg) border border-(--trk-border) overflow-hidden">
                                  <div className="h-full bg-(--teal) rounded-full" style={{ width: `${snap.progress_pct}%` }} />
                                </div>
                                <div className="text-[11px] text-(--ink2) flex items-center justify-between gap-1">
                                  <span>ETA {fmtDate(snap.eta)}</span>
                                  {days != null && days < 0 && (
                                    <span className="font-semibold text-(--red)">Overdue</span>
                                  )}
                                  {days === 0 && (
                                    <span className="font-semibold text-(--gold)">Today</span>
                                  )}
                                </div>
                              </div>

                              {/* Col 4: Shipment Link & Action Toolbar */}
                              <div className="tracker-register-col-actions">
                                {snap.shipment_id ? (
                                  <Tip label={shipments.find(s => s.id === snap.shipment_id)?.ref_number ? `Shipment: ${shipments.find(s => s.id === snap.shipment_id)?.ref_number}` : 'Linked to shipment'}>
                                    <Badge variant="success" className="h-6 text-[10.5px] px-2 font-medium shrink-0">
                                      Linked
                                    </Badge>
                                  </Tip>
                                ) : (
                                  <div className="w-28">
                                    <Combobox
                                      options={shipments.slice(0, 30).map(s => ({ value: s.id, label: s.ref_number }))}
                                      value=""
                                      onChange={v => v && linkSnap(snap.id, v)}
                                      disabled={linkingId === snap.id}
                                      placeholder="Link shipment…"
                                      className="h-6.5 text-[11px]"
                                    />
                                  </div>
                                )}

                                <div className="tracker-action-group">
                                  {container ? (
                                    <>
                                      <TrackerIconAction size="sm" label="Track container" icon="search" onClick={() => selectPreset(container.container_number, 'CONTAINER')} />
                                      <TrackerIconAction size="sm" label="Container details" icon="externalLink" onClick={() => navigate('/cargotracker/containers/' + encodeURIComponent(container.container_number))} />
                                    </>
                                  ) : (
                                    <TrackerIconAction size="sm" label="Track shipment" icon="search" onClick={() => selectPreset(snap.tracking_number, snap.tracking_type === 'AWB' ? 'AWB' : 'BL')} />
                                  )}
                                  <TrackerIconAction size="sm" label="Refresh tracking status" icon="refresh" onClick={() => retrack(snap)} disabled={retrackingId === snap.id} />
                                  <TrackerIconAction size="sm" label="Copy sharing link" icon="link" onClick={() => copyLink(snap.id)} />
                                  {snap.share_expires_at && !snap.share_revoked && (
                                    <TrackerIconAction size="sm" label="Revoke sharing link" icon="shieldOff" onClick={() => revokeShare(snap.id)} />
                                  )}
                                  <TrackerIconAction size="sm" label="Export tracking PDF" icon="fileText" onClick={() => generatePDF({
                                    tracking_number: snap.tracking_number, tracking_type: snap.tracking_type, carrier: snap.carrier ?? '',
                                    origin_name: snap.origin_name ?? '', origin_code: '', dest_name: snap.dest_name ?? '', dest_code: '',
                                    current_location: snap.current_location ?? '', status: snap.status ?? '', status_code: snap.status_code ?? '',
                                    eta: snap.eta, progress_pct: snap.progress_pct, events, source: snap.source ?? 'unknown',
                                  })} />
                                  {snap.tracking_type === 'BL' && !container && !/^[A-Z]{4}\d{7}$/i.test(snap.tracking_number) && (
                                    <Tip label="Look up in Customs Tracker">
                                      <Button variant="ghost" size="icon" className="size-7 rounded-none p-0 text-(--ink2) hover:text-(--ink) hover:bg-(--hover-bg)" asChild>
                                        <Link aria-label="Look up in Customs Tracker" to={'/cargotracker/customs?' + new URLSearchParams({ bl: snap.tracking_number })}>
                                          <Icon name="shield" size={13} />
                                        </Link>
                                      </Button>
                                    </Tip>
                                  )}
                                  <TrackerIconAction size="sm" label="Edit tracking record" icon="edit" onClick={() => startEdit(snap)} />
                                  <TrackerIconAction size="sm" label="Remove tracking record" icon="trash2" onClick={() => deleteSnap(snap.id)} />
                                </div>
                              </div>
                            </div>

                            {/* Inline Edit Form if Editing */}
                            {editingId === snap.id && (
                              <div className="flex flex-wrap items-center gap-2 pt-2.5 mt-2.5 border-t border-(--trk-border)">
                                <Input aria-label="Tracking number" value={editNumber} onChange={e => setEditNumber(e.target.value)} className="h-8 text-xs sm:max-w-48" />
                                <Input aria-label="Carrier" value={editCarrier} onChange={e => setEditCarrier(e.target.value)} className="h-8 text-xs sm:max-w-48" />
                                <Button size="sm" onClick={saveEdit}>Save</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                              </div>
                            )}

                            {/* Additional snapshot records on the same container */}
                            {extraSnaps.length > 0 && (
                              <div className="pt-2 mt-2 border-t border-(--trk-border) space-y-1.5">
                                {extraSnaps.map(extra => {
                                  const extraStatus = getStatus(extra.status_code);
                                  const extraBadgeVariant = extraStatus.fg === 'var(--green)' ? 'success' : extraStatus.fg === 'var(--red)' ? 'error' : extraStatus.fg === 'var(--gold)' ? 'warning' : extraStatus.fg === 'var(--blue)' ? 'info' : 'gray';
                                  const extraEvents = parseEvents(extra.events);
                                  return (
                                    <div key={extra.id} className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-2.5 bg-(--bg) rounded-md border border-(--trk-border)">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-xs font-semibold text-(--ink)">{extra.tracking_number}</span>
                                        <span className="text-[11px] text-(--ink3)">{[extra.tracking_type, extra.carrier].filter(Boolean).join(' · ')}</span>
                                        <Badge variant={extraBadgeVariant as any} className="text-[10px] h-4">{extraStatus.label}</Badge>
                                      </div>
                                      <div className="tracker-action-group">
                                        <TrackerIconAction size="sm" label="Retrack" icon="refresh" onClick={() => retrack(extra)} disabled={retrackingId === extra.id} />
                                        <TrackerIconAction size="sm" label="PDF" icon="fileText" onClick={() => generatePDF({
                                          tracking_number: extra.tracking_number, tracking_type: extra.tracking_type, carrier: extra.carrier ?? '',
                                          origin_name: extra.origin_name ?? '', origin_code: '', dest_name: extra.dest_name ?? '', dest_code: '',
                                          current_location: extra.current_location ?? '', status: extra.status ?? '', status_code: extra.status_code ?? '',
                                          eta: extra.eta, progress_pct: extra.progress_pct, events: extraEvents, source: extra.source ?? 'unknown',
                                        })} />
                                        <TrackerIconAction size="sm" label="Delete" icon="trash2" onClick={() => deleteSnap(extra.id)} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      container && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: container.color_hex || 'var(--teal)' }} />
                            <span className="font-mono text-[13.5px] font-bold text-(--ink)">{container.container_number}</span>
                            <Badge variant={['EMPTY_RETURNED', 'AVAILABLE_AT_DEPOT'].includes(container.lifecycle_stage ?? '') ? 'success' : 'gray'} className="text-[10px] px-2 h-5 capitalize font-semibold">
                              {container.lifecycle_stage?.replace(/_/g, ' ').toLowerCase() || 'Status unknown'}
                            </Badge>
                            <span className="text-[11.5px] text-(--ink3)">
                              {[container.size_type || container.iso_code, container.carrier_name || container.carrier_code, container.customer_name ? `Customer: ${container.customer_name}` : null].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-[11px] text-(--ink3)">No carrier tracking linked</span>
                            <div className="tracker-action-group">
                              <TrackerIconAction size="sm" label="Track container" icon="search" onClick={() => selectPreset(container.container_number, 'CONTAINER')} />
                              <TrackerIconAction size="sm" label="Container details" icon="externalLink" onClick={() => navigate('/cargotracker/containers/' + encodeURIComponent(container.container_number))} />
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
            <TrackerPagination
              label="Tracked pages"
              page={trackedPage}
              count={tracked.length}
              loading={loadingTracked}
              hasNext={hasMoreTracked}
              onPrevious={() => loadTracked(trackedPage - 1)}
              onNext={() => loadTracked(trackedPage + 1)}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
};
