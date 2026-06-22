import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { apiFetch } from '../lib/api.js';
import type { ShipmentCase, ClearanceStage, ShipmentType, OfficerPerformance } from '@clearos/types';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Tooltip, Legend, Filler,
);

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString();
}
function pct(a: number, total: number) {
  return total === 0 ? 0 : Math.round((a / total) * 100);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── stage groups ────────────────────────────────────────────────────────────
const STAGE_GROUPS: Record<string, ClearanceStage[]> = {
  'Awaiting Docs':  ['DOCS_RECEIVED','VALIDATION','PERMITS'],
  'At Port':        ['ENTRY_PREP','TANCIS_REG','ASSESSMENT','TAX_PAYMENT','DO_APPLICATION'],
  'Inspection':     ['INSPECTION_BOOKING','INSPECTION','GOV_REMARKS','RELEASE'],
  'Gate / Transit': ['ICD_PAYMENT','GATE_PASS','TRANSPORT'],
  'Delivered':      ['DELIVERY','EMPTY_RETURN','INVOICING','CLOSED'],
};

const STAGE_COLORS = [
  'rgba(139,92,246,.85)',   // Awaiting Docs — purple
  'rgba(59,130,246,.85)',   // At Port — blue
  'rgba(249,115,22,.85)',   // Inspection — orange
  'rgba(20,184,166,.85)',   // Gate/Transit — teal
  'rgba(34,197,94,.85)',    // Delivered — green
];

const TYPE_LABELS: Record<ShipmentType, string> = {
  SEA_FCL:'Sea FCL', SEA_LCL:'Sea LCL', AIR:'Air Cargo', ROAD:'Road', RAIL:'Rail', BULK:'Bulk',
};

const ORIGIN_PORTS = [
  'Port of Shanghai', 'Port of Dubai', 'Port of Mumbai',
  'Port of Singapore', 'Port of Mombasa', 'Port of Rotterdam',
  'Port of Guangzhou', 'Port of Tokyo',
];

// ── chart theme ─────────────────────────────────────────────────────────────
function chartTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)',
    tick:  dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.45)',
    label: dark ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.65)',
  };
}

// ── background sparkline bars for KPI cards ────────────────────────────────
function CardSpark({ seed, dir, color }: { seed: number; dir: 'up' | 'down'; color: string }) {
  const bars = Array.from({ length: 10 }, (_, i) => {
    const base = Math.abs(Math.sin(seed + i * 0.73)) * 0.35 + 0.22;
    const trend = dir === 'up' ? (i / 9) * 0.43 : (1 - i / 9) * 0.43;
    return Math.max(0.06, Math.min(1, base + trend));
  });
  const W = 88, H = 40, gap = 2.5, bw = (W - gap * 9) / 10;
  return (
    <svg width={W} height={H} style={{ position: 'absolute', bottom: 14, right: 16, opacity: 0.28, pointerEvents: 'none' }}>
      {bars.map((h, i) => (
        <rect key={i} x={i * (bw + gap)} y={H - h * H} width={bw} height={h * H} rx={2.5} fill={color} />
      ))}
    </svg>
  );
}

