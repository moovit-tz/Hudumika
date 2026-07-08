import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { useFullLayout } from '../hooks/useFullLayout.js';

type StatusKey   = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type PriorityKey = 'LOW'  | 'MEDIUM'      | 'HIGH'      | 'URGENT';

interface Ticket {
  id: string; ref: string; customer: string; category: string;
  status: StatusKey; priority: PriorityKey; assigned_to?: string;
  created_at: string; updated_at?: string;
}

const CATEGORIES = ['Clearance Delay','Document Issue','Demurrage Dispute','Duty Assessment','System Error','General Query','Complaint'];
const OFFICERS   = ['Amina Hassan','John Mwangi','Fatuma Ally','Peter Kimani','Grace Osei'];
const AVT_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#1a7f37','#9a6700','#cf222e','#d05c30','#0e7490'];

const initials    = (n: string) => n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
const avtColor    = (n: string) => AVT_COLORS[n.charCodeAt(0) % AVT_COLORS.length];

/* Seeded deterministic bar data */
function seededBars(seed: number, count: number, trend: 'up'|'down'|'flat' = 'up'): number[] {
  const v: number[] = [];
  let cur = 40 + (seed % 30);
  for (let i = 0; i < count; i++) {
    cur += ((seed * (i+1)) % 17 - 8) + (trend === 'up' ? 1.5 : trend === 'down' ? -1.5 : 0);
    v.push(Math.max(5, Math.round(cur)));
  }
  return v;
}

/* ── KPI card ── */
function KpiCard({ icon, label, value, sub, color, iconBg, trend, trendUp }: {
  icon: IconName; label: string; value: string; sub?: string;
  color: string; iconBg: string; trend?: string; trendUp?: boolean;
}) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 9, padding: '16px 18px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={18} strokeWidth={1.75} style={{ color } as React.CSSProperties} />
        </div>
        {trend && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: trendUp ? 'var(--green)' : 'var(--red)', background: trendUp ? 'var(--green-l)' : 'var(--red-l)', padding: '2px 7px', borderRadius: 9 }}>
            <Icon name={trendUp ? 'arrowUp' : 'arrowDown'} size={9} strokeWidth={2.5} />{trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--navy)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink2)', marginBottom: sub ? 2 : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{sub}</div>}
    </div>
  );
}

/* ── Section header ── */
function SHdr({ title, action, to }: { title: string; action?: string; to?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)' }}>{title}</div>
      {action && to && <Link to={to} style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0, textDecoration: 'none' }}>{action} →</Link>}
    </div>
  );
}

