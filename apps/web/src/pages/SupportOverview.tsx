import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { MetricsRow } from '../components/MetricCard.js';
import { useSupportMetrics, PeriodSwitcher, type Ticket } from './SupportOverviewShared.js';
import './SupportOverview.css';

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Bliss Support Operations Command Center & Executive Overview.
 * Unified telemetry for real-time customer support health, SLA compliance,
 * inbound velocity, and case queue lifecycle across all channels.
 */
export const SupportOverview: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod, tickets, loading, metrics, metricsLoading } = useSupportMetrics();

  // Active filter & search state for the live tickets queue table
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'URGENT' | 'RESOLVED'>('ALL');

  const total    = metrics ? metrics.total : tickets.length;
  const open     = metrics ? metrics.open       : tickets.filter(t => t.status === 'OPEN').length;
  const inProg   = metrics ? metrics.inProgress : tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolved = metrics ? metrics.resolved   : tickets.filter(t => t.status === 'RESOLVED').length;
  const closed   = metrics ? metrics.closed     : tickets.filter(t => t.status === 'CLOSED').length;
  const urgent   = metrics ? metrics.urgent     : tickets.filter(t => t.priority === 'URGENT').length;
  const resRate  = total ? Math.round(((resolved + closed) / total) * 100) : 0;
  const pct      = (n: number) => total ? Math.round((n / total) * 100) : 0;

  const dayBars: number[] = metrics?.dailyBars || [];
  const dayMax  = Math.max(...dayBars, 1);
  const daySum  = dayBars.reduce((a, b) => a + b, 0);
  const dayAvg  = dayBars.length ? Math.round(daySum / dayBars.length) : 0;
  const dayPeak = dayBars.length ? Math.max(...dayBars) : 0;
  const dayMin  = dayBars.length ? Math.min(...dayBars) : 0;

  // NPS & Satisfaction metrics
  const npsScore      = metrics ? metrics.nps.score : 0;
  const npsTotal      = metrics ? metrics.nps.total : 0;
  const npsPromoters  = metrics ? metrics.nps.promoters : 0;
  const npsPassives   = metrics ? metrics.nps.passives : 0;
  const npsDetractors = metrics ? metrics.nps.detractors : 0;

  const waiting    = metrics?.firstReply ?? 0;
  const solveTime  = metrics?.resolution ?? 0;
  const sla        = metrics?.sla ?? 0;
  const defect     = metrics?.defect ?? 0;
  const escalation = metrics?.escalation ?? 0;

  // Issue category breakdown
  const byCat = useMemo(() => {
    const counts = new Map<string, number>();
    tickets.forEach(t => {
      const cat = t.category || 'General';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [tickets]);
  const maxCat = Math.max(...byCat.map(c => c.count), 1);

  // Filtered tickets for the table
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter === 'OPEN' && t.status !== 'OPEN') return false;
      if (statusFilter === 'IN_PROGRESS' && t.status !== 'IN_PROGRESS') return false;
      if (statusFilter === 'RESOLVED' && t.status !== 'RESOLVED' && t.status !== 'CLOSED') return false;
      if (statusFilter === 'URGENT' && t.priority !== 'URGENT') return false;

      if (!tableSearch) return true;
      const q = tableSearch.toLowerCase();
      return (
        t.ref.toLowerCase().includes(q) ||
        t.customer.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.subject && t.subject.toLowerCase().includes(q))
      );
    });
  }, [tickets, statusFilter, tableSearch]);

  // Columns for the Live Tickets DataTable
  const tableColumns: TableColumn<Ticket>[] = [
    {
      key: 'ref',
      header: 'Reference',
      width: '120px',
      sortable: true,
      accessor: 'ref',
      render: t => (
        <span
          className="font-bold text-primary cursor-pointer hover:underline font-mono text-xs"
          onClick={() => navigate('/bliss/inbox')}
          title={`Open ticket #${t.ref}`}
        >
          #{t.ref}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      render: t => (
        <div className="flex items-center gap-2.5">
          <PersonAvatar name={t.customer} size={28} />
          <div>
            <div className="font-semibold text-foreground text-xs">{t.customer}</div>
            <div className="text-[11px] text-muted-foreground">{t.subject || 'Support ticket'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      hideAt: 'sm',
      render: t => (
        <Badge variant="gray">
          {t.category || 'General'}
        </Badge>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      width: '100px',
      render: t => (
        <Badge variant={t.priority === 'URGENT' ? 'error' : t.priority === 'HIGH' ? 'warning' : 'gray'}>
          {t.priority}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '120px',
      render: t => (
        <Badge variant={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'success' : t.status === 'IN_PROGRESS' ? 'info' : 'warning'}>
          {t.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'assigned_to',
      header: 'Assignee',
      hideAt: 'md',
      render: t => (
        t.assigned_to ? (
          <div className="flex items-center gap-2">
            <PersonAvatar userId={t.assigned_to} name={t.assignee_name || 'Agent'} size={24} />
            <span className="text-xs text-foreground font-medium">{t.assignee_name || 'Agent'}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">Unassigned</span>
        )
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      hideAt: 'md',
      align: 'right',
      render: t => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {timeAgo(t.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '90px',
      render: t => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/bliss/inbox')}
          title="Open in Inbox"
        >
          <Icon name="message" size={13} />
          View
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="sov-loading">
        <SectionLoading />
        <span>Loading support telemetry…</span>
      </div>
    );
  }

  return (
    <div className="sov-root">
      <div className="sov-container">

        {/* ── Page Header with House Style, Breadcrumbs & Action Suite ── */}
        <PageHeader
          crumbs={['Bliss', 'Overview']}
          titlePlain="Support"
          titleEm="operations"
          subtitle={
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span className="sov-status-pill">
                <span className="sov-pulse-dot" />
                Live Dispatch
              </span>
              <span>
                {total} total cases · {urgent} urgent escalations · {resRate}% resolution rate across all channels
              </span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSwitcher period={period} setPeriod={setPeriod} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/bliss/reports/agent-performance')}
                title="View individual agent resolution rates and CSAT"
              >
                <Icon name="award" size={14} />
                Performance
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/bliss/reports/sla-compliance')}
                title="Inspect SLA response and resolution compliance"
              >
                <Icon name="shield" size={14} />
                SLA
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/bliss/reports/traffic')}
                title="Analyze inbound traffic and channel velocity"
              >
                <Icon name="trendingUp" size={14} />
                Traffic
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/bliss/inbox')}
                className="bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Icon name="inbox" size={14} strokeWidth={2.2} />
                Support Inbox
                {open > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white/20">
                    {open}
                  </span>
                )}
              </Button>
            </div>
          }
        />

        {/* ── Executive Metric KPI Strip (Volume & Resolution Health) ── */}
        <MetricsRow cards={[
          {
            title: 'Total cases',
            value: String(total),
            icon: 'clipboard',
            bars: dayBars,
            comparisonLabel: `${period} reporting period`,
            emphasis: 'primary',
            onClick: () => navigate('/bliss/inbox'),
          },
          {
            title: 'Open workload',
            value: String(open),
            icon: 'alertCircle',
            barHighlight: 'var(--red)',
            sub1Label: 'URGENT CASES',
            sub1Value: String(urgent),
            onClick: () => { setStatusFilter('OPEN'); },
          },
          {
            title: 'In progress',
            value: String(inProg),
            icon: 'clock',
            barHighlight: 'var(--gold)',
            sub1Label: 'SHARE OF WORKLOAD',
            sub1Value: `${pct(inProg)}%`,
            onClick: () => { setStatusFilter('IN_PROGRESS'); },
          },
          {
            title: 'Resolved cases',
            value: String(resolved),
            icon: 'checkCircle',
            barHighlight: 'var(--green)',
            sub1Label: 'SHARE OF CASES',
            sub1Value: `${pct(resolved)}%`,
            onClick: () => { setStatusFilter('RESOLVED'); },
          },
          {
            title: 'Resolution rate',
            value: `${resRate}%`,
            icon: 'award',
            barHighlight: resRate >= 80 ? 'var(--green)' : 'var(--gold)',
            progress: resRate,
            progressLabel: 'Target benchmark > 85%',
            sub1Label: 'CLOSED & ARCHIVED',
            sub1Value: String(closed),
            emphasis: 'subtle',
          },
        ]} />

        {/* ── Operational Inflow & Pipeline Cadence (2-Col Grid) ── */}
        <div className="sov-charts-row sov-charts-row--2">
          {/* Card 1: Daily Inbound Volume (14-Day Trend) */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="brand" size="md" shape="square">
                  <Icon name="barChart2" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">
                    Daily Inbound Velocity
                    <Badge variant="brand">{daySum} cases</Badge>
                  </h3>
                  <div className="sov-shdr-subtitle">14-day case arrival distribution</div>
                </div>
              </div>
              <Link to="/bliss/reports/traffic" className="sov-shdr-action">
                Traffic Report <Icon name="arrowRight" size={12} />
              </Link>
            </div>

            {metricsLoading ? (
              <SectionLoading />
            ) : dayBars.length === 0 ? (
              <div className="sov-empty">No inbound tickets registered for this period.</div>
            ) : (
              <div className="sov-daybars-chart">
                <div className="sov-daybars">
                  {dayBars.map((v: number, i: number) => {
                    const isToday = i === dayBars.length - 1;
                    const isPeak = v === dayPeak && dayPeak > 0;
                    const heightPct = Math.max(10, Math.round((v / dayMax) * 100));
                    return (
                      <div key={i} className="sov-daybar-col">
                        <span className="sov-daybar-val">{v > 0 ? v : ''}</span>
                        <div
                          className={`sov-daybar${isToday ? ' sov-daybar--today' : ''}${isPeak ? ' sov-daybar--peak' : ''}`}
                          style={{ height: `${heightPct}%` }}
                          title={`Day ${14 - i} ago: ${v} tickets${isToday ? ' (Today)' : ''}${isPeak ? ' (Peak)' : ''}`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="sov-daybars-axis">
                  <span>14 days ago</span>
                  <span className="text-center text-xs font-semibold text-muted-foreground">
                    Peak: {dayPeak} tickets
                  </span>
                  <span className="sov-daybars-today-label">
                    <Icon name="clock" size={11} /> Today ({dayBars[dayBars.length - 1] ?? 0})
                  </span>
                </div>

                {/* 4-Stat Micro Strip */}
                <div className="sov-stat-strip">
                  <div className="sov-stat-strip-cell">
                    <span className="sov-stat-strip-label">Total Inflow</span>
                    <span className="sov-stat-strip-val">{daySum}</span>
                  </div>
                  <div className="sov-stat-strip-cell">
                    <span className="sov-stat-strip-label">Daily Average</span>
                    <span className="sov-stat-strip-val">{dayAvg}</span>
                  </div>
                  <div className="sov-stat-strip-cell">
                    <span className="sov-stat-strip-label">Peak Velocity</span>
                    <span className="sov-stat-strip-val" style={{ color: 'var(--teal)' }}>{dayPeak}</span>
                  </div>
                  <div className="sov-stat-strip-cell">
                    <span className="sov-stat-strip-label">Lowest Day</span>
                    <span className="sov-stat-strip-val" style={{ color: 'var(--ink3)' }}>{dayMin}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Support Pipeline & Status Funnel */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="info" size="md" shape="square">
                  <Icon name="pieChart" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">
                    Case Lifecycle & Pipeline
                    <Badge variant="gray">{total} Total</Badge>
                  </h3>
                  <div className="sov-shdr-subtitle">Workload distribution by stage</div>
                </div>
              </div>
              <Link to="/bliss/inbox" className="sov-shdr-action">
                View Queue <Icon name="arrowRight" size={12} />
              </Link>
            </div>

            {/* Visual Multi-Segment Proportional Track */}
            <div className="sov-funnel-track" title="Pipeline Status Breakdown">
              <div className="sov-funnel-segment" style={{ width: `${pct(open)}%`, background: 'var(--red)' }} title={`Open: ${open} (${pct(open)}%)`} />
              <div className="sov-funnel-segment" style={{ width: `${pct(inProg)}%`, background: 'var(--gold)' }} title={`In Progress: ${inProg} (${pct(inProg)}%)`} />
              <div className="sov-funnel-segment" style={{ width: `${pct(resolved)}%`, background: 'var(--green)' }} title={`Resolved: ${resolved} (${pct(resolved)}%)`} />
              <div className="sov-funnel-segment" style={{ width: `${pct(closed)}%`, background: 'var(--ink3)' }} title={`Closed: ${closed} (${pct(closed)}%)`} />
            </div>

            <div className="sov-status-list">
              {[
                { label: 'Open', count: open, pctVal: pct(open), color: 'var(--red)', badgeVar: 'error' as const, key: 'OPEN' as const },
                { label: 'In Progress', count: inProg, pctVal: pct(inProg), color: 'var(--gold)', badgeVar: 'warning' as const, key: 'IN_PROGRESS' as const },
                { label: 'Resolved', count: resolved, pctVal: pct(resolved), color: 'var(--green)', badgeVar: 'success' as const, key: 'RESOLVED' as const },
                { label: 'Closed & Archived', count: closed, pctVal: pct(closed), color: 'var(--ink3)', badgeVar: 'gray' as const, key: 'ALL' as const },
              ].map(st => (
                <div
                  key={st.label}
                  className="sov-status-row cursor-pointer"
                  onClick={() => setStatusFilter(st.key)}
                  title={`Filter queue by ${st.label}`}
                >
                  <div className="sov-status-row-top">
                    <div className="sov-status-left">
                      <Badge variant={st.badgeVar}>{st.label}</Badge>
                    </div>
                    <div className="sov-status-right">
                      <span className="sov-status-count" style={{ color: st.color }}>{st.count}</span>
                      <span className="sov-status-pct">({st.pctVal}%)</span>
                    </div>
                  </div>
                  <div className="sov-progress-track">
                    <div className="sov-progress-fill" style={{ background: st.color, width: `${st.pctVal}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Priority Mini Strip */}
            <div className="sov-priority-strip">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                Priority Breakdown:
              </span>
              <div className="flex items-center gap-2">
                <span className="sov-priority-item">
                  <Badge variant="error">Urgent: {urgent}</Badge>
                </span>
                <span className="sov-priority-item">
                  <Badge variant="warning">
                    High: {tickets.filter(t => t.priority === 'HIGH').length}
                  </Badge>
                </span>
                <span className="sov-priority-item">
                  <Badge variant="gray">
                    Standard: {tickets.filter(t => t.priority !== 'URGENT' && t.priority !== 'HIGH').length}
                  </Badge>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quality, CSAT & SLA Performance Strip ── */}
        <MetricsRow cards={[
          {
            title: 'NPS experience index',
            value: metrics ? `${metrics.nps.score > 0 ? '+' : ''}${metrics.nps.score}` : '—',
            icon: 'zap',
            loading: metricsLoading,
            barHighlight: npsScore >= 50 ? 'var(--green)' : npsScore >= 0 ? 'var(--gold)' : 'var(--red)',
            sub1Label: 'VERIFIED SURVEYS',
            sub1Value: String(npsTotal),
            emphasis: 'primary',
          },
          {
            title: 'Customer CSAT',
            value: metrics ? `${metrics.csat} / 5.0` : '—',
            icon: 'smile',
            barHighlight: 'var(--green)',
            loading: metricsLoading,
            progress: metrics ? Math.round((metrics.csat / 5) * 100) : undefined,
            progressLabel: 'Customer satisfaction rating',
          },
          {
            title: 'Average first reply',
            value: metrics ? `${metrics.firstReply}h` : '—',
            icon: 'clock',
            barHighlight: waiting <= 2 ? 'var(--teal)' : 'var(--gold)',
            loading: metricsLoading,
            progress: metrics ? Math.min(100, Math.round((2 / Math.max(metrics.firstReply, 0.01)) * 100)) : undefined,
            progressLabel: 'Against < 2.0h target benchmark',
          },
          {
            title: 'Average solve time',
            value: metrics ? `${metrics.resolution}h` : '—',
            icon: 'timer',
            barHighlight: solveTime <= 8 ? 'var(--teal)' : 'var(--gold)',
            loading: metricsLoading,
            progress: metrics ? Math.min(100, Math.round((8 / Math.max(metrics.resolution, 0.01)) * 100)) : undefined,
            progressLabel: 'Against < 8.0h resolution target',
          },
          {
            title: 'SLA compliance rate',
            value: metrics ? `${metrics.sla}%` : '—',
            icon: 'shield',
            barHighlight: sla >= 90 ? 'var(--green)' : 'var(--red)',
            loading: metricsLoading,
            progress: metrics?.sla,
            progressLabel: 'Contracted SLA compliance',
            emphasis: 'subtle',
          },
        ]} />

        {/* ── HuduBI Metric Intelligence Banner ── */}
        <div className="sov-hudubi-banner">
          <div className="sov-hudubi-left">
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="zap" size={17} />
            </FeaturedIcon>
            <div>
              <div className="sov-hudubi-title">
                HuduBI Unified Support Intelligence
                <span className="sov-hudubi-chips">
                  <span className="sov-hudubi-chip">bliss.csat</span>
                  <span className="sov-hudubi-chip">bliss.sla_compliance</span>
                  <span className="sov-hudubi-chip">bliss.first_reply</span>
                  <span className="sov-hudubi-chip">bliss.defect_rate</span>
                </span>
              </div>
              <div className="sov-hudubi-desc">
                Bliss support telemetry syncs in real time with the platform Metric Registry for cross-app analytics, executive scorecards, and customer retention forecasts.
              </div>
            </div>
          </div>
          <Link to="/hudubi/metrics?app=bliss">
            <Button variant="outline" size="sm" className="bg-white/80 dark:bg-card">
              Explore in HuduBI <Icon name="arrowRight" size={13} />
            </Button>
          </Link>
        </div>

        {/* ── Diagnostics Grid (3-Col: NPS, Categories, Quality Targets) ── */}
        <div className="sov-charts-row sov-charts-row--3">
          {/* Card 1: Net Promoter Score Details */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="warning" size="md" shape="square">
                  <Icon name="award" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">NPS Sentiment Index</h3>
                  <div className="sov-shdr-subtitle">Advocacy & customer promoter ratio</div>
                </div>
              </div>
            </div>

            <div className="sov-nps-hero">
              <div className="sov-nps-score-box">
                <span
                  className="sov-nps-big-score"
                  style={{ color: npsScore >= 50 ? 'var(--green)' : npsScore >= 20 ? 'var(--gold)' : 'var(--red)' }}
                >
                  {npsScore > 0 ? '+' : ''}{npsScore}
                </span>
                <span className="sov-nps-surveys-badge">{npsTotal} surveys</span>
              </div>
              <Badge variant={npsScore >= 70 ? 'success' : npsScore >= 50 ? 'brand' : npsScore >= 0 ? 'warning' : 'error'}>
                {npsTotal === 0 ? 'No data' : npsScore >= 70 ? 'World Class' : npsScore >= 50 ? 'Strong' : npsScore >= 0 ? 'Neutral' : 'Needs Focus'}
              </Badge>
            </div>

            {/* Tri-color segmented progress bar */}
            <div className="sov-nps-multi-bar">
              <div style={{ width: `${npsDetractors}%`, background: 'var(--red)' }} title={`Detractors: ${npsDetractors}%`} />
              <div style={{ width: `${npsPassives}%`, background: 'var(--gold)' }} title={`Passives: ${npsPassives}%`} />
              <div style={{ width: `${npsPromoters}%`, background: 'var(--green)' }} title={`Promoters: ${npsPromoters}%`} />
            </div>

            <div className="sov-nps-rows">
              {[
                { label: 'Promoters', pct: npsPromoters, color: 'var(--green)', note: 'Score 9–10 (Advocates)' },
                { label: 'Passives', pct: npsPassives, color: 'var(--gold)', note: 'Score 7–8 (Neutral)' },
                { label: 'Detractors', pct: npsDetractors, color: 'var(--red)', note: 'Score 0–6 (At Risk)' },
              ].map(row => (
                <div key={row.label} className="sov-nps-item">
                  <div className="sov-nps-item-hdr">
                    <span>
                      {row.label} <span className="text-[11px] text-muted-foreground">· {row.note}</span>
                    </span>
                    <span className="sov-nps-item-pct" style={{ color: row.color }}>
                      {row.pct}%
                    </span>
                  </div>
                  <div className="sov-progress-track">
                    <div className="sov-progress-fill" style={{ background: row.color, width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Contact Drivers (By Category) */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="brand" size="md" shape="square">
                  <Icon name="tag" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">Contact Drivers</h3>
                  <div className="sov-shdr-subtitle">Top issue categories by volume</div>
                </div>
              </div>
            </div>

            {byCat.length === 0 ? (
              <div className="sov-empty">No categorized cases recorded.</div>
            ) : (
              <div className="sov-cat-list">
                {byCat.slice(0, 6).map(c => {
                  const sharePct = Math.round((c.count / maxCat) * 100);
                  const totalShare = pct(c.count);
                  return (
                    <div key={c.label} className="sov-cat-item">
                      <div className="sov-cat-top">
                        <span className="sov-cat-name">{c.label}</span>
                        <span className="sov-cat-val">
                          {c.count} <span className="text-[11px] font-normal text-muted-foreground">({totalShare}%)</span>
                        </span>
                      </div>
                      <div className="sov-progress-track">
                        <div
                          className="sov-progress-fill"
                          style={{
                            background: 'var(--teal)',
                            width: `${sharePct}%`,
                            opacity: 0.55 + (sharePct / 100) * 0.45,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: SLA & Target Safeguards */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="success" size="md" shape="square">
                  <Icon name="shield" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">SLA Quality Safeguards</h3>
                  <div className="sov-shdr-subtitle">Service level benchmarks vs actuals</div>
                </div>
              </div>
            </div>

            <div className="sov-target-list">
              {[
                { label: 'Avg Waiting Time', value: `${waiting}h`, note: 'Before first staff reply', color: 'var(--teal)', target: '< 2.0h', ok: waiting <= 2 },
                { label: 'Avg Solving Time', value: `${solveTime}h`, note: 'Inception to resolution', color: 'var(--blue)', target: '< 8.0h', ok: solveTime <= 8 },
                { label: 'Contracted SLA', value: `${sla}%`, note: 'Cases resolved in SLA', color: 'var(--green)', target: '> 90%', ok: sla >= 90 },
                { label: 'Defect Reopen Rate', value: `${defect}%`, note: 'Reopened cases', color: 'var(--red)', target: '< 3.0%', ok: defect <= 3 },
                { label: 'Escalation Rate', value: `${escalation}%`, note: 'Escalated to management', color: 'var(--gold)', target: '< 5.0%', ok: escalation <= 5 },
              ].map(m => (
                <div key={m.label} className="sov-target-row">
                  <div className="sov-target-left">
                    <span className="sov-target-title">{m.label}</span>
                    <span className="sov-target-sub">{m.note} · Target {m.target}</span>
                  </div>
                  <div className="sov-target-right">
                    <span className="sov-target-val" style={{ color: m.color }}>{m.value}</span>
                    <Badge variant={m.ok ? 'success' : 'error'}>
                      {m.ok ? 'Within Target' : 'Action Needed'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Response Velocity Histogram & Tags (2-Col Grid) ── */}
        <div className="sov-charts-row sov-charts-row--equal-2">
          {/* Card 1: Response Velocity Histogram */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="brand" size="md" shape="square">
                  <Icon name="clock" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">First Agent Reply Distribution</h3>
                  <div className="sov-shdr-subtitle">Turnaround time from customer submission</div>
                </div>
              </div>
            </div>

            {(() => {
              const buckets = [
                { key: '0-1', label: '< 1 hour', sub: 'Instant', cls: 'sov-hist-bar--fast' },
                { key: '1-8', label: '1–8 hours', sub: 'Same Day', cls: 'sov-hist-bar--mid' },
                { key: '8-24', label: '8–24 hours', sub: 'Next Day', cls: 'sov-hist-bar--slow' },
                { key: '>24', label: '> 24 hours', sub: 'Overdue Risk', cls: 'sov-hist-bar--overdue' },
              ];
              const hist = metrics?.firstReplyHistogram || { '0-1': 0, '1-8': 0, '8-24': 0, '>24': 0 };
              const histMax = Math.max(...buckets.map(b => hist[b.key] || 0), 1);
              return (
                <div className="sov-hist-container">
                  {buckets.map(b => {
                    const count = hist[b.key] || 0;
                    const heightPct = Math.max(6, Math.round((count / histMax) * 100));
                    return (
                      <div key={b.key} className="sov-hist-col">
                        <span className="sov-hist-val">{count}</span>
                        <div className="sov-hist-bar-track">
                          <div
                            className={`sov-hist-bar ${b.cls}`}
                            style={{ height: `${heightPct}%` }}
                            title={`${b.label}: ${count} replies`}
                          />
                        </div>
                        <span className="sov-hist-label">{b.label}</span>
                        <span className="text-[10px] text-muted-foreground">{b.sub}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Card 2: Trending Topic Tags */}
          <div className="sov-card">
            <div className="sov-shdr">
              <div className="sov-shdr-left">
                <FeaturedIcon variant="info" size="md" shape="square">
                  <Icon name="hash" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">Trending Issue Tags</h3>
                  <div className="sov-shdr-subtitle">Key topics and customer intent keywords</div>
                </div>
              </div>
            </div>

            {(() => {
              const tags: { tag: string; count: number }[] = metrics?.tagBreakdown || [];
              if (tags.length === 0) {
                return <div className="sov-empty">No tagged conversations recorded in this period.</div>;
              }
              return (
                <div className="sov-tag-cloud">
                  {tags.map(t => (
                    <span key={t.tag} className="sov-tag-pill" title={`${t.count} conversations`}>
                      <Icon name="tag" size={12} className="text-muted-foreground" />
                      #{t.tag}
                      <span className="sov-tag-count">{t.count}</span>
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Omnichannel Activity Heatmap (Full-Width Card) ── */}
        <div className="sov-card">
          <div className="sov-shdr">
            <div className="sov-shdr-left">
              <FeaturedIcon variant="brand" size="md" shape="square">
                <Icon name="calendar" size={16} />
              </FeaturedIcon>
              <div>
                <h3 className="sov-shdr-title">Omnichannel Peak Traffic Matrix</h3>
                <div className="sov-shdr-subtitle">Hourly case arrival frequency by day of week</div>
              </div>
            </div>
            <div className="sov-heatmap-legend">
              <span>Less active</span>
              <div className="sov-heatmap-scale-bar">
                <span className="sov-heatmap-scale-step" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
                <span className="sov-heatmap-scale-step" style={{ background: 'color-mix(in srgb, var(--teal) 35%, var(--white))' }} />
                <span className="sov-heatmap-scale-step" style={{ background: 'color-mix(in srgb, var(--teal) 65%, var(--white))' }} />
                <span className="sov-heatmap-scale-step" style={{ background: 'var(--teal)' }} />
              </div>
              <span>Peak volume</span>
            </div>
          </div>

          {(() => {
            const cells: { day: string; bucket: string; count: number }[] = metrics?.busiestHeatmap || [];
            if (cells.length === 0) {
              return <div className="sov-empty">No telemetry data recorded for this period.</div>;
            }
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const buckets = Array.from(new Set(cells.map(c => c.bucket)));
            const cellMax = Math.max(...cells.map(c => c.count), 1);
            const lookup = new Map(cells.map(c => [`${c.day}|${c.bucket}`, c.count]));

            return (
              <div className="sov-heatmap-wrap">
                <div
                  className="sov-heatmap-grid"
                  style={{ gridTemplateColumns: `50px repeat(${buckets.length}, 1fr)` }}
                >
                  <div />
                  {buckets.map(b => (
                    <div key={b} className="sov-heatmap-hdr-bucket">{b}h</div>
                  ))}
                  {days.map(day => (
                    <React.Fragment key={day}>
                      <div className="sov-heatmap-row-day">{day}</div>
                      {buckets.map(b => {
                        const count = lookup.get(`${day}|${b}`) || 0;
                        const intensity = count / cellMax;
                        return (
                          <div
                            key={b}
                            title={`${day} @ ${b}h: ${count} ticket${count === 1 ? '' : 's'}`}
                            className="sov-heatmap-cell"
                            style={{
                              background:
                                count === 0
                                  ? 'var(--bg)'
                                  : `color-mix(in srgb, var(--teal) ${Math.round(20 + intensity * 80)}%, var(--white))`,
                            }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Live Support Queue Table with Search & Filter Tabs ── */}
        <div className="sov-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
              <div className="flex items-center gap-3">
                <FeaturedIcon variant="brand" size="md" shape="square">
                  <Icon name="inbox" size={16} />
                </FeaturedIcon>
                <div>
                  <h3 className="sov-shdr-title">
                    Active Support Queue
                    <Badge variant="brand">{filteredTickets.length}</Badge>
                  </h3>
                  <div className="sov-shdr-subtitle">Recent cases across email, WhatsApp, and in-app channels</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/bliss/inbox')}
                >
                  <Icon name="externalLink" size={13} />
                  Open Inbox Full View
                </Button>
              </div>
            </div>

            {/* Status Quick Filter Pills */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: 'ALL' as const, label: 'All Cases', count: tickets.length },
                  { key: 'OPEN' as const, label: 'Open', count: open, badgeVar: 'error' as const },
                  { key: 'IN_PROGRESS' as const, label: 'In Progress', count: inProg, badgeVar: 'warning' as const },
                  { key: 'URGENT' as const, label: 'Urgent', count: urgent, badgeVar: 'error' as const },
                  { key: 'RESOLVED' as const, label: 'Resolved', count: resolved + closed, badgeVar: 'success' as const },
                ].map(tab => {
                  const isActive = statusFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-(--radius) transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/25 text-white' : 'bg-background text-foreground'}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Toolbar */}
              <div className="w-full sm:w-72">
                <SearchToolbar
                  search={tableSearch}
                  onSearch={setTableSearch}
                  placeholder="Search queue by reference or customer…"
                />
              </div>
            </div>
          </div>

          <DataTable
            columns={tableColumns}
            rows={filteredTickets}
            loading={loading}
            pageSize={8}
            defaultSortKey="created_at"
            defaultSortDir="desc"
            emptyIcon="inbox"
            emptyTitle="No support cases found"
            emptyMessage={
              tableSearch
                ? `No support cases match the search query "${tableSearch}".`
                : statusFilter !== 'ALL'
                ? `No support cases in the ${statusFilter} state.`
                : 'No support tickets have been logged for this workspace.'
            }
          />
        </div>

      </div>
    </div>
  );
};
