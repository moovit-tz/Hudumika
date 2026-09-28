import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
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
import type { StageBottleneck, OfficerPerformance, KPIResponse } from '@hudumika/types';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { showAlert } from '../lib/alert.js';
import './OperationalDashboards.css';
import './ClearOSDashboard.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function fmtTZS(n: number) { return 'TZS ' + Math.round(n).toLocaleString('en'); }

function StageCycleAreaChart({ rows, onSelect }: { rows: StageBottleneck[]; onSelect: (row: StageBottleneck) => void }) {
  const data = rows.map(row => ({ ...row, label: row.stage_label.length > 14 ? `${row.stage_label.slice(0, 13)}…` : row.stage_label }));
  return <div className="clearos-chart"><ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 12, left: -16, bottom: 42 }} onClick={(state: any) => {
      if (state?.activeTooltipIndex != null && data[state.activeTooltipIndex]) onSelect(data[state.activeTooltipIndex]);
    }}>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9.5, fill: 'var(--ink3)' }} interval={0} angle={-28} textAnchor="end" height={58} />
      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--ink3)' }} width={34} unit="h" />
      <RechartsTooltip formatter={(value) => [`${Number(value).toFixed(1)} hours`, 'Average duration']} labelFormatter={(_, payload) => payload?.[0]?.payload?.stage_label || ''} contentStyle={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'none', fontSize: 12 }} />
      <Area type="monotone" dataKey="avg_hours" stroke="var(--teal)" strokeWidth={2.5} fill="var(--teal-l)" activeDot={{ r: 5, cursor: 'pointer' }} />
    </AreaChart>
  </ResponsiveContainer></div>;
}

const OFFICER_CHART_COLORS = ['var(--teal)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--purple)', 'var(--red)'];

function OfficerOutputDonut({ rows, onSelect }: { rows: OfficerPerformance[]; onSelect: (row: OfficerPerformance) => void }) {
  const data = rows.filter(row => row.cases_closed > 0);
  const total = data.reduce((sum, row) => sum + row.cases_closed, 0);
  return <div className="clearos-donut-layout">
    <div className="clearos-donut"><ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={data} dataKey="cases_closed" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
        {data.map((row, index) => <Cell key={row.user_id} fill={OFFICER_CHART_COLORS[index % OFFICER_CHART_COLORS.length]} cursor="pointer" onClick={() => onSelect(row)} />)}
      </Pie>
      <RechartsTooltip contentStyle={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'none', fontSize: 12 }} />
    </PieChart></ResponsiveContainer><div className="clearos-donut__center"><strong>{total}</strong><span>closed</span></div></div>
    <div className="clearos-donut-legend">{data.slice(0, 6).map((row, index) => <button type="button" key={row.user_id} onClick={() => onSelect(row)}><span style={{ background: OFFICER_CHART_COLORS[index % OFFICER_CHART_COLORS.length] }} /><em>{row.name}</em><strong>{row.cases_closed}</strong></button>)}</div>
  </div>;
}

