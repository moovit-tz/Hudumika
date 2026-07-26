import React, { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { MetricsRow } from '../components/MetricCard.js';
import { exportCsv, ExportButton, StatTile, DataTable, ClickableBarChart } from '../components/AnalyticsKit.js';
import type { ColumnDef } from '../components/AnalyticsKit.js';
import type { StageBottleneck, OfficerPerformance, KPIResponse } from '@hudumika/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function fmtTZS(n: number) { return 'TZS ' + Math.round(n).toLocaleString('en'); }

/* ── Collapsible section wrapper: stat tiles + clickable chart up top,
     full sortable/paginated table revealed on demand or via a bar click ── */
function MetricSection({ title, icon, iconColor, onExport, statTiles, chart, table, expanded, onToggle }: {
  title: string;
  icon: IconName;
  iconColor: string;
  onExport: () => void;
  statTiles: React.ReactNode;
  chart: React.ReactNode;
  table: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${iconColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={14} color={iconColor} strokeWidth={1.75} />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{title}</h2>
        </div>
        <ExportButton onClick={onExport} />
      </div>

      <div className="card" style={{ marginBottom: expanded ? 12 : 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {statTiles}
        </div>
        {chart}
      </div>

      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--cts-accent, var(--teal))', fontSize: 12.5, fontWeight: 600, padding: '6px 0', marginBottom: expanded ? 12 : 0,
        }}
      >
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
        {expanded ? 'Hide detailed table' : 'View detailed table'}
      </button>

      {expanded && table}
    </div>
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
    bottlenecks.map(b => [b.stage.replace(/_/g, ' '), b.case_count, b.avg_hours, b.p90_hours, b.sla_breaches]),
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
  const bottlenecksSortedForChart = [...bottlenecks].sort((a, b) => b.avg_hours - a.avg_hours);
  const officersSortedForChart = [...officers].sort((a, b) => b.cases_closed - a.cases_closed);

  const bottleneckColumns: ColumnDef<StageBottleneck>[] = [
    { key: 'stage', label: 'Clearance Stage', sortValue: b => b.stage, render: b => <strong>{b.stage.replace(/_/g, ' ')}</strong> },
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--white)' }}>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '10px 24px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="barChart2" size={18} color="var(--teal)" strokeWidth={1.75} />
        </div>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>Operations Metrics</h1>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} title="Refresh data" disabled={loading}>
          <Icon name="refresh" size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ padding: 0 }}>
        {error && (
          <div style={{ padding: 16, background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 6, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Tenant-wide command KPIs — deliberately distinct from the section stat tiles below
            (those cover stage-cycle-time and per-officer detail; this row covers volume,
            live risk exposure, and sustainability, none of which appear anywhere else). */}
        <MetricsRow cards={[
          {
            title: 'Monthly Volume',
            value: String(kpis?.cases_this_month ?? 0),
            trend: 0,
            sub1Label: 'DELIVERED TODAY', sub1Value: String(kpis?.delivered_today ?? 0),
            sub2Label: 'AVG / DAY',       sub2Value: kpis ? String(Math.round((kpis.cases_this_month || 0) / new Date().getDate())) : '—',
            icon: 'package',
            barColor: 'var(--teal-l)', barHighlight: 'var(--teal)',
            onMenuClick: load, menuTitle: 'Refresh volume data',
          },
          {
            title: 'On-Time Performance',
            value: `${kpis?.on_time_rate_pct ?? 0}%`,
            trend: 0,
            sub1Label: 'AT RISK (48H)',      sub1Value: String(kpis?.demurrage_risk ?? 0),
            sub2Label: 'PENALTY EXPOSURE',   sub2Value: fmtTZS(kpis?.penalty_exposure_tzs ?? 0),
            icon: 'checkCircle',
            barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
            onMenuClick: load, menuTitle: 'Refresh SLA data',
          },
          {
            title: 'Carbon Footprint',
            value: `${(kpis?.total_co2_emissions_kg ?? 0).toLocaleString('en')} kg`,
            trend: 0,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 28 }}>

            <MetricSection
              title="Clearance Stage Cycle Times"
              icon="clock"
              iconColor="#dc2626"
              onExport={exportBottlenecksCsv}
              expanded={bottlenecksOpen}
              onToggle={() => setBottlenecksOpen(o => !o)}
              statTiles={<>
                <StatTile label="Total Cases" value={String(totalCases)} />
                <StatTile label="Avg Duration" value={totalCases > 0 ? `${weightedAvgHours.toFixed(1)}h` : '—'} />
                <StatTile label="SLA Breaches" value={String(totalBreaches)} tone={totalBreaches > 0 ? 'red' : 'green'} />
                <StatTile label="Slowest Stage" value={slowest ? slowest.stage.replace(/_/g, ' ') : '—'} />
              </>}
              chart={bottlenecksSortedForChart.length > 0 ? (
                <ClickableBarChart
                  labels={bottlenecksSortedForChart.map(b => b.stage.replace(/_/g, ' '))}
                  values={bottlenecksSortedForChart.map(b => b.avg_hours)}
                  barColors={bottlenecksSortedForChart.map(b => b.avg_hours > 24 ? 'rgba(220,38,38,.75)' : 'rgba(20,184,166,.75)')}
                  yLabel="Avg hours"
                  onBarClick={(idx) => { setFocusStage(bottlenecksSortedForChart[idx].stage); setBottlenecksOpen(true); }}
                />
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
              iconColor="#059669"
              onExport={exportOfficersCsv}
              expanded={officersOpen}
              onToggle={() => setOfficersOpen(o => !o)}
              statTiles={<>
                <StatTile label="Active Cases" value={String(totalActive)} />
                <StatTile label="Closed Cases" value={String(totalClosed)} />
                <StatTile label="Top Officer" value={topOfficer ? topOfficer.name.split(' ')[0] : '—'} />
                <StatTile label="Total Penalties" value={String(totalPenalties)} tone={totalPenalties > 0 ? 'red' : 'green'} />
              </>}
              chart={officersSortedForChart.length > 0 ? (
                <ClickableBarChart
                  labels={officersSortedForChart.map(o => o.name.split(' ')[0])}
                  values={officersSortedForChart.map(o => o.cases_closed)}
                  barColors={officersSortedForChart.map(o => o.penalties_caused > 0 ? 'rgba(220,38,38,.75)' : 'rgba(20,184,166,.75)')}
                  yLabel="Cases closed"
                  onBarClick={(idx) => { setFocusOfficer(officersSortedForChart[idx].user_id); setOfficersOpen(true); }}
                />
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
        )}
        </div>
      </div>
    </div>
  );
};