/* ── Stat row inside a card ── */
function StatRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{value} <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: color, borderRadius: 4, width: `${pct}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ── Avatar ── */
function Av({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avtColor(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials(name)}
    </div>
  );
}

export const SupportOverview: React.FC = () => {
  const isFullLayout = useFullLayout();
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState<'7d'|'30d'|'90d'>('30d');
  const [metrics, setMetrics]   = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const buildTickets = useCallback((data: any[]): Ticket[] =>
    data.slice(0, 40).map((s: any, i: number) => ({
      id: s.id,
      ref: s.ref || s.ref_number || `TKT-${1000+i}`,
      customer: s.customer ?? s.customer_name ?? 'Unknown',
      category: s.category || CATEGORIES[i % CATEGORIES.length],
      status: s.status as StatusKey,
      priority: s.priority as PriorityKey,
      assigned_to: s.assigned_to || OFFICERS[i % OFFICERS.length],
      created_at: s.created_at,
      updated_at: s.updated_at || s.created_at,
    })), []);

  useEffect(() => {
    apiFetch('/v1/support/tickets')
      .then((r: any) => setTickets(buildTickets(r.data ?? r ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [buildTickets]);

  useEffect(() => {
    setMetricsLoading(true);
    apiFetch(`/v1/support/metrics?period=${period}`)
      .then((r: any) => setMetrics(r))
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, [period]);

  /* Derived counts — prefer the authoritative /metrics breakdown; fall back to the raw ticket list only while metrics hasn't loaded yet */
  const total    = metrics ? metrics.total : tickets.length;
  const open     = metrics ? metrics.open       : tickets.filter(t => t.status === 'OPEN').length;
  const inProg   = metrics ? metrics.inProgress : tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolved = metrics ? metrics.resolved   : tickets.filter(t => t.status === 'RESOLVED').length;
  const closed   = metrics ? metrics.closed     : tickets.filter(t => t.status === 'CLOSED').length;
  const urgent   = metrics ? metrics.urgent     : tickets.filter(t => t.priority === 'URGENT').length;
  const resRate  = total ? Math.round(((resolved + closed) / total) * 100) : 0;
  const pct      = (n: number) => total ? Math.round((n / total) * 100) : 0;

  /* By category */
  const byCat = CATEGORIES.map(cat => ({ label: cat, count: tickets.filter(t => t.category === cat).length }))
                           .sort((a, b) => b.count - a.count);
  const maxCat = Math.max(...byCat.map(c => c.count), 1);

  /* Agent stats */
  const agentStats = OFFICERS.map((name, idx) => ({
    name,
    total:    tickets.filter(t => t.assigned_to === name).length,
    resolved: tickets.filter(t => t.assigned_to === name && (t.status === 'RESOLVED' || t.status === 'CLOSED')).length,
    open:     tickets.filter(t => t.assigned_to === name && t.status === 'OPEN').length,
    avgTime:  `${(2 + idx * 0.7).toFixed(1)}h`,
    csat:     (4.5 - idx * 0.2).toFixed(1),
  }));

  /* 14-day volume bars */
  const dayBars = metrics?.dailyBars || seededBars(total + 7, 14, 'up');
  const dayMax  = Math.max(...dayBars, 1);

  /* NPS derived breakdown */
  const npsScore = metrics ? metrics.nps.score : 42;
  const npsTotal = metrics ? metrics.nps.total : 247;
  const npsPromoters = metrics ? metrics.nps.promoters : 58;
  const npsPassives = metrics ? metrics.nps.passives : 26;
  const npsDetractors = metrics ? metrics.nps.detractors : 16;

  /* Time & quality derived metrics */
  const waiting = metrics?.firstReply ?? 1.8;
  const resolution = metrics?.resolution ?? 6.4;
  const sla = metrics?.sla ?? 87.4;
  const defect = metrics?.defect ?? 4.2;
  const escalation = metrics ? Number((metrics.defect / 2).toFixed(1)) : 8.7;

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 14, fontFamily: 'var(--font)' }}>
        Loading support overview…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: '22px 26px', maxWidth: isFullLayout ? 'none' : 1400, margin: '0 auto' }}>

        <PageHeader
          crumbs={['Support', 'Overview']}
          titlePlain="Support"
          titleEm="overview"
          subtitle={`${total} total cases · ${urgent} urgent · ${resRate}% resolution rate`}
          actions={
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {(['7d','30d','90d'] as const).map(p => (
                <button key={p} type="button" onClick={() => setPeriod(p)}
                  style={{ padding: '7px 14px', border: `1.5px solid ${period === p ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 9, background: period === p ? 'var(--teal-l)' : 'var(--white)', color: period === p ? 'var(--teal)' : 'var(--ink3)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
              <Link to="/bliss/tickets"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--teal)', border: 'none', borderRadius: 9, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                <Icon name="message" size={14} strokeWidth={2} />
                All Tickets
              </Link>
            </div>
          }
        />

        {/* ── Row 1: Volume KPIs ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <KpiCard icon="clipboard"   label="Total Cases"  value={String(total)}    iconBg="var(--blue-l)"  color="#2563eb"       trend="+11%" trendUp sub={`${period} period`} />
          <KpiCard icon="alertCircle" label="Open"         value={String(open)}     iconBg="var(--red-l)"   color="var(--red)"    trend="+3%"  trendUp={false} sub={`${urgent} urgent`} />
          <KpiCard icon="clock"       label="In Progress"  value={String(inProg)}   iconBg="var(--gold-l)"  color="var(--gold)"   sub="Being worked on" />
          <KpiCard icon="checkCircle" label="Resolved"     value={String(resolved)} iconBg="var(--green-l)" color="var(--green)"  trend="+18%" trendUp />
          <KpiCard icon="x"           label="Closed"       value={String(closed)}   iconBg="var(--bg)"      color="var(--ink2)"   sub={`${resRate}% resolution rate`} />
        </div>

        {/* ── Row 2: Quality & time KPIs ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <KpiCard icon="zap"         label="NPS Score"       value={metrics ? `${metrics.nps.score > 0 ? '+' : ''}${metrics.nps.score}` : '+42'} iconBg="var(--teal-l)"  color="var(--teal)"   trend="+7pts" trendUp sub={`${npsTotal} responses`} />
          <KpiCard icon="smile"       label="CSAT Score"      value={metrics ? `${metrics.csat}/5` : '4.3/5'}       iconBg="var(--green-l)" color="var(--green)"  sub="Customer satisfaction" />
          <KpiCard icon="clock"       label="Avg First Reply" value={metrics ? `${metrics.firstReply}h` : '1.8h'}  iconBg="var(--blue-l)"  color="#2563eb"       trend="-12%" trendUp sub="Target: &lt;2h" />
          <KpiCard icon="timer"       label="Avg Solve Time"  value={metrics ? `${metrics.resolution}h` : '6.4h'}  iconBg="var(--gold-l)"  color="var(--gold)"   sub="Target: &lt;8h" />
          <KpiCard icon="tasks"       label="SLA Compliance"  value={metrics ? `${metrics.sla}%` : '87.4%'}         iconBg="var(--green-l)" color="var(--green)"  trend="+3%" trendUp />
          <KpiCard icon="warning"     label="Defect Rate"     value={metrics ? `${metrics.defect}%` : '4.2%'}      iconBg="var(--red-l)"   color="var(--red)"    trend="-2%" trendUp sub="Reopened / escalated" />
        </div>

        {/* ── Charts row 1 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Daily volume bar chart */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title={`Daily Ticket Volume (last 14 days)`} action="View tickets" to="/bliss/tickets" />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, marginBottom: 8 }}>
              {dayBars.map((v: number, i: number) => {
                const isToday = i === dayBars.length - 1;
                return (
                  <div key={i} title={`${v} tickets`}
                    style={{ flex: 1, background: isToday ? 'var(--teal)' : 'var(--teal-l)', borderRadius: '3px 3px 0 0', height: `${Math.max(8, (v / dayMax) * 100)}%`, cursor: 'default', position: 'relative', transition: 'height 0.4s' }} />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink3)', marginBottom: 10 }}>
              <span>14 days ago</span>
              <span style={{ fontWeight: 700, color: 'var(--teal)' }}>Today ({dayBars[dayBars.length-1]})</span>
            </div>
            <div style={{ display: 'flex', gap: 20, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Total period', val: dayBars.reduce((a: number, b: number) => a + b, 0) },
                { label: 'Daily avg',    val: Math.round(dayBars.reduce((a: number, b: number) => a + b, 0) / 14) },
                { label: 'Peak day',     val: Math.max(...dayBars) },
                { label: 'Min day',      val: Math.min(...dayBars) },
              ].map((s: { label: string; val: number }) => (
                <div key={s.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Status distribution */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="Status Distribution" />
            <StatRow label="Open"        value={open}    pct={pct(open)}    color="var(--red)"   />
            <StatRow label="In Progress" value={inProg}  pct={pct(inProg)}  color="var(--gold)"  />
            <StatRow label="Resolved"    value={resolved} pct={pct(resolved)} color="var(--green)" />
            <StatRow label="Closed"      value={closed}  pct={pct(closed)}  color="var(--ink3)"  />
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Total cases</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{total}</span>
            </div>
          </div>
        </div>

        {/* ── Charts row 2 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* NPS breakdown */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="Net Promoter Score" />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <div style={{ textAlign: 'center', paddingRight: 14, borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: npsScore >= 50 ? 'var(--green)' : npsScore >= 20 ? 'var(--gold)' : 'var(--red)' }}>
                  {npsScore > 0 ? '+' : ''}{npsScore}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{npsTotal} surveys</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: npsScore >= 50 ? 'var(--green)' : 'var(--gold)', marginTop: 4 }}>
                  {npsScore >= 70 ? 'Excellent' : npsScore >= 50 ? 'Good' : npsScore >= 0 ? 'Neutral' : 'Poor'}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {[
                  { label: 'Promoters',   pct: npsPromoters,   color: 'var(--green)', note: '9–10' },
                  { label: 'Passives',    pct: npsPassives,    color: 'var(--gold)',  note: '7–8'  },
                  { label: 'Detractors',  pct: npsDetractors,  color: 'var(--red)',   note: '0–6'  },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{row.label} <span style={{ color: 'var(--ink3)', fontSize: 10.5 }}>({row.note})</span></span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: row.color, borderRadius: 3, width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Segmented NPS bar */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 10 }}>
              <div style={{ width: `${npsDetractors}%`, background: 'var(--red)' }} />
              <div style={{ width: `${npsPassives}%`,   background: 'var(--gold)' }} />
              <div style={{ width: `${npsPromoters}%`,  background: 'var(--green)' }} />
            </div>
          </div>

          {/* By category */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="By Issue Category" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byCat.map(c => (
                <div key={c.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{c.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--teal)', borderRadius: 3, width: `${(c.count/maxCat)*100}%`, opacity: 0.5 + (c.count/maxCat)*0.5, transition: 'width 0.6s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response & quality metrics */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="Time & Quality" />
            {[
              { label: 'Avg Waiting Time',   value: `${waiting}h`,    note: 'Before first reply',      color: '#2563eb', target: '< 2h',  ok: waiting <= 2  },
              { label: 'Avg Solving Time',   value: `${resolution}h`, note: 'Open → resolved',          color: 'var(--teal)', target: '< 8h',  ok: resolution <= 8 },
              { label: 'SLA Compliance',     value: `${sla}%`,        note: 'Within agreed SLA',        color: 'var(--green)', target: '> 90%', ok: sla >= 90    },
              { label: 'Defect Rate',        value: `${defect}%`,     note: 'Reopened / escalated',     color: 'var(--red)', target: '< 3%',  ok: defect <= 3   },
              { label: 'Escalation Rate',    value: `${escalation}%`, note: 'Sent to senior / mgmt',   color: 'var(--gold)', target: '< 5%',  ok: escalation <= 5 },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{m.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{m.note} · Target {m.target}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: m.color }}>{m.value}</span>
                  <Icon name={m.ok ? 'checkCircle' : 'alertCircle'} size={13} strokeWidth={2} style={{ color: m.ok ? 'var(--green)' : 'var(--red)' } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Charts row 3: first-reply histogram + tag breakdown ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Hours until first agent reply — histogram */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="Hours Until First Agent Reply" />
            {(() => {
              const buckets: { key: string; label: string }[] = [
                { key: '0-1',  label: '0–1h' },
                { key: '1-8',  label: '1–8h' },
                { key: '8-24', label: '8–24h' },
                { key: '>24',  label: '>24h' },
              ];
              const hist = metrics?.firstReplyHistogram || { '0-1': 0, '1-8': 0, '8-24': 0, '>24': 0 };
              const histMax = Math.max(...buckets.map(b => hist[b.key] || 0), 1);
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 110 }}>
                  {buckets.map(b => {
                    const v = hist[b.key] || 0;
                    const isFast = b.key === '0-1' || b.key === '1-8';
                    return (
                      <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)' }}>{v}</div>
                        <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 70 }}>
                          <div style={{ width: '100%', background: isFast ? 'var(--green)' : 'var(--red)', opacity: isFast ? 0.85 : 0.7, borderRadius: '4px 4px 0 0', height: `${Math.max(4, (v / histMax) * 100)}%`, transition: 'height 0.4s' }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>{b.label}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Conversations by tag */}
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <SHdr title="Conversations by Tag" />
            {(() => {
              const tags: { tag: string; count: number }[] = metrics?.tagBreakdown || [];
              const tagMax = Math.max(...tags.map((t: { tag: string; count: number }) => t.count), 1);
              if (tags.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No tagged conversations in this period.</div>;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tags.map((t: { tag: string; count: number }) => (
                    <div key={t.tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{t.tag}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{t.count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 3, width: `${(t.count / tagMax) * 100}%`, opacity: 0.5 + (t.count / tagMax) * 0.5, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Busiest time of day — heatmap ── */}
        <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}>
          <SHdr title="Busiest Time of Day" />
          {(() => {
            const cells: { day: string; bucket: string; count: number }[] = metrics?.busiestHeatmap || [];
            if (cells.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No data for this period.</div>;
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const buckets = Array.from(new Set(cells.map(c => c.bucket)));
            const cellMax = Math.max(...cells.map(c => c.count), 1);
            const lookup = new Map(cells.map(c => [`${c.day}|${c.bucket}`, c.count]));
            return (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${buckets.length}, 1fr)`, gap: 4, minWidth: 640 }}>
                  <div />
                  {buckets.map(b => (
                    <div key={b} style={{ fontSize: 9.5, color: 'var(--ink3)', textAlign: 'center', fontWeight: 600 }}>{b}</div>
                  ))}
                  {days.map(day => (
                    <React.Fragment key={day}>
                      <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{day}</div>
                      {buckets.map(b => {
                        const v = lookup.get(`${day}|${b}`) || 0;
                        const intensity = v / cellMax;
                        return (
                          <div key={b} title={`${day} ${b}h — ${v} tickets`}
                            style={{
                              height: 22, borderRadius: 4,
                              background: intensity === 0 ? 'var(--bg)' : `color-mix(in srgb, var(--teal) ${Math.round(20 + intensity * 80)}%, var(--white))`,
                            }} />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Agent Performance ── */}
        <div style={{ background: 'var(--white)', borderRadius: 9, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 8 }}>
          <SHdr title="Agent Performance" action="Open all tickets" to="/bliss/tickets" />
          <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Agent','Assigned','Resolved','Open','Avg Time','CSAT','Resolution Rate'].map(col => (
                  <th key={col} style={{ padding: '8px 12px', textAlign: col === 'Agent' ? 'left' : 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentStats.map(a => {
                const rate = a.total ? Math.round((a.resolved / a.total) * 100) : 0;
                const csatN = parseFloat(a.csat);
                return (
                  <tr key={a.name} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Av name={a.name} size={30} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{a.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{a.total}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{a.resolved}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: a.open > 2 ? 700 : 400, color: a.open > 3 ? 'var(--red)' : 'var(--ink)' }}>{a.open}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, color: 'var(--ink)' }}>{a.avgTime}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: csatN >= 4.5 ? 'var(--green)' : csatN >= 4.0 ? 'var(--gold)' : 'var(--red)' }}>★ {a.csat}</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
                        <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--gold)' : 'var(--red)', borderRadius: 3, width: `${rate}%`, transition: 'width 0.6s' }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', minWidth: 30 }}>{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>

      </div>
    </div>
  );
};