/* ── Collapsible section wrapper: stat tiles + clickable chart up top,
     full sortable/paginated table revealed on demand or via a bar click ── */
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
            {expanded ? 'Hide details' : 'View details'}
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
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Ledger Integrity</h2>
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
        Every declaration's tamper-evident history is periodically anchored to Bitcoin via OpenTimestamps, so its state at a point in time can be verified independently of Hudumika's own database.
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
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No anchors yet — click "Anchor Now" to create the first one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {anchors.map(a => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Badge variant={a.status === 'confirmed' ? 'success' : a.status === 'failed' ? 'error' : 'warning'}>
                    {a.status === 'confirmed' ? 'Confirmed' : a.status === 'failed' ? 'Failed' : 'Pending'}
                  </Badge>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.checkpointHash}>
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

/**
 * ClearOS management dashboard — the single, focused source of ops metrics.
 * Headline figures + a clickable chart lead each section; the full
 * sortable/paginated table is one click away (or jumped-to directly by
 * clicking a bar) rather than always-open with a duplicate totals row.
 */
export const ClearOSMetricsDashboard: React.FC = () => {
  const [bottlenecks, setBottlenecks] = useState<StageBottleneck[]>([]);
  const [officers, setOfficers] = useState<OfficerPerformance[]>([]);
  const [kpis, setKpis] = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [bottlenecksOpen, setBottlenecksOpen] = useState(false);
  const [officersOpen, setOfficersOpen] = useState(false);
  const [focusStage, setFocusStage] = useState<string | null>(null);
  const [focusOfficer, setFocusOfficer] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, oRes, kRes] = await Promise.all([
        apiFetch('/v1/analytics/bottlenecks'),
        apiFetch('/v1/analytics/officers'),
        apiFetch('/v1/analytics/kpi'),
      ]);
      setBottlenecks(bRes.data || []);
      setOfficers(oRes.data || []);
      setKpis(kRes);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load operations metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportBottlenecksCsv = () => exportCsv(
    'stage-cycle-times.csv',
    ['Stage', 'Cases', 'Avg Hours', 'P90 Hours', 'SLA Breaches'],
    bottlenecks.map(b => [b.stage_label, b.case_count, b.avg_hours, b.p90_hours, b.sla_breaches]),
  );
  const exportOfficersCsv = () => exportCsv(
    'officer-output.csv',
    ['Officer', 'Active Cases', 'Closed Cases', 'Avg Cycle Days', 'Demurrage Penalties'],
    officers.map(o => [o.name, o.active_cases, o.cases_closed, o.avg_days, o.penalties_caused]),
  );

  const slowest = bottlenecks.length > 0
    ? bottlenecks.reduce((m, b) => (b.avg_hours > m.avg_hours ? b : m), bottlenecks[0])
    : null;
  const totalCases = bottlenecks.reduce((s, b) => s + b.case_count, 0);
  const totalBreaches = bottlenecks.reduce((s, b) => s + b.sla_breaches, 0);
  const weightedAvgHours = totalCases > 0
    ? bottlenecks.reduce((s, b) => s + b.avg_hours * b.case_count, 0) / totalCases
    : 0;

  const topOfficer = officers.length > 0
    ? officers.reduce((m, o) => (o.cases_closed > m.cases_closed ? o : m), officers[0])
    : null;
  const totalActive = officers.reduce((s, o) => s + o.active_cases, 0);
  const totalClosed = officers.reduce((s, o) => s + o.cases_closed, 0);
  const totalPenalties = officers.reduce((s, o) => s + o.penalties_caused, 0);
  const avgClosed = officers.length > 0 ? Math.round(totalClosed / officers.length) : 0;

  // Bar chart data — sorted worst-first so the bottleneck / most-penalised are visually obvious
  const officersSortedForChart = [...officers].sort((a, b) => b.cases_closed - a.cases_closed);

  const bottleneckColumns: ColumnDef<StageBottleneck>[] = [
    { key: 'stage', label: 'Clearance Stage', sortValue: b => b.stage_label, render: b => <strong>{b.stage_label}</strong> },
    { key: 'cases', label: 'Cases', align: 'right', sortValue: b => b.case_count, render: b => `${b.case_count}` },
    {
      key: 'avg', label: 'Avg Duration', align: 'right', sortValue: b => b.avg_hours,
      render: b => <span style={{ color: b.avg_hours > 24 ? 'var(--red)' : 'var(--ink)', fontFamily: 'var(--mono)' }}>{b.avg_hours}h</span>,
    },
    { key: 'p90', label: 'P90 Duration', align: 'right', sortValue: b => b.p90_hours, render: b => <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{b.p90_hours}h</span> },
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
      render: o => <span style={{ fontFamily: 'var(--mono)' }}>{o.avg_days > 0 ? `${o.avg_days}d` : '—'}</span>,
    },
    {
      key: 'penalties', label: 'Demurrage Penalties', align: 'right', sortValue: o => o.penalties_caused,
      render: o => <span className={o.penalties_caused > 0 ? 'badge badge-red' : 'badge badge-green'}>{o.penalties_caused}</span>,
    },
  ];

  return (
    <div className="ops-dashboard clearos-dashboard" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <div className="clearos-dashboard__toolbar">
        <div style={{ width: 34, height: 34, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="barChart2" size={18} color="var(--teal)" strokeWidth={1.75} />
        </div>
        {/* A toolbar label, not a PageHeader. This component only ever renders
            inside ClearOSLanding, which already opens with "Clearance
            overview." -- a second PageHeader stacked a full page title (with
            its own crumbs and 43px title block) inside a 60px toolbar row, so
            the screen carried two titles and a large dead gap between them. */}
        <div className="clearos-dashboard__toolbar-copy">
          <div className="clearos-dashboard__toolbar-title">
            Operations metrics
          </div>
          <div className="clearos-dashboard__toolbar-meta">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </div>
        </div>
        <div className="clearos-dashboard__toolbar-spacer" />
        <Button size="sm" variant="outline" onClick={load} title="Refresh data" disabled={loading}>
          <Icon name="refresh" size={13} />
          Refresh
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="clearos-dashboard__content">
        {error && <Banner variant="error" className="mb-5">{error}</Banner>}

        {/* Tenant-wide command KPIs — deliberately distinct from the section stat tiles below
            (those cover stage-cycle-time and per-officer detail; this row covers volume,
            live risk exposure, and sustainability, none of which appear anywhere else). */}
        <MetricsRow cards={[
          {
            title: 'Monthly Volume',
            value: String(kpis?.cases_this_month ?? 0),
            sub1Label: 'DELIVERED TODAY', sub1Value: String(kpis?.delivered_today ?? 0),
            sub2Label: 'AVG / DAY',       sub2Value: kpis ? String(Math.round((kpis.cases_this_month || 0) / new Date().getDate())) : '—',
            icon: 'package',
            barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
            onMenuClick: load, menuTitle: 'Refresh volume data',
          },
          {
            title: 'On-Time Performance',
            // The API returns null until at least one case has closed. "—" is
            // the honest reading of no data; "100%" or "0%" would both be
            // claims the figures do not support.
            value: kpis?.on_time_rate_pct == null ? '—' : `${kpis.on_time_rate_pct}%`,
            sub1Label: 'AT RISK (48H)',      sub1Value: String(kpis?.demurrage_risk ?? 0),
            sub2Label: 'PENALTY EXPOSURE',   sub2Value: fmtTZS(kpis?.penalty_exposure_tzs ?? 0),
            icon: 'checkCircle',
            barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
            onMenuClick: load, menuTitle: 'Refresh SLA data',
          },
          {
            title: 'Carbon Footprint',
            value: `${(kpis?.total_co2_emissions_kg ?? 0).toLocaleString('en')} kg`,
            sub1Label: 'CREDITS SAVED', sub1Value: `${kpis?.total_carbon_credits_saved ?? 0}`,
            icon: 'globe',
            barColor: 'var(--green-l)', barHighlight: 'var(--green)',
            onMenuClick: load, menuTitle: 'Refresh emissions data',
          },
        ]} />

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: 'var(--ink3)' }}>
            Loading operational metrics…
          </div>
        ) : (
          <>
          <div className="clearos-dashboard__analytics">

            <MetricSection
              title="Clearance Stage Cycle Times"
              icon="clock"
              variant="error"
              onExport={exportBottlenecksCsv}
              expanded={bottlenecksOpen}
              onToggle={() => setBottlenecksOpen(o => !o)}
              statTiles={<>
                <StatTile label="Total Cases" value={String(totalCases)} />
                <StatTile label="Avg Duration" value={totalCases > 0 ? `${weightedAvgHours.toFixed(1)}h` : '—'} />
                <StatTile label="SLA Breaches" value={String(totalBreaches)} tone={totalBreaches > 0 ? 'red' : 'green'} />
                <StatTile label="Slowest Stage" value={slowest ? slowest.stage_label : '—'} />
              </>}
              chart={bottlenecks.length > 0 ? (
                <StageCycleAreaChart rows={bottlenecks} onSelect={(row) => { setFocusStage(row.stage); setBottlenecksOpen(true); }} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No stage history recorded yet.</div>
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

            <MetricSection
              title="Officer Output & Penalties"
              icon="checkCircle"
              variant="success"
              onExport={exportOfficersCsv}
              expanded={officersOpen}
              onToggle={() => setOfficersOpen(o => !o)}
              statTiles={<>
                <StatTile label="Active Cases" value={String(totalActive)} />
                <StatTile label="Closed Cases" value={String(totalClosed)} />
                <StatTile label="Top Officer" value={topOfficer ? topOfficer.name.split(' ')[0] : '—'} />
                <StatTile label="Total Penalties" value={String(totalPenalties)} tone={totalPenalties > 0 ? 'red' : 'green'} />
              </>}
              chart={officersSortedForChart.some(o => o.cases_closed > 0) ? (
                <OfficerOutputDonut rows={officersSortedForChart} onSelect={(row) => { setFocusOfficer(row.user_id); setOfficersOpen(true); }} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No active clearing officers found.</div>
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
          </>
        )}
        </div>
      </div>
    </div>
  );
};
