import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import type { IconName } from '../components/Icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import { exportCsv, ExportButton, StatTile, DataTable } from '../components/AnalyticsKit.js';
import type { ColumnDef } from '../components/AnalyticsKit.js';
import type { StageBottleneck, OfficerPerformance, KPIResponse, ShipmentCase } from '@hudumika/types';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { showAlert } from '../lib/alert.js';
import './OperationalDashboards.css';
import './ClearOSDashboard.css';
import './OndiPages.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function StageCycleAreaChart({ rows, onSelect }: { rows: StageBottleneck[]; onSelect: (row: StageBottleneck) => void }) {
  const data = rows.map(row => ({ ...row, label: row.stage_label.length > 14 ? `${row.stage_label.slice(0, 13)}…` : row.stage_label }));
  return (
    <div className="clearos-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -16, bottom: 42 }} onClick={(state: any) => {
          if (state?.activeTooltipIndex != null && data[state.activeTooltipIndex]) onSelect(data[state.activeTooltipIndex]);
        }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9.5, fill: 'var(--ink3)' }} interval={0} angle={-28} textAnchor="end" height={58} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--ink3)' }} width={34} unit="h" />
          <RechartsTooltip formatter={(value) => [`${Number(value).toFixed(1)} hours`, 'Average duration']} labelFormatter={(_, payload) => payload?.[0]?.payload?.stage_label || ''} contentStyle={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'none', fontSize: 12 }} />
          <Area type="monotone" dataKey="avg_hours" stroke="var(--teal)" strokeWidth={2.5} fill="var(--teal-l)" activeDot={{ r: 5, cursor: 'pointer' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const OFFICER_CHART_COLORS = ['var(--teal)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--purple)', 'var(--red)'];

/**
 * Each officer's caseload — open plus closed. It used to plot closed cases
 * only, so a team that had not closed anything yet drew an empty chart and
 * said "no active clearing officers" beside tiles showing active cases.
 */
function OfficerOutputDonut({ rows, onSelect }: { rows: OfficerPerformance[]; onSelect: (row: OfficerPerformance) => void }) {
  const data = rows
    .map(row => ({ ...row, caseload: row.active_cases + row.cases_closed }))
    .filter(row => row.caseload > 0);
  const total = data.reduce((sum, row) => sum + row.caseload, 0);
  return (
    <div className="clearos-donut-layout">
      <div className="clearos-donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="caseload" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
              {data.map((row, index) => (
                <Cell key={row.user_id} fill={OFFICER_CHART_COLORS[index % OFFICER_CHART_COLORS.length]} cursor="pointer" onClick={() => onSelect(row)} />
              ))}
            </Pie>
            <RechartsTooltip contentStyle={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'none', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="clearos-donut__center">
          <strong>{total}</strong>
          <span>cases</span>
        </div>
      </div>
      <div className="clearos-donut-legend">
        {data.slice(0, 6).map((row, index) => (
          <button type="button" key={row.user_id} onClick={() => onSelect(row)} data-ui-native-button="">
            <span style={{ background: OFFICER_CHART_COLORS[index % OFFICER_CHART_COLORS.length] }} />
            <em>{row.name}</em>
            <strong title={`${row.active_cases} open · ${row.cases_closed} closed`}>{row.caseload}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricSection({ title, icon, variant, onExport, statTiles, chart, table, expanded, onToggle }: {
  title: string;
  icon: IconName;
  variant: 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';
  onExport: () => void;
  statTiles: React.ReactNode;
  chart: React.ReactNode;
  table: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="clearos-dashboard__panel">
      <div className="clearos-dashboard__panel-head">
        <div className="clearos-dashboard__panel-title">
          <FeaturedIcon variant={variant} size="sm" shape="square">
            <Icon name={icon} size={15} strokeWidth={1.75} />
          </FeaturedIcon>
          <h2>{title}</h2>
        </div>
        <div className="clearos-dashboard__panel-actions">
          <Button type="button" variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
            {expanded ? 'Hide table' : 'Show table'}
          </Button>
          <ExportButton onClick={onExport} />
        </div>
      </div>

      <div className="clearos-dashboard__chart-card" style={{ marginBottom: expanded ? 12 : 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {statTiles}
        </div>
        {chart}
      </div>

      {expanded && table}
    </section>
  );
}

interface LedgerAnchor {
  id: string;
  checkpointHash: string;
  declarationCount: number;
  status: 'pending' | 'confirmed' | 'failed';
  bitcoinBlockHeight: number | null;
  bitcoinBlockTime: string | null;
  trigger: 'manual' | 'scheduled';
  errorMessage: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

const LEDGER_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'];

function LedgerIntegritySection() {
  const { user } = useAuth();
  const isAdmin = !!user && LEDGER_ADMIN_ROLES.includes(user.role);

  if (!isAdmin) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--r)', background: 'var(--green-l)', border: '1px solid var(--green)', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
        <Icon name="shield" size={13} strokeWidth={2} />
        Audit trail anchored — records are independently verifiable
      </div>
    );
  }

  return <LedgerIntegrityAdminPanel />;
}

function LedgerIntegrityAdminPanel() {
  const [anchors, setAnchors] = useState<LedgerAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchoring, setAnchoring] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/declarations/anchors').then(setAnchors).catch(() => setAnchors([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function anchorNow() {
    setAnchoring(true);
    try {
      await apiFetch('/v1/declarations/anchors', { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to anchor the declaration ledger.');
    } finally {
      setAnchoring(false);
    }
  }

  async function checkConfirmation(id: string) {
    setCheckingId(id);
    try {
      await apiFetch(`/v1/declarations/anchors/${id}/check`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to check confirmation.');
    } finally {
      setCheckingId(null);
    }
  }

  function downloadProof(id: string, hash: string) {
    apiDownload(`/v1/declarations/anchors/${id}/proof`, `${hash}.ots`).catch(err => showAlert(err.message || 'Download failed'));
  }

  const confirmedCount = anchors.filter(a => a.status === 'confirmed').length;
  const pendingCount = anchors.filter(a => a.status === 'pending').length;
  const declarationCount = anchors.reduce((sum, a) => sum + a.declarationCount, 0);
  const latestBlock = anchors
    .map(a => a.bitcoinBlockHeight)
    .filter((height): height is number => height != null)
    .sort((a, b) => b - a)[0];

  return (
    <section className="clearos-dashboard__ledger">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FeaturedIcon variant="warning" size="sm" shape="square">
            <Icon name="shield" size={15} strokeWidth={1.75} />
          </FeaturedIcon>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Ledger Integrity &amp; Cryptographic Proofs</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="outline" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>
            <Icon name={detailsOpen ? 'chevronUp' : 'chevronDown'} size={13} />
            {detailsOpen ? 'Hide details' : 'View details'}
          </Button>
          <Button size="sm" onClick={anchorNow} disabled={anchoring}>
            <Icon name="lock" size={13} /> {anchoring ? 'Anchoring…' : 'Anchor Now'}
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14, lineHeight: 1.6 }}>
        Every customs declaration&apos;s tamper-evident history is periodically anchored to Bitcoin via OpenTimestamps, enabling independent legal verification.
      </div>
      <div className="clearos-ledger-metrics">
        <div className="clearos-ledger-metric">
          <span className="clearos-ledger-metric__label">Anchor records</span>
          <strong>{loading ? '—' : anchors.length.toLocaleString('en')}</strong>
          <span>Total checkpoints</span>
        </div>
        <div className="clearos-ledger-metric" data-tone="success">
          <span className="clearos-ledger-metric__label">Confirmed</span>
          <strong>{loading ? '—' : confirmedCount.toLocaleString('en')}</strong>
          <span>Secured on Bitcoin</span>
        </div>
        <div className="clearos-ledger-metric" data-tone="warning">
          <span className="clearos-ledger-metric__label">Pending</span>
          <strong>{loading ? '—' : pendingCount.toLocaleString('en')}</strong>
          <span>Awaiting confirmation</span>
        </div>
        <div className="clearos-ledger-metric">
          <span className="clearos-ledger-metric__label">Declarations anchored</span>
          <strong>{loading ? '—' : declarationCount.toLocaleString('en')}</strong>
          <span>{latestBlock ? `Latest block ${latestBlock.toLocaleString('en')}` : 'No confirmed block yet'}</span>
        </div>
      </div>

      {detailsOpen && (loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading anchor history…</div>
      ) : anchors.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No anchors yet — click &ldquo;Anchor Now&rdquo; to create the first one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {anchors.map(a => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Badge variant={a.status === 'confirmed' ? 'success' : a.status === 'failed' ? 'error' : 'warning'}>
                    {a.status === 'confirmed' ? 'Confirmed' : a.status === 'failed' ? 'Failed' : 'Pending'}
                  </Badge>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.checkpointHash}>
                    {a.checkpointHash.slice(0, 20)}…
                  </span>
                </div>
                {a.status === 'confirmed' && a.bitcoinBlockHeight && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>Bitcoin block {a.bitcoinBlockHeight.toLocaleString('en')}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink3)' }}>
                  <span>{a.declarationCount} declaration{a.declarationCount !== 1 ? 's' : ''}</span>
                  <span aria-hidden="true">·</span>
                  <span>{a.trigger === 'manual' ? 'Manual' : 'Scheduled'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {a.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => checkConfirmation(a.id)} disabled={checkingId === a.id}>
                      {checkingId === a.id ? 'Checking…' : 'Check Confirmation'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => downloadProof(a.id, a.checkpointHash)}>
                    <Icon name="download" size={13} /> Download Proof
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

interface CustomerOverviewData {
  kpis: {
    active_shipments: number;
    cleared_this_month: number;
    pending_customs: number;
    outstanding_duties_tzs: number;
  };
  status_cards: {
    on_time_clearance_pct: number;
    document_compliance_pct: number;
    at_risk_shipments: number;
    active_shipment_count: number;
    freight_revenue_mtd_tzs: number;
  };
  shipment_status: {
    IN_TRANSIT: number;
    AT_PORT: number;
    CUSTOMS_HOLD: number;
    CLEARED: number;
  };
  declarations_today: {
    filed: number;
    approved: number;
    pending_review: number;
    cancelled: number;
  };
  top_customers: Array<{
    name: string;
    shipments: number;
    invoiced_mtd: number;
  }>;
  finance_summary: {
    total_invoiced_mtd: number;
    collected_mtd: number;
    outstanding_mtd: number;
    overdue_30d: number;
  };
}

function fmtMoney(amount: number | null | undefined, curr = 'TZS'): string {
  if (amount == null || isNaN(amount)) return '—';
  if (amount >= 1_000_000_000) return `${curr} ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${curr} ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${curr} ${(amount / 1_000).toFixed(1)}K`;
  return `${curr} ${Math.round(amount).toLocaleString('en')}`;
}

export const ClearOSMetricsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [bottlenecks, setBottlenecks] = useState<StageBottleneck[]>([]);
  const [officers, setOfficers] = useState<OfficerPerformance[]>([]);
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [overview, setOverview] = useState<CustomerOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataErrors, setDataErrors] = useState({ bottlenecks: false, officers: false, kpis: false, overview: false });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [bottlenecksOpen, setBottlenecksOpen] = useState(false);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [focusStage, setFocusStage] = useState<string | null>(null);
  const [focusOfficer, setFocusOfficer] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, oRes, kRes, overviewRes] = await Promise.allSettled([
        apiFetch('/v1/analytics/bottlenecks'),
        apiFetch('/v1/analytics/officers'),
        apiFetch('/v1/analytics/kpi'),
        apiFetch('/v1/analytics/customer-overview'),
      ]);

      const failures = {
        bottlenecks: bRes.status === 'rejected',
        officers: oRes.status === 'rejected',
        kpis: kRes.status === 'rejected',
        overview: overviewRes.status === 'rejected',
      };
      setDataErrors(failures);
      if (bRes.status === 'fulfilled') setBottlenecks(bRes.value.data || []);
      if (oRes.status === 'fulfilled') setOfficers(oRes.value.data || []);
      if (kRes.status === 'fulfilled') setKpis(kRes.value);
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);

      if (Object.values(failures).some(Boolean)) {
        setError('Some dashboard data could not be refreshed. Retry to load the latest figures.');
      } else {
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load operations metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportBottlenecksCsv = () => exportCsv(
    'stage-cycle-times.csv',
    ['Stage', 'Stage History Entries', 'Avg Hours', 'P90 Hours', 'SLA Breaches'],
    bottlenecks.map(b => [b.stage_label, b.case_count, b.avg_hours, b.p90_hours, b.sla_breaches]),
  );

  const exportOfficersCsv = () => exportCsv(
    'officer-output.csv',
    ['Officer', 'Active Cases', 'Closed Cases', 'Avg Cycle Days', 'Cases with Demurrage'],
    officers.map(o => [o.name, o.active_cases, o.cases_closed, o.avg_days, o.cases_with_demurrage]),
  );

  const slowest = bottlenecks.length > 0
    ? bottlenecks.reduce((m, b) => (b.avg_hours > m.avg_hours ? b : m), bottlenecks[0])
    : null;
  const totalCases = bottlenecks.reduce((s, b) => s + b.case_count, 0);
  const totalBreaches = bottlenecks.reduce((s, b) => s + b.sla_breaches, 0);
  const weightedAvgHours = totalCases > 0
    ? bottlenecks.reduce((s, b) => s + b.avg_hours * b.case_count, 0) / totalCases
    : 0;

  // Most closures; with none closed yet, most open cases; nobody when the
  // team has no cases at all. (It used to name whoever happened to be first.)
  const anyClosed = officers.some(o => o.cases_closed > 0);
  const topOfficer = officers
    .filter(o => (anyClosed ? o.cases_closed : o.active_cases) > 0)
    .reduce<OfficerPerformance | null>((m, o) => {
      const score = (x: OfficerPerformance) => (anyClosed ? x.cases_closed : x.active_cases);
      return !m || score(o) > score(m) ? o : m;
    }, null);
  const totalActive = officers.reduce((s, o) => s + o.active_cases, 0);
  const totalClosed = officers.reduce((s, o) => s + o.cases_closed, 0);
  const totalPenalties = officers.reduce((s, o) => s + o.cases_with_demurrage, 0);

  const officersSortedForChart = [...officers].sort((a, b) => (b.active_cases + b.cases_closed) - (a.active_cases + a.cases_closed));

  const bottleneckColumns: ColumnDef<StageBottleneck>[] = [
    { key: 'stage', label: 'Clearance Stage', sortValue: b => b.stage_label, render: b => <strong>{b.stage_label}</strong> },
    { key: 'entries', label: 'Stage History Entries', align: 'right', sortValue: b => b.case_count, render: b => `${b.case_count}` },
    {
      key: 'avg', label: 'Avg Duration', align: 'right', sortValue: b => b.avg_hours,
      render: b => <span style={{ color: b.avg_hours > 24 ? 'var(--red)' : 'var(--ink)', fontFamily: 'var(--font)' }}>{b.avg_hours}h</span>,
    },
    { key: 'p90', label: 'P90 Duration', align: 'right', sortValue: b => b.p90_hours, render: b => <span style={{ fontFamily: 'var(--font)', color: 'var(--ink2)' }}>{b.p90_hours}h</span> },
    {
      key: 'breaches', label: 'SLA Breaches', align: 'right', sortValue: b => b.sla_breaches,
      render: b => <span className={b.sla_breaches > 0 ? 'badge badge-red' : 'badge badge-green'}>{b.sla_breaches}</span>,
    },
  ];

  const officerColumns: ColumnDef<OfficerPerformance>[] = [
    { key: 'name', label: 'Officer Name', sortValue: o => o.name, render: o => <strong>{o.name}</strong> },
    { key: 'active', label: 'Active Cases', align: 'right', sortValue: o => o.active_cases, render: o => `${o.active_cases}` },
    { key: 'closed', label: 'Closed Cases', align: 'right', sortValue: o => o.cases_closed, render: o => `${o.cases_closed}` },
    {
      key: 'avg_days', label: 'Avg Cycle', align: 'right', sortValue: o => o.avg_days,
      render: o => <span style={{ fontFamily: 'var(--font)' }}>{o.avg_days > 0 ? `${o.avg_days}d` : '—'}</span>,
    },
    {
      key: 'demurrage', label: 'Cases with Demurrage', align: 'right', sortValue: o => o.cases_with_demurrage,
      render: o => <span className={o.cases_with_demurrage > 0 ? 'badge badge-red' : 'badge badge-green'}>{o.cases_with_demurrage}</span>,
    },
  ];

  // Pipeline stages calculation
  const totalShipmentsInStatus = (overview?.shipment_status?.AT_PORT ?? 0) +
    (overview?.shipment_status?.CUSTOMS_HOLD ?? 0) +
    (overview?.shipment_status?.IN_TRANSIT ?? 0) +
    (overview?.shipment_status?.CLEARED ?? 0);

  const atPortPct = totalShipmentsInStatus > 0 ? Math.round(((overview?.shipment_status?.AT_PORT ?? 0) / totalShipmentsInStatus) * 100) : 0;
  const customsHoldPct = totalShipmentsInStatus > 0 ? Math.round(((overview?.shipment_status?.CUSTOMS_HOLD ?? 0) / totalShipmentsInStatus) * 100) : 0;
  const inTransitPct = totalShipmentsInStatus > 0 ? Math.round(((overview?.shipment_status?.IN_TRANSIT ?? 0) / totalShipmentsInStatus) * 100) : 0;
  const clearedPct = totalShipmentsInStatus > 0 ? Math.round(((overview?.shipment_status?.CLEARED ?? 0) / totalShipmentsInStatus) * 100) : 0;

  return (
    <div className="ops-dashboard clearos-dashboard" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sync time + refresh. The page title lives in ClearOSLanding's PageHeader. */}
      <div className="clearos-dashboard__syncbar">
        <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}</span>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <Icon name="refresh" size={13} /> Refresh
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="clearos-dashboard__content">
          {error && <Banner variant="error" className="mb-5">{error}</Banner>}

          {/* Top Operational Metrics Row */}
          <MetricsRow cards={[
            {
              title: 'Monthly shipments',
              value: kpis ? String(kpis.cases_this_month) : '—',
              sub1Label: 'DELIVERED TODAY', sub1Value: kpis ? String(kpis.delivered_today) : '—',
              sub2Label: 'ACTIVE CASES',   sub2Value: kpis ? String(kpis.active_cases ?? overview?.kpis?.active_shipments ?? 0) : '—',
              icon: 'package',
              barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
              loading: loading && !kpis, error: dataErrors.kpis ? 'Unavailable' : undefined, onRetry: load,
            },
            {
              title: 'On-time rate',
              value: kpis?.on_time_rate_pct == null ? '—' : `${kpis.on_time_rate_pct}%`,
              sub1Label: 'CLOSED CASES', sub1Value: kpis ? String(kpis.closed_cases) : '—',
              sub2Label: 'ACTIVE OVERDUE', sub2Value: kpis ? String(kpis.sla_breached) : '—',
              icon: 'checkCircle',
              barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
              loading: loading && !kpis, error: dataErrors.kpis ? 'Unavailable' : undefined, onRetry: load,
            },
            {
              title: 'Free-time risk',
              value: kpis ? String((kpis.free_time_due_48h ?? 0) + (kpis.free_time_overdue ?? 0)) : '—',
              sub1Label: 'EXPIRING ≤48H', sub1Value: kpis ? String(kpis.free_time_due_48h ?? 0) : '—',
              sub2Label: 'ALREADY OVERDUE', sub2Value: kpis ? String(kpis.free_time_overdue ?? 0) : '—',
              icon: 'alertTriangle',
              barColor: 'var(--gold-l)', barHighlight: 'var(--gold)',
              loading: loading && !kpis, error: dataErrors.kpis ? 'Unavailable' : undefined, onRetry: load,
            },
            {
              title: 'CO₂ emissions',
              value: kpis ? `${(kpis.total_co2_emissions_kg ?? 0).toLocaleString('en')} kg` : '—',
              sub1Label: 'CREDITS SAVED', sub1Value: kpis ? `${kpis.total_carbon_credits_saved ?? 0}` : '—',
              icon: 'globe',
              barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
              onClick: () => navigate('/clearos/carbon'), loading: loading && !kpis,
              error: dataErrors.kpis ? 'Unavailable' : undefined, onRetry: load,
            },
          ]} />

          {/* Breakdown Section 1: Clearance Stage Lifecycle Pipeline */}
          <div className="clearos-section-header">
            <div className="clearos-section-title-wrap">
              <FeaturedIcon variant="brand" size="sm" shape="square">
                <Icon name="layers" size={15} />
              </FeaturedIcon>
              <div>
                <h3 className="clearos-section-title">Shipment pipeline</h3>
                <p className="clearos-section-desc">Active shipments by stage.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/clearos/ops')}>
              View Operations <Icon name="arrowRight" size={13} />
            </Button>
          </div>

          <div className="clearos-pipeline-grid">
            {/* At Port */}
            <button type="button" className="clearos-pipeline-card" onClick={() => navigate('/clearos/ops?status=port')}>
              <div className="clearos-pipeline-head">
                <span className="clearos-pipeline-name">At port</span>
                <Badge variant="brand">{overview ? `${atPortPct}%` : '—'}</Badge>
              </div>
              <div className="clearos-pipeline-num">{overview ? (overview.shipment_status?.AT_PORT ?? 0) : '—'}</div>
              <div className="clearos-pipeline-bar-wrap">
                <div className="clearos-pipeline-bar" style={{ width: `${atPortPct}%`, background: 'var(--teal)' }} />
              </div>
              <span className="clearos-pipeline-stages-list">Docs · permits · customs entry</span>
            </button>

            {/* Customs Hold */}
            <button type="button" className="clearos-pipeline-card" onClick={() => navigate('/clearos/ops?status=customs')}>
              <div className="clearos-pipeline-head">
                <span className="clearos-pipeline-name">Customs hold</span>
                <Badge variant={customsHoldPct > 0 ? 'warning' : 'gray'}>{overview ? `${customsHoldPct}%` : '—'}</Badge>
              </div>
              <div className="clearos-pipeline-num">{overview ? (overview.shipment_status?.CUSTOMS_HOLD ?? 0) : '—'}</div>
              <div className="clearos-pipeline-bar-wrap">
                <div className="clearos-pipeline-bar" style={{ width: `${customsHoldPct}%`, background: 'var(--amber, #f59e0b)' }} />
              </div>
              <span className="clearos-pipeline-stages-list">Review · assessment · tax</span>
            </button>

            {/* In Transit */}
            <button type="button" className="clearos-pipeline-card" onClick={() => navigate('/clearos/ops?status=transit')}>
              <div className="clearos-pipeline-head">
                <span className="clearos-pipeline-name">In transit</span>
                <Badge variant="brand">{overview ? `${inTransitPct}%` : '—'}</Badge>
              </div>
              <div className="clearos-pipeline-num">{overview ? (overview.shipment_status?.IN_TRANSIT ?? 0) : '—'}</div>
              <div className="clearos-pipeline-bar-wrap">
                <div className="clearos-pipeline-bar" style={{ width: `${inTransitPct}%`, background: 'var(--blue, #3b82f6)' }} />
              </div>
              <span className="clearos-pipeline-stages-list">CFS · haulage · border</span>
            </button>

            {/* Cleared & Delivered */}
            <button type="button" className="clearos-pipeline-card" onClick={() => navigate('/clearos/ops?status=cleared')}>
              <div className="clearos-pipeline-head">
                <span className="clearos-pipeline-name">Cleared</span>
                <Badge variant="success">{overview ? `${clearedPct}%` : '—'}</Badge>
              </div>
              <div className="clearos-pipeline-num">{overview ? (overview.shipment_status?.CLEARED ?? 0) : '—'}</div>
              <div className="clearos-pipeline-bar-wrap">
                <div className="clearos-pipeline-bar" style={{ width: `${clearedPct}%`, background: 'var(--green, #10b981)' }} />
              </div>
              <span className="clearos-pipeline-stages-list">Delivered · empty return</span>
            </button>
          </div>

          {/* Breakdown Section 3: Commercial Top Accounts & Declarations Pace */}
          <div className="clearos-commercial-grid">
            {/* Top Accounts */}
            <div className="clearos-commercial-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="users" size={13} />
                  </FeaturedIcon>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    Top clients
                  </h4>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dataErrors.overview ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    Client data unavailable. Retry to refresh.
                  </div>
                ) : (overview?.top_customers || []).length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    No customer shipment volume recorded this month.
                  </div>
                ) : (
                  (overview?.top_customers || []).map((cust, idx) => (
                    <div key={idx} className="clearos-customer-row">
                      <div className="clearos-customer-info">
                        <span className="clearos-customer-name">{cust.name}</span>
                        <span className="clearos-customer-meta">
                          shipment{cust.shipments !== 1 ? 's' : ''} handled
                        </span>
                      </div>
                      <div className="clearos-customer-revenue">
                        {cust.shipments}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Today's Declarations Activity */}
            <div className="clearos-commercial-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FeaturedIcon variant="brand" size="sm" shape="square">
                    <Icon name="fileText" size={13} />
                  </FeaturedIcon>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    Declarations today
                  </h4>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/clearos/ops?declared=1')}>
                  Declarations <Icon name="arrowRight" size={12} />
                </Button>
              </div>

              <div className="clearos-decl-strip">
                <div className="clearos-decl-tile" style={{ borderColor: 'var(--blue, #3b82f6)' }}>
                  <span className="clearos-decl-tile-val" style={{ color: 'var(--blue, #3b82f6)' }}>
                    {overview ? (overview.declarations_today?.filed ?? 0) : '—'}
                  </span>
                  <span className="clearos-decl-tile-lbl">Filed Today</span>
                </div>
                <div className="clearos-decl-tile" style={{ borderColor: 'var(--green, #10b981)' }}>
                  <span className="clearos-decl-tile-val" style={{ color: 'var(--green, #10b981)' }}>
                    {overview ? (overview.declarations_today?.approved ?? 0) : '—'}
                  </span>
                  <span className="clearos-decl-tile-lbl">Approved</span>
                </div>
                <div className="clearos-decl-tile" style={{ borderColor: 'var(--amber, #f59e0b)' }}>
                  <span className="clearos-decl-tile-val" style={{ color: 'var(--amber, #f59e0b)' }}>
                    {overview ? (overview.declarations_today?.pending_review ?? 0) : '—'}
                  </span>
                  <span className="clearos-decl-tile-lbl">In Review</span>
                </div>
                <div className="clearos-decl-tile">
                  <span className="clearos-decl-tile-val" style={{ color: 'var(--ink3)' }}>
                    {overview ? (overview.declarations_today?.cancelled ?? 0) : '—'}
                  </span>
                  <span className="clearos-decl-tile-lbl">Cancelled</span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, marginTop: 'auto' }}>
                Declaration activity in this workspace. Ledger proofs are independently verifiable.
              </div>
            </div>
          </div>

          {/* Breakdown Section 4: Stage Cycle Times & Officer Performance Analytics */}
          <div className="clearos-section-header">
            <div className="clearos-section-title-wrap">
              <FeaturedIcon variant="brand" size="sm" shape="square">
                <Icon name="clock" size={15} />
              </FeaturedIcon>
              <div>
                <h3 className="clearos-section-title">Performance</h3>
                <p className="clearos-section-desc">Stage times, SLA breaches and team workload.</p>
              </div>
            </div>
          </div>

          <div className="clearos-dashboard__analytics" style={{ marginTop: 0 }}>
            {/* Stage Cycle Times */}
            <MetricSection
              title="Stage times"
              icon="clock"
              variant="error"
              onExport={exportBottlenecksCsv}
              expanded={bottlenecksOpen}
              onToggle={() => setBottlenecksOpen(o => !o)}
              statTiles={<>
                <StatTile label="Stage entries" value={dataErrors.bottlenecks ? '—' : String(totalCases)} />
                <StatTile label="Avg duration" value={dataErrors.bottlenecks ? '—' : totalCases > 0 ? `${weightedAvgHours.toFixed(1)}h` : '—'} />
                <StatTile label="SLA breaches" value={dataErrors.bottlenecks ? '—' : String(totalBreaches)} tone={totalBreaches > 0 ? 'red' : 'green'} />
                <StatTile label="Slowest stage" value={dataErrors.bottlenecks ? '—' : slowest ? slowest.stage_label : '—'} />
              </>}
              chart={bottlenecks.length > 0 ? (
                <StageCycleAreaChart rows={bottlenecks} onSelect={(row) => { setFocusStage(row.stage); setBottlenecksOpen(true); }} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: dataErrors.bottlenecks ? 'var(--red)' : 'var(--ink3)', fontSize: 13 }}>{dataErrors.bottlenecks ? 'Stage data unavailable. Retry to refresh.' : 'No stage history recorded yet.'}</div>
              )}
              table={
                <DataTable
                  rows={bottlenecks}
                  columns={bottleneckColumns}
                  rowKey={b => b.stage}
                  emptyMessage="No stage history recorded to analyze cycle times."
                  focusKey={focusStage}
                />
              }
            />

            {/* Officer Output */}
            <MetricSection
              title="Team workload"
              icon="checkCircle"
              variant="success"
              onExport={exportOfficersCsv}
              expanded={officersOpen}
              onToggle={() => setOfficersOpen(o => !o)}
              statTiles={<>
                <StatTile label="Active cases" value={dataErrors.officers ? '—' : String(totalActive)} />
                <StatTile label="Closed cases" value={dataErrors.officers ? '—' : String(totalClosed)} />
                <StatTile label="Top officer" value={dataErrors.officers ? '—' : topOfficer ? topOfficer.name.split(' ')[0] : '—'} />
                <StatTile label="Demurrage cases" value={dataErrors.officers ? '—' : String(totalPenalties)} tone={totalPenalties > 0 ? 'red' : 'green'} />
              </>}
              chart={officersSortedForChart.some(o => o.active_cases + o.cases_closed > 0) ? (
                <OfficerOutputDonut rows={officersSortedForChart} onSelect={(row) => { setFocusOfficer(row.user_id); setOfficersOpen(true); }} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  {dataErrors.officers ? 'Officer data unavailable. Retry to refresh.' : officers.length ? 'No cases are assigned to clearing officers yet.' : 'No active clearing officers found.'}
                </div>
              )}
              table={
                <DataTable
                  rows={officers}
                  columns={officerColumns}
                  rowKey={o => o.user_id}
                  emptyMessage="No active clearing officers found."
                  focusKey={focusOfficer}
                />
              }
            />
          </div>

          {/* Breakdown Section 5: Ledger Integrity Audit */}
          <LedgerIntegritySection />
        </div>
      </div>
    </div>
  );
};
