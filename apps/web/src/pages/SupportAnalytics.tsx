import React from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { useSupportMetrics, PeriodSwitcher, KpiCard, SHdr } from './SupportOverviewShared.js';
import './SupportOverview.css';

export const SupportAnalytics: React.FC = () => {
  const isFullLayout = useFullLayout();
  const { period, setPeriod, tickets, loading, metrics } = useSupportMetrics();

  /* By category — derived from real ticket categories, not a fixed fake list */
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
  const resolution = metrics?.resolution ?? 0;
  const sla = metrics?.sla ?? 0;
  const defect = metrics?.defect ?? 0;
  const escalation = metrics ? Number((metrics.defect / 2).toFixed(1)) : 0;

  if (loading) {
    return <div className="sov-loading">Loading analytics…</div>;
  }

  return (
    <div className="sov-root">
      <div className="sov-container" style={isFullLayout ? { maxWidth: 'none' } : undefined}>

        <PageHeader
          crumbs={['Support', 'Analytics']}
          titlePlain="Support"
          titleEm="analytics"
          subtitle="Satisfaction, response time, and issue trends for the selected period."
          actions={<div className="sov-actions"><PeriodSwitcher period={period} setPeriod={setPeriod} /></div>}
        />

        <div className="sov-kpi-row">
          <KpiCard icon="zap"         label="NPS Score"       value={metrics ? `${metrics.nps.score > 0 ? '+' : ''}${metrics.nps.score}` : '—'} iconBg="var(--teal-l)"  color="var(--teal)"   sub={`${npsTotal} responses`} />
          <KpiCard icon="smile"       label="CSAT Score"      value={metrics ? `${metrics.csat}/5` : '—'}       iconBg="var(--green-l)" color="var(--green)"  sub="Customer satisfaction" />
          <KpiCard icon="clock"       label="Avg First Reply" value={metrics ? `${metrics.firstReply}h` : '—'}  iconBg="var(--blue-l)"  color="#2563eb"       sub="Target: &lt;2h" />
          <KpiCard icon="timer"       label="Avg Solve Time"  value={metrics ? `${metrics.resolution}h` : '—'}  iconBg="var(--gold-l)"  color="var(--gold)"   sub="Target: &lt;8h" />
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
              { label: 'Avg Waiting Time', value: `${waiting}h`,    note: 'Before first reply', color: '#2563eb',      target: '< 2h',  ok: waiting <= 2  },
              { label: 'Avg Solving Time', value: `${resolution}h`, note: 'Open → resolved',    color: 'var(--teal)',  target: '< 8h',  ok: resolution <= 8 },
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

      </div>
    </div>
  );
};