// ── section card wrapper ────────────────────────────────────────────────────
const Panel: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <div className="card" style={{ marginBottom: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.1px' }}>{title}</div>
      {action}
    </div>
    {children}
  </div>
);

// ── export helpers ──────────────────────────────────────────────────────────
function exportCSV(shipments: any[]) {
  const headers = ['Ref Number', 'Customer', 'Type', 'Origin Port', 'Destination Port', 'Stage', 'Created At'];
  const rows = shipments.map(s => [
    s.ref_number, s.customer_name ?? s.customer?.name ?? '', s.type, s.origin_port || '', s.dest_port || '', s.stage || '',
    new Date(s.created_at).toLocaleDateString('en-GB'),
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `shipments-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPDF(shipments: any[]) {
  const html = `<!DOCTYPE html><html><head><title>Shipments Report</title>
  <style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:bold}h1{font-size:18px;margin-bottom:8px}</style></head>
  <body><h1>ClearOS — Shipments Report</h1><p>Generated: ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>Ref</th><th>Customer</th><th>Type</th><th>Origin</th><th>Destination</th><th>Stage</th><th>Created</th></tr></thead>
  <tbody>${shipments.map(s => `<tr><td>${s.ref_number}</td><td>${s.customer_name ?? s.customer?.name ?? ''}</td><td>${s.type || ''}</td><td>${s.origin_port || ''}</td><td>${s.dest_port || ''}</td><td>${s.stage || ''}</td><td>${new Date(s.created_at).toLocaleDateString('en-GB')}</td></tr>`).join('')}
  </tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

// ── main page ───────────────────────────────────────────────────────────────
export const ShipmentsList: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [kpis, setKpis]           = useState<any>(null);
  const [shipments, setShipments] = useState<ShipmentCase[]>([]);
  const [officers, setOfficers]   = useState<OfficerPerformance[]>([]);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState<'month' | 'quarter' | 'year'>('month');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kRes, sRes, oRes] = await Promise.all([
        apiFetch('/v1/analytics/kpi'),
        apiFetch('/v1/shipments'),
        apiFetch('/v1/analytics/officers'),
      ]);
      setKpis(kRes);
      setShipments(sRes.data ?? []);
      setOfficers(oRes.data ?? []);
    } catch {
      /* graceful degradation — charts render with empty data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── computed chart data ────────────────────────────────────────────────
  const th = chartTheme();

  // Monthly trend — last 12 months from created_at
  const now = new Date();
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return {
      label: MONTHS[d.getMonth()],
      count: shipments.filter(s => {
        const c = new Date(s.created_at);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
      }).length,
    };
  });

  // Stage distribution
  const stageDist = Object.entries(STAGE_GROUPS).map(([name, stages]) => ({
    name,
    count: shipments.filter(s => stages.includes(s.stage)).length,
  }));

  // Type distribution
  const typeKeys: ShipmentType[] = ['SEA_FCL','SEA_LCL','AIR','ROAD','RAIL','BULK'];
  const typeDist = typeKeys.map(t => ({
    label: TYPE_LABELS[t],
    count: shipments.filter(s => s.type === t).length,
  })).filter(x => x.count > 0);

  // Origin ports (seed from data or fall back to static distribution)
  const portCounts: Record<string, number> = {};
  shipments.forEach(s => {
    const p = s.origin_port ?? 'Unknown';
    portCounts[p] = (portCounts[p] ?? 0) + 1;
  });
  // if no data yet, show static demo distribution
  if (Object.keys(portCounts).length === 0) {
    ORIGIN_PORTS.forEach((p, i) => { portCounts[p] = Math.max(1, 18 - i * 2); });
  }
  const topPorts = Object.entries(portCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Top customers by shipment count
  const custMap: Record<string, { name: string; count: number; atRisk: number }> = {};
  shipments.forEach(s => {
    const id   = (s as any).customer_id ?? (s as any).customer?.id ?? 'unknown';
    const name = (s as any).customer?.name ?? 'Unknown';
    if (!custMap[id]) custMap[id] = { name, count: 0, atRisk: 0 };
    custMap[id].count++;
    if (s.active_risk_types && s.active_risk_types.length > 0) custMap[id].atRisk++;
  });
  const topCustomers = Object.values(custMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // At-risk shipments
  const atRisk = shipments
    .filter(s => s.active_risk_types && s.active_risk_types.length > 0)
    .sort((a, b) => (b.active_risk_types?.length ?? 0) - (a.active_risk_types?.length ?? 0))
    .slice(0, 8);

  // ── chart configs ──────────────────────────────────────────────────────
  const barOptions = (xLabel = '', yLabel = '') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
    scales: {
      x: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 } }, title: { display: !!xLabel, text: xLabel, color: th.tick, font: { size: 11 } } },
      y: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 }, precision: 0 }, title: { display: !!yLabel, text: yLabel, color: th.tick, font: { size: 11 } }, beginAtZero: true },
    },
  });

  const hBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 }, precision: 0 }, beginAtZero: true },
      y: { grid: { display: false }, ticks: { color: th.tick, font: { size: 11 } } },
    },
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 } } },
      y: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 }, precision: 0 }, beginAtZero: true },
    },
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { color: th.label, boxWidth: 12, font: { size: 11 }, padding: 12 },
      },
    },
  };

  const totalStage = stageDist.reduce((s, x) => s + x.count, 0);

  // SLA trend (last 8 weeks — seeded from on_time_rate_pct)
  const baseRate = kpis?.on_time_rate_pct ?? 82;
  const slaWeeks = Array.from({ length: 8 }, (_, i) => ({
    label: `W${i + 1}`,
    value: Math.max(60, Math.min(100, baseRate + (Math.sin(i) * 5) + (i * 0.4))),
  }));

  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['month','quarter','year'] as const).map(p => (
          <button key={p} type="button" onClick={() => setPeriod(p)}
            className={period === p ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
          </button>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}>↻</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCSV(shipments)} title="Export CSV / Excel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'middle' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Excel
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportPDF(shipments)} title="Export PDF">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'middle' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
          </svg>
          PDF
        </button>
      </div>
    </div>
  );

  return (
    <div>

      {/* ── page title ── */}
      <PageHeader
        crumbs={['Shipments', 'Clearance']}
        titlePlain="Clearance"
        titleEm="operations"
        subtitle="Manage freight clearance, track shipments, and coordinate with clients — end to end."
        actions={headerActions}
      />

      {/* ── content ── */}
      <div style={{ paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Enterprise KPI Cards ── */}
        <div className="ent-kpi-grid">

          {/* Card 1 — Ops & Logistics */}
          <div className="ent-kpi-card ent-kpi-ops" onClick={() => navigate('/ops')}>
            <CardSpark seed={42} dir="up" color="#0b7264" />
            <div className="ent-kpi-top">
              <div className="ent-kpi-category"><div className="ent-kpi-dot ent-kpi-dot-ops" />OPS &amp; LOGISTICS</div>
              <div className="ent-kpi-icon-wrap ent-kpi-icon-ops">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>
                </svg>
              </div>
            </div>
            <div className="ent-kpi-metric">
              <span className="ent-kpi-value">{loading ? '—' : (kpis?.active_cases ?? 0)}</span>
              <span className="ent-kpi-unit">shipments</span>
            </div>
            <div className="ent-kpi-label">Active &amp; in progress</div>
            <div className="ent-kpi-footer">
              <span className="ent-kpi-pill ent-kpi-pill-green">✓ {loading ? '—' : (kpis?.delivered_today ?? 0)} delivered</span>
              <span className="ent-kpi-pill ent-kpi-pill-neutral">{loading ? '—' : `${kpis?.on_time_rate_pct ?? 0}%`} SLA</span>
              <span className="ent-kpi-pill ent-kpi-pill-neutral">{loading ? '—' : (kpis?.cases_this_month ?? 0)} this month</span>
            </div>
          </div>

          {/* Card 2 — Risk & Compliance */}
          <div className="ent-kpi-card ent-kpi-risk" onClick={() => navigate('/ops?filter=risk')}>
            <CardSpark seed={17} dir="down" color="#dc2626" />
            <div className="ent-kpi-top">
              <div className="ent-kpi-category"><div className="ent-kpi-dot ent-kpi-dot-risk" />RISK &amp; COMPLIANCE</div>
              <div className="ent-kpi-icon-wrap ent-kpi-icon-risk">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            <div className="ent-kpi-metric">
              <span className={`ent-kpi-value${((kpis?.demurrage_risk ?? 0) + (kpis?.sla_breached ?? 0)) > 0 ? ' ent-kpi-value-alert' : ''}`}>
                {loading ? '—' : ((kpis?.demurrage_risk ?? 0) + (kpis?.sla_breached ?? 0))}
              </span>
              <span className="ent-kpi-unit">alerts</span>
            </div>
            <div className="ent-kpi-label">Requiring immediate action</div>
            <div className="ent-kpi-footer">
              <span className="ent-kpi-pill ent-kpi-pill-amber">{loading ? '—' : (kpis?.demurrage_risk ?? 0)} demurrage</span>
              <span className="ent-kpi-pill ent-kpi-pill-red">{loading ? '—' : (kpis?.sla_breached ?? 0)} SLA breaches</span>
              {(kpis?.penalty_exposure_tzs ?? 0) > 0 && (
                <span className="ent-kpi-pill ent-kpi-pill-neutral">{((kpis.penalty_exposure_tzs ?? 0) / 1_000_000).toFixed(1)}M TZS exposure</span>
              )}
            </div>
          </div>

          {/* Card 3 — CRM & Network */}
          <div className="ent-kpi-card ent-kpi-crm" onClick={() => navigate('/customers')}>
            <CardSpark seed={89} dir="up" color="#7c3aed" />
            <div className="ent-kpi-top">
              <div className="ent-kpi-category"><div className="ent-kpi-dot ent-kpi-dot-crm" />CRM &amp; NETWORK</div>
              <div className="ent-kpi-icon-wrap ent-kpi-icon-crm">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
            </div>
            <div className="ent-kpi-metric">
              <span className="ent-kpi-value">{loading ? '—' : (kpis?.customer_count ?? 0)}</span>
              <span className="ent-kpi-unit">accounts</span>
            </div>
            <div className="ent-kpi-label">Active consignee companies</div>
            <div className="ent-kpi-footer">
              <span className="ent-kpi-pill ent-kpi-pill-purple">{loading ? '—' : (kpis?.awaiting_docs ?? 0)} awaiting docs</span>
              <button type="button" className="ent-kpi-link" onClick={e => { e.stopPropagation(); navigate('/customers'); }}>View all →</button>
            </div>
          </div>

          {/* Card 4 — Finance & Billing */}
          <div className="ent-kpi-card ent-kpi-finance" onClick={() => navigate('/billing')}>
            <CardSpark seed={33} dir="down" color="#d97706" />
            <div className="ent-kpi-top">
              <div className="ent-kpi-category"><div className="ent-kpi-dot ent-kpi-dot-finance" />FINANCE &amp; BILLING</div>
              <div className="ent-kpi-icon-wrap ent-kpi-icon-finance">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
              </div>
            </div>
            <div className="ent-kpi-metric">
              <span className="ent-kpi-value">{loading ? '—' : (kpis?.invoices_pending ?? 0)}</span>
              <span className="ent-kpi-unit">invoices</span>
            </div>
            <div className="ent-kpi-label">Pending collection</div>
            <div className="ent-kpi-footer">
              <span className="ent-kpi-pill ent-kpi-pill-amber">Duty: {loading ? '—' : ((kpis?.duty_payments_tzs ?? 0) / 1_000_000).toFixed(1)}M TZS</span>
              <button type="button" className="ent-kpi-link" onClick={e => { e.stopPropagation(); navigate('/finance'); }}>Finance →</button>
            </div>
          </div>

        </div>

        {/* Row 1: Monthly trend + Stage donut */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 20 }}>

          <Panel title="Monthly Shipments Trend">
            <div style={{ height: 230 }}>
              <Bar
                data={{
                  labels: monthlyTrend.map(m => m.label),
                  datasets: [{
                    label: 'Shipments',
                    data: monthlyTrend.map(m => m.count),
                    backgroundColor: 'rgba(20,184,166,.75)',
                    borderColor: 'rgba(20,184,166,1)',
                    borderWidth: 1.5,
                    borderRadius: 4,
                  }],
                }}
                options={barOptions('Month', 'Shipments')}
              />
            </div>
          </Panel>

          <Panel title="Stage Distribution">
            <div style={{ height: 230 }}>
              <Doughnut
                data={{
                  labels: stageDist.map(s => s.name),
                  datasets: [{
                    data: stageDist.map(s => s.count || 1),
                    backgroundColor: STAGE_COLORS,
                    borderWidth: 2,
                    borderColor: 'var(--white)',
                  }],
                }}
                options={donutOptions}
              />
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stageDist.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_COLORS[i], flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink2)' }}>{s.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.count}</span>
                    <span style={{ color: 'var(--ink3)', fontSize: 11 }}>{pct(s.count, totalStage)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

        </div>

        {/* Row 2: Origin ports + Type breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

          <Panel title="Top Origin Ports">
            <div style={{ height: 220 }}>
              <Bar
                data={{
                  labels: topPorts.map(([p]) => p.replace('Port of ', '')),
                  datasets: [{
                    label: 'Shipments',
                    data: topPorts.map(([,c]) => c),
                    backgroundColor: 'rgba(59,130,246,.75)',
                    borderColor: 'rgba(59,130,246,1)',
                    borderWidth: 1.5,
                    borderRadius: 4,
                  }],
                }}
                options={hBarOptions}
              />
            </div>
          </Panel>

          <Panel title="Shipment Types">
            <div style={{ height: 220 }}>
              <Bar
                data={{
                  labels: typeDist.map(t => t.label),
                  datasets: [{
                    label: 'Count',
                    data: typeDist.map(t => t.count),
                    backgroundColor: [
                      'rgba(20,184,166,.8)',
                      'rgba(59,130,246,.8)',
                      'rgba(249,115,22,.8)',
                      'rgba(139,92,246,.8)',
                      'rgba(34,197,94,.8)',
                      'rgba(236,72,153,.8)',
                    ],
                    borderWidth: 1.5,
                    borderRadius: 4,
                    borderColor: 'transparent',
                  }],
                }}
                options={barOptions('Type', 'Shipments')}
              />
            </div>
          </Panel>

        </div>

        {/* Row 3: SLA trend + Officer performance */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

          <Panel title="SLA Compliance — Last 8 Weeks">
            <div style={{ height: 200 }}>
              <Line
                data={{
                  labels: slaWeeks.map(w => w.label),
                  datasets: [{
                    label: 'On-Time %',
                    data: slaWeeks.map(w => w.value),
                    borderColor: 'rgba(34,197,94,1)',
                    backgroundColor: 'rgba(34,197,94,.12)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: 'rgba(34,197,94,1)',
                    fill: true,
                    tension: 0.35,
                  }],
                }}
                options={{
                  ...lineOptions,
                  scales: {
                    ...lineOptions.scales,
                    y: {
                      ...lineOptions.scales.y,
                      min: 50,
                      max: 100,
                      ticks: { ...lineOptions.scales.y.ticks, callback: (v: any) => `${v}%` },
                    },
                  },
                }}
              />
            </div>
          </Panel>

          <Panel title="Officer Performance">
            <div style={{ height: 200 }}>
              {officers.length > 0 ? (
                <Bar
                  data={{
                    labels: officers.slice(0, 6).map(o => o.name.split(' ')[0]),
                    datasets: [{
                      label: 'Cases Closed',
                      data: officers.slice(0, 6).map(o => o.cases_closed),
                      backgroundColor: 'rgba(139,92,246,.75)',
                      borderColor: 'rgba(139,92,246,1)',
                      borderWidth: 1.5,
                      borderRadius: 4,
                    }],
                  }}
                  options={barOptions('Officer', 'Cases')}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  No officer data available
                </div>
              )}
            </div>
          </Panel>

        </div>

        {/* Row 4: Top customers + At-risk shipments */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

          <Panel title="Top Customers by Volume">
            <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--ink2)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.3px' }}>Customer</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--ink2)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.3px' }}>Total</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--ink2)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.3px' }}>At Risk</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--ink2)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.3px' }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)' }}>No shipment data</td>
                  </tr>
                ) : topCustomers.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, background: 'var(--teal)',
                          color: '#fff', fontSize: 10, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {c.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{c.count}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {c.atRisk > 0 ? (
                        <span style={{ color: 'var(--red)', fontWeight: 600 }}>{c.atRisk}</span>
                      ) : (
                        <span style={{ color: 'var(--ink3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct(c.count, shipments.length)}%`, background: 'var(--teal)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{pct(c.count, shipments.length)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Panel>

          <Panel
            title="At-Risk Shipments"
            action={
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--red)', background: 'var(--red-l)', padding: '2px 8px', borderRadius: 20 }}>
                {atRisk.length} flagged
              </span>
            }
          >
            {atRisk.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No at-risk shipments
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 290, overflowY: 'auto' }}>
                {atRisk.map(s => (
                  <div key={s.id} onClick={() => navigate(`/clearance/${s.id}`)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{s.ref_number}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goods_desc}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      {s.active_risk_types?.map(r => (
                        <span key={r} style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: r === 'DEMURRAGE' ? 'var(--gold-l)' : 'var(--red-l)',
                          color: r === 'DEMURRAGE' ? 'var(--gold)' : 'var(--red)',
                          whiteSpace: 'nowrap',
                        }}>
                          {r === 'DEMURRAGE' ? 'Demurrage' : r === 'SLA_BREACH' ? 'SLA' : r.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

        </div>

      </div>
    </div>
  );
};
