import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { useSupportMetrics, PeriodSwitcher, KpiCard, SHdr, StatRow } from './SupportOverviewShared.js';
import './SupportOverview.css';

export const SupportOverview: React.FC = () => {
  const isFullLayout = useFullLayout();
  const navigate = useNavigate();
  const { period, setPeriod, tickets, loading, metrics, metricsLoading } = useSupportMetrics();

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

  if (loading) {
    return <div className="sov-loading">Loading support overview…</div>;
  }

  return (
    <div className="sov-root">
      <div className="sov-container" style={isFullLayout ? { maxWidth: 'none' } : undefined}>

        <PageHeader
          crumbs={['Support', 'Overview']}
          titlePlain="Support"
          titleEm="overview"
          subtitle={`${total} total cases · ${urgent} urgent · ${resRate}% resolution rate`}
          actions={
            <div className="sov-actions">
              <PeriodSwitcher period={period} setPeriod={setPeriod} />
              <Button variant="outline" onClick={() => navigate('/bliss/overview/analytics')}>
                <Icon name="barChart" size={14} /> Analytics
              </Button>
              <Button variant="outline" onClick={() => navigate('/bliss/overview/team')}>
                <Icon name="users" size={14} /> Team
              </Button>
              <Link to="/bliss/tickets" className="sov-all-tickets-btn">
                <Icon name="message" size={14} strokeWidth={2} />
                All Tickets
              </Link>
            </div>
          }
        />

        <div className="sov-kpi-row">
          <KpiCard icon="clipboard"   label="Total Cases"  value={String(total)}    iconBg="var(--blue-l)"  color="#2563eb"       sub={`${period} period`} />
          <KpiCard icon="alertCircle" label="Open"         value={String(open)}     iconBg="var(--red-l)"   color="var(--red)"    sub={`${urgent} urgent`} />
          <KpiCard icon="clock"       label="In Progress"  value={String(inProg)}   iconBg="var(--gold-l)"  color="var(--gold)"   sub="Being worked on" />
          <KpiCard icon="checkCircle" label="Resolved"     value={String(resolved)} iconBg="var(--green-l)" color="var(--green)" />
          <KpiCard icon="x"           label="Closed"       value={String(closed)}   iconBg="var(--bg)"      color="var(--ink2)"   sub={`${resRate}% resolution rate`} />
        </div>

        <div className="sov-charts-row sov-charts-row--2">
          <div className="sov-card">
            <SHdr title="Daily Ticket Volume (last 14 days)" action="View tickets" to="/bliss/tickets" />
            {metricsLoading ? <div className="sov-empty">Loading…</div> : dayBars.length === 0 ? <div className="sov-empty">No data for this period.</div> : (
              <>
                <div className="sov-daybars">
                  {dayBars.map((v: number, i: number) => (
                    <div key={i} title={`${v} tickets`} className={`sov-daybar${i === dayBars.length - 1 ? ' sov-daybar--today' : ''}`}
                      style={{ height: `${Math.max(8, (v / dayMax) * 100)}%` }} />
                  ))}
                </div>
                <div className="sov-daybars-foot">
                  <span>14 days ago</span>
                  <span className="sov-daybars-today">Today ({dayBars[dayBars.length-1]})</span>
                </div>
                <div className="sov-daybars-stats">
                  {[
                    { label: 'Total period', val: dayBars.reduce((a, b) => a + b, 0) },
                    { label: 'Daily avg',    val: Math.round(dayBars.reduce((a, b) => a + b, 0) / 14) },
                    { label: 'Peak day',     val: Math.max(...dayBars) },
                    { label: 'Min day',      val: Math.min(...dayBars) },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="sov-daybars-stat-label">{s.label}</div>
                      <div className="sov-daybars-stat-val">{s.val}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sov-card">
            <SHdr title="Status Distribution" />
            <StatRow label="Open"        value={open}    pct={pct(open)}    color="var(--red)"   />
            <StatRow label="In Progress" value={inProg}  pct={pct(inProg)}  color="var(--gold)"  />
            <StatRow label="Resolved"    value={resolved} pct={pct(resolved)} color="var(--green)" />
            <StatRow label="Closed"      value={closed}  pct={pct(closed)}  color="var(--ink3)"  />
            <div className="sov-total-pill">
              <span>Total cases</span>
              <span className="sov-total-pill-val">{total}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
