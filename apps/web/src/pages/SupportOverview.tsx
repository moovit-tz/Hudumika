import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { useSupportMetrics, PeriodSwitcher, KpiCard, SHdr, StatRow } from './SupportOverviewShared.js';
import './SupportOverview.css';

/**
 * Merged with the page that used to live at /bliss/overview/analytics
 * (SupportAnalytics.tsx, now deleted) — both read the exact same
 * useSupportMetrics() hook and rendered the same KPI-card/section-header
 * look as two separate page loads for what is really one dashboard: this
 * page's own volume/status KPIs measure different things than Analytics'
 * satisfaction/quality ones (nothing here was actually redundant), but
 * showing them as two clicks apart read as the same page twice. Now one.
 */
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

  // Recent open/urgent tickets for quick action table
  const recentTickets = tickets.slice(0, 5);

  // ── From the former Analytics page ──
  const byCat = Array.from(new Set(tickets.map(t => t.category || 'Uncategorized')))
    .map(cat => ({ label: cat, count: tickets.filter(t => (t.category || 'Uncategorized') === cat).length }))
    .sort((a, b) => b.count - a.count);
  const maxCat = Math.max(...byCat.map(c => c.count), 1);

  const npsScore = metrics ? metrics.nps.score : 0;
  const npsTotal = metrics ? metrics.nps.total : 0;
  const npsPromoters = metrics ? metrics.nps.promoters : 0;
  const npsPassives = metrics ? metrics.nps.passives : 0;
  const npsDetractors = metrics ? metrics.nps.detractors : 0;

  const waiting = metrics?.firstReply ?? 0;
  const solveTime = metrics?.resolution ?? 0;
  const sla = metrics?.sla ?? 0;
  const defect = metrics?.defect ?? 0;
  const escalation = metrics?.escalation ?? 0;

  if (loading) {
    return <div className="sov-loading">Loading support overview…</div>;
  }

  return (
    <div className="sov-root">
      <div className="sov-container" style={isFullLayout ? { maxWidth: 'none' } : undefined}>

        <PageHeader
          crumbs={['Bliss', 'Support']}
          titlePlain="Support"
          titleEm="overview"
          subtitle={`${total} total cases · ${urgent} urgent · ${resRate}% resolution rate`}
          actions={
            <div className="sov-actions">
              <PeriodSwitcher period={period} setPeriod={setPeriod} />
              <Button variant="outline" size="sm" onClick={() => navigate('/bliss/overview/team')}>
                <Icon name="users" size={14} /> Team
              </Button>
              <Link to="/bliss/inbox" className="sov-all-tickets-btn">
                <Icon name="message" size={14} strokeWidth={2} />
                All Tickets
              </Link>
            </div>
          }
        />

        <div className="sov-kpi-row">
          <KpiCard icon="clipboard"   label="Total Cases"  value={String(total)}    iconBg="var(--blue-l)"  color="var(--blue)"   sub={`${period} period`} />
          <KpiCard icon="alertCircle" label="Open"         value={String(open)}     iconBg="var(--red-l)"   color="var(--red)"    sub={`${urgent} urgent`} />
          <KpiCard icon="clock"       label="In Progress"  value={String(inProg)}   iconBg="var(--gold-l)"  color="var(--gold)"   sub="Being worked on" />
          <KpiCard icon="checkCircle" label="Resolved"     value={String(resolved)} iconBg="var(--green-l)" color="var(--green)" />
          <KpiCard icon="x"           label="Closed"       value={String(closed)}   iconBg="var(--bg)"      color="var(--ink2)"   sub={`${resRate}% resolution rate`} />
        </div>

        <div className="sov-charts-row sov-charts-row--2">
          <div className="sov-card">
            <SHdr title="Daily Ticket Volume (last 14 days)" action="View tickets" to="/bliss/inbox" />
            {metricsLoading ? <SectionLoading /> : dayBars.length === 0 ? <div className="sov-empty">No data for this period.</div> : (
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

        {/* ── Satisfaction / quality — formerly a separate Analytics page ── */}
        <div className="sov-kpi-row">
          <KpiCard icon="zap"         label="NPS Score"       value={metrics ? `${metrics.nps.score > 0 ? '+' : ''}${metrics.nps.score}` : '—'} iconBg="var(--teal-l)"  color="var(--teal)"   sub={`${npsTotal} responses`} />
          <KpiCard icon="smile"       label="CSAT Score"      value={metrics ? `${metrics.csat}/5` : '—'}       iconBg="var(--green-l)" color="var(--green)"  sub="Customer satisfaction" />
          <KpiCard icon="clock"       label="Avg First Reply" value={metrics ? `${metrics.firstReply}h` : '—'}  iconBg="var(--blue-l)"  color="var(--blue)"   sub="Target: <2h" />
          <KpiCard icon="timer"       label="Avg Solve Time"  value={metrics ? `${metrics.resolution}h` : '—'}  iconBg="var(--gold-l)"  color="var(--gold)"   sub="Target: <8h" />
          <KpiCard icon="tasks"       label="SLA Compliance"  value={metrics ? `${metrics.sla}%` : '—'}         iconBg="var(--green-l)" color="var(--green)" />
          <KpiCard icon="warning"     label="Defect Rate"     value={metrics ? `${metrics.defect}%` : '—'}      iconBg="var(--red-l)"   color="var(--red)"    sub="Reopened / escalated" />
        </div>

        <div className="sov-charts-row sov-charts-row--3">
          <div className="sov-card">
            <SHdr title="Net Promoter Score" />
            <div className="sov-nps-row">
              <div className="sov-nps-score-col">
                <div className="sov-nps-score" style={{ color: npsScore >= 50 ? 'var(--green)' : npsScore >= 20 ? 'var(--gold)' : 'var(--red)' }}>
                  {npsScore > 0 ? '+' : ''}{npsScore}
                </div>
                <div className="sov-nps-total">{npsTotal} surveys</div>
                <div className="sov-nps-band" style={{ color: npsScore >= 50 ? 'var(--green)' : 'var(--gold)' }}>
                  {npsTotal === 0 ? 'No data' : npsScore >= 70 ? 'Excellent' : npsScore >= 50 ? 'Good' : npsScore >= 0 ? 'Neutral' : 'Poor'}
                </div>
              </div>
              <div className="sov-nps-breakdown">
                {[
                  { label: 'Promoters',  pct: npsPromoters,  color: 'var(--green)', note: '9–10' },
                  { label: 'Passives',   pct: npsPassives,   color: 'var(--gold)',  note: '7–8'  },
                  { label: 'Detractors', pct: npsDetractors, color: 'var(--red)',   note: '0–6'  },
                ].map(row => (
                  <div key={row.label} className="sov-nps-bar-row">
                    <div className="sov-nps-bar-top">
                      <span>{row.label} <span className="sov-nps-bar-note">({row.note})</span></span>
                      <span style={{ color: row.color, fontWeight: 700 }}>{row.pct}%</span>
                    </div>
                    <div className="sov-bar-track sov-bar-track--sm"><div className="sov-bar-fill" style={{ background: row.color, width: `${row.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sov-nps-segbar">
              <div style={{ width: `${npsDetractors}%`, background: 'var(--red)' }} />
              <div style={{ width: `${npsPassives}%`,   background: 'var(--gold)' }} />
              <div style={{ width: `${npsPromoters}%`,  background: 'var(--green)' }} />
            </div>
          </div>

          <div className="sov-card">
            <SHdr title="By Issue Category" />
            {byCat.length === 0 ? <div className="sov-empty">No tickets in this period.</div> : (
              <div className="sov-cat-list">
                {byCat.map(c => (
                  <div key={c.label}>
                    <div className="sov-cat-row">
                      <span className="sov-cat-label">{c.label}</span>
                      <span className="sov-cat-count">{c.count}</span>
                    </div>
                    <div className="sov-bar-track sov-bar-track--sm">
                      <div className="sov-bar-fill" style={{ background: 'var(--teal)', width: `${(c.count/maxCat)*100}%`, opacity: 0.5 + (c.count/maxCat)*0.5 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sov-card">
            <SHdr title="Time & Quality" />
            {[
              { label: 'Avg Waiting Time', value: `${waiting}h`,    note: 'Before first reply', color: 'var(--blue)',  target: '< 2h',  ok: waiting <= 2  },
              { label: 'Avg Solving Time', value: `${solveTime}h`,  note: 'Open → resolved',    color: 'var(--teal)',  target: '< 8h',  ok: solveTime <= 8 },
              { label: 'SLA Compliance',   value: `${sla}%`,        note: 'Within agreed SLA',  color: 'var(--green)', target: '> 90%', ok: sla >= 90    },
              { label: 'Defect Rate',      value: `${defect}%`,     note: 'Reopened / escalated', color: 'var(--red)', target: '< 3%',  ok: defect <= 3   },
              { label: 'Escalation Rate',  value: `${escalation}%`, note: 'Sent to senior / mgmt', color: 'var(--gold)', target: '< 5%', ok: escalation <= 5 },
            ].map(m => (
              <div key={m.label} className="sov-tq-row">
                <div>
                  <div className="sov-tq-label">{m.label}</div>
                  <div className="sov-tq-note">{m.note} · Target {m.target}</div>
                </div>
                <div className="sov-tq-value">
                  <span style={{ color: m.color }}>{m.value}</span>
                  <Icon name={m.ok ? 'checkCircle' : 'alertCircle'} size={13} strokeWidth={2} style={{ color: m.ok ? 'var(--green)' : 'var(--red)' } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sov-charts-row sov-charts-row--2">
          <div className="sov-card">
            <SHdr title="Hours Until First Agent Reply" />
            {(() => {
              const buckets = [{ key: '0-1', label: '0–1h' }, { key: '1-8', label: '1–8h' }, { key: '8-24', label: '8–24h' }, { key: '>24', label: '>24h' }];
              const hist = metrics?.firstReplyHistogram || { '0-1': 0, '1-8': 0, '8-24': 0, '>24': 0 };
              const histMax = Math.max(...buckets.map(b => hist[b.key] || 0), 1);
              return (
                <div className="sov-hist">
                  {buckets.map(b => {
                    const v = hist[b.key] || 0;
                    const isFast = b.key === '0-1' || b.key === '1-8';
                    return (
                      <div key={b.key} className="sov-hist-col">
                        <div className="sov-hist-val">{v}</div>
                        <div className="sov-hist-bar-wrap">
                          <div className={`sov-hist-bar${isFast ? ' sov-hist-bar--fast' : ' sov-hist-bar--slow'}`} style={{ height: `${Math.max(4, (v / histMax) * 100)}%` }} />
                        </div>
                        <div className="sov-hist-label">{b.label}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="sov-card">
            <SHdr title="Conversations by Tag" />
            {(() => {
              const tags: { tag: string; count: number }[] = metrics?.tagBreakdown || [];
              const tagMax = Math.max(...tags.map(t => t.count), 1);
              if (tags.length === 0) return <div className="sov-empty">No tagged conversations in this period.</div>;
              return (
                <div className="sov-cat-list">
                  {tags.map(t => (
                    <div key={t.tag}>
                      <div className="sov-cat-row">
                        <span className="sov-cat-label">{t.tag}</span>
                        <span className="sov-cat-count">{t.count}</span>
                      </div>
                      <div className="sov-bar-track sov-bar-track--sm">
                        <div className="sov-bar-fill" style={{ background: 'var(--gold)', width: `${(t.count / tagMax) * 100}%`, opacity: 0.5 + (t.count / tagMax) * 0.5 }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="sov-card sov-heatmap-card">
          <SHdr title="Busiest Time of Day" />
          {(() => {
            const cells: { day: string; bucket: string; count: number }[] = metrics?.busiestHeatmap || [];
            if (cells.length === 0) return <div className="sov-empty">No data for this period.</div>;
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const buckets = Array.from(new Set(cells.map(c => c.bucket)));
            const cellMax = Math.max(...cells.map(c => c.count), 1);
            const lookup = new Map(cells.map(c => [`${c.day}|${c.bucket}`, c.count]));
            return (
              <div className="sov-heatmap-scroll">
                <div className="sov-heatmap-grid" style={{ gridTemplateColumns: `44px repeat(${buckets.length}, 1fr)` }}>
                  <div />
                  {buckets.map(b => <div key={b} className="sov-heatmap-bucket">{b}</div>)}
                  {days.map(day => (
                    <React.Fragment key={day}>
                      <div className="sov-heatmap-day">{day}</div>
                      {buckets.map(b => {
                        const v = lookup.get(`${day}|${b}`) || 0;
                        const intensity = v / cellMax;
                        return (
                          <div key={b} title={`${day} ${b}h — ${v} tickets`} className="sov-heatmap-cell"
                            style={{ background: intensity === 0 ? 'var(--bg)' : `color-mix(in srgb, var(--teal) ${Math.round(20 + intensity * 80)}%, var(--white))` }} />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Recent Open & Active Tickets Table */}
        <SectionCard padded={false} title={`Recent Support Tickets (${tickets.length})`}>
          {tickets.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No active support tickets.</div>
          ) : (
            <div className="rtbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    {['Reference', 'Customer', 'Category', 'Priority', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>#{t.ref}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar name={t.customer} size={22} />
                          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.customer}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--ink2)' }}>{t.category || 'General'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={t.priority === 'URGENT' ? 'error' : t.priority === 'HIGH' ? 'warning' : 'gray'}>
                          {t.priority}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'success' : t.status === 'IN_PROGRESS' ? 'info' : 'warning'}>
                          {t.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Button variant="outline" size="sm" onClick={() => navigate('/bliss/inbox')}>
                          View Ticket
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
};
