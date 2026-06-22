import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, MiniBar, Trend, spark } from '../components/MetricCard.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/* ── Helpers ── */
function pct(n: number) { return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }

/* ── Avatar ── */
function Av({ name, color, size = 38, img }: { name: string; color?: string; size?: number; img?: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#0d7a6b','#4f46e5','#ec4899','#f59e0b','#8b5cf6','#0550ae','#059669'];
  const bg = color || colors[name.charCodeAt(0) % colors.length];
  if (img) return <img src={img} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.33, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials}
    </div>
  );
}

/* MiniBar and Trend are imported from MetricCard */

/* ── Progress bar ── */
function ProgressBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
      <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

/* ── Full-width bar chart ── */
function BarChart({ data, color = '#c7d8f5', height = 60 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  const bw = 10, gap = 5;
  const totalW = data.length * (bw + gap) - gap;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${totalW} ${height}`} preserveAspectRatio="none" style={{ marginTop: 12 }}>
      {data.map((v, i) => {
        const bh = Math.max(3, (v / max) * height);
        return <rect key={i} x={i * (bw + gap)} y={height - bh} width={bw} height={bh} rx={2} fill={color} />;
      })}
    </svg>
  );
}

/* Trend imported from MetricCard */

/* ── Section header ── */
function SHdr({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font)' }}>{title}</div>
      {action && <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font)' }}>{action}</button>}
    </div>
  );
}

/* ── Static seed data ── */
const SPARK = [18,22,15,30,25,38,28,42,35,55,48,60,52,70,65];
const BAR_MONTHLY = [30,45,28,60,42,55,38,70,50,65,48,75,55,82,60,70,52,65,45,72,58,80,65,90,72,85,68,95,78,88];
const PLAN_BARS   = [20,35,15,45,30,55,40,60,45,65,50,70,55,75,60,80,65,85,70,90,75,95,80,100,85,90,80,75,70,65];

const ACTIVITIES = [
  { name: 'Keith Jensen',    action: 'requested a Withdrawal.',  time: '2 hours ago', color: '#9333ea' },
  { name: 'Harry Simpson',   action: 'placed a Payment Order.',   time: '2 hours ago', color: '#f59e0b' },
  { name: 'Stephanie Marshall', action: 'received a duty refund.',time: '2 hours ago', color: 'var(--teal)' },
  { name: 'Nicholas Carr',   action: 'deposited clearance funds.',time: '2 hours ago', color: 'var(--purple)' },
  { name: 'Timothy Moreno',  action: 'placed a Payment Order.',   time: '2 hours ago', color: '#ec4899' },
];

const NOTIFICATIONS = [
  { date: '13 Jun', color: 'var(--ink3)', title: 'Invoice #INV-2026-0541 Issued', desc: 'Clearance completed for GALCO. 09:30am' },
  { date: '13 Jun', color: 'var(--teal)', title: 'Payment Received — TZS 4.2M',   desc: 'Wire from Acme Imports. 09:15am' },
  { date: '12 Jun', color: '#4f46e5', title: 'Demurrage Charge Applied',       desc: 'Container CSNU8734521. 14:00pm' },
  { date: '12 Jun', color: '#ec4899', title: 'Duty Payment Pending',           desc: 'Ref: CLR-2026-0912. 11:00am' },
];

const RECENT_INVOICES = [
  { plan: 'P1', planName: 'Standard Clearance · 2.5%',  who: 'Janice Carroll',    date: '10/06/2026', amount: '4,850.00', currency: 'USD', status: 'Pending',   color: '#4f46e5' },
  { plan: 'P2', planName: 'Express Clearance · 4.5%',   who: 'Victoria Aguilar',  date: '10/06/2026', amount: '8,340.00', currency: 'USD', status: 'Completed', color: '#ec4899' },
  { plan: 'P3', planName: 'AEO Clearance · 1.8%',       who: 'Emma Henry',        date: '10/06/2026', amount: '3,120.00', currency: 'USD', status: 'Completed', color: '#f59e0b' },
  { plan: 'P1', planName: 'Standard Clearance · 2.5%',  who: 'Alice Ford',        date: '10/06/2026', amount: '6,780.00', currency: 'USD', status: 'Completed', color: '#4f46e5' },
  { plan: 'P3', planName: 'AEO Clearance · 1.8%',       who: 'Harold Walker',     date: '10/06/2026', amount: '5,490.00', currency: 'USD', status: 'Completed', color: '#f59e0b' },
];

const TOP_PLANS = [
  { name: 'Standard Clearance', pct: 58,    color: '#4f46e5' },
  { name: 'Express Clearance',  pct: 18.49, color: 'var(--teal)' },
  { name: 'AEO Clearance',      pct: 16,    color: '#10b981' },
  { name: 'Govt / Diplomatic',  pct: 29,    color: '#ec4899' },
  { name: 'Transit / T1',       pct: 33,    color: 'var(--blue)' },
];

/* ═══════════════════════════════════════════════════
   Main dashboard component
═══════════════════════════════════════════════════ */
export const FinanceDashboard: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [overviewTab, setOverviewTab] = useState<'overview'|'year'|'alltime'>('overview');
  const [actFilter, setActFilter] = useState<'all'|'cancel'>('all');
  const [metrics, setMetrics] = useState({
    totalRevenue: 49595.34, totalWithdraw: 49595.34, balance: 79358.50,
    monthRevenue: 2940.59,  weekRevenue: 1259.28,
    monthWithdraw: 2940.59, weekWithdraw: 1259.28,
    monthBalance: 2940.59,  weekBalance: 1259.28,
    activeAmount: 49395395, activePlans: 56,  paidProfit: 49395395,
    monthAmount: 49395395,  monthPlans: 23,
    trend: 1.93,
  });

  useEffect(() => {
    apiFetch('/v1/analytics/kpi')
      .then((d: any) => {
        if (!d) return;
        setMetrics(m => ({
          ...m,
          totalRevenue:  d.total_revenue_usd  || m.totalRevenue,
          totalWithdraw: d.total_payments_usd || m.totalWithdraw,
          balance:       d.net_balance_usd    || m.balance,
          activePlans:   d.active_cases       || m.activePlans,
          monthPlans:    d.delivered_today    || m.monthPlans,
        }));
      })
      .catch(() => {});
  }, []);

  /* ──────────────────────────────────────────
     TOP STAT CARDS
  ────────────────────────────────────────── */
  const metricCards = [
    { title: 'Total Revenue',       value: fmt(metrics.totalRevenue, 'USD'),  trend: +metrics.trend, sub1Value: fmt(metrics.monthRevenue, 'USD'),  sub2Value: fmt(metrics.weekRevenue, 'USD'),  bars: spark(1,15,'up'),   barColor: 'var(--purple-l)', barHighlight: 'var(--purple)' },
    { title: 'Total Disbursements', value: fmt(metrics.totalWithdraw, 'USD'), trend: -metrics.trend, sub1Value: fmt(metrics.monthWithdraw, 'USD'), sub2Value: fmt(metrics.weekWithdraw, 'USD'), bars: spark(2,15,'flat'), barColor: 'var(--red-l)',    barHighlight: 'var(--red)', invertTrend: true },
    { title: 'Balance in Account',  value: fmt(metrics.balance, 'USD'),       trend: +metrics.trend, sub1Value: fmt(metrics.monthBalance, 'USD'),  sub2Value: fmt(metrics.weekBalance, 'USD'),  bars: spark(3,15,'up'),   barColor: 'var(--green-l)', barHighlight: 'var(--green)' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['Finance', 'Dashboard']}
        titlePlain="Financial"
        titleEm="overview"
        subtitle="Revenue, disbursements, balance and clearance activity — at the workspace and gateway level."
      />

      <div style={{ padding: isMobile ? '0 16px 24px' : '0 0 24px' }}>

        {/* ══ ROW 1: Stat cards ══ */}
        <MetricsRow cards={metricCards} />

        {/* ══ ROW 2: Overview + Top Plans + Activities ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Investment Overview */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>Clearance Overview</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
              Revenue overview of your platform.{' '}
              <span style={{ color: 'var(--teal)', fontWeight: 600, cursor: 'pointer' }}>All Shipments</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
              {(['overview', 'year', 'alltime'] as const).map((t, i) => {
                const labels = ['Overview', 'This Year', 'All Time'];
                return (
                  <button key={t} onClick={() => setOverviewTab(t)} style={{ padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', color: overviewTab === t ? 'var(--teal)' : 'var(--ink3)', borderBottom: overviewTab === t ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.12s' }}>
                    {labels[i]}
                  </button>
                );
              })}
            </div>

            {/* Currently Active */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Currently Active Clearances</div>
              <div style={{ display: 'flex', gap: 28, marginBottom: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>{fmt(metrics.activeAmount, 'TZS')}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>AMOUNT</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                    {metrics.activePlans}
                    <Trend val={metrics.trend} />
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>CASES</div>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmt(metrics.paidProfit, 'TZS')}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>DUTIES PAID</div>
            </div>

            {/* This Month */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clearances This Month</div>
              <div style={{ display: 'flex', gap: 28 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>{fmt(metrics.monthAmount, 'TZS')}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>AMOUNT</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                    {metrics.monthPlans}
                    <Trend val={-metrics.trend} />
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>CASES</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Service Plans */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Top Service Plans</div>
              <Icon name="moreHorizontal" size={16} strokeWidth={1.75} style={{ color: 'var(--ink3)', flexShrink: 0, marginTop: 2 } as React.CSSProperties} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>In last 30 days top cleared service schemes.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TOP_PLANS.map(plan => (
                <div key={plan.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>{plan.name}</span>
                    <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>{plan.pct}%</span>
                  </div>
                  <ProgressBar pct={plan.pct} color={plan.color} />
                </div>
              ))}
            </div>

            <BarChart data={PLAN_BARS} color="#d1d5f5" height={56} />
          </div>

          {/* Recent Activities */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Recent Activities</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'cancel'] as const).map(f => (
                  <button key={f} onClick={() => setActFilter(f)} style={{ padding: '3px 11px', border: 'none', borderRadius: 20, background: actFilter === f ? 'var(--navy)' : 'transparent', color: actFilter === f ? '#fff' : 'var(--ink3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
              {ACTIVITIES.map((act, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < ACTIVITIES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <Av name={act.name} color={act.color} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{act.name}</span>
                      <span style={{ color: 'var(--ink2)', fontWeight: 400 }}> {act.action}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{act.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ ROW 3: Notifications + Recent Invoices ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 16 }}>

          {/* Notifications */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <SHdr title="Notifications" action="View All" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Month label */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--teal)', marginBottom: 14 }}>June, 2026</div>

              {NOTIFICATIONS.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 16, marginBottom: 16, borderBottom: i < NOTIFICATIONS.length - 1 ? '1px solid var(--border)' : 'none', position: 'relative' }}>
                  {/* Timeline dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0, width: 52 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: n.color, flexShrink: 0, marginTop: 4 }} />
                    {i < NOTIFICATIONS.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>{n.date}</span>
                      <Icon name="clock" size={11} strokeWidth={1.75} style={{ color: 'var(--ink3)', flexShrink: 0 } as React.CSSProperties} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.4 }}>{n.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Invoices / Transactions */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <SHdr title="Recent Invoices" action="View All" />

            <div style={{ overflowX: 'auto' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.4fr 1fr 32px', gap: 8, padding: '7px 10px', background: 'var(--bg)', borderRadius: 7, marginBottom: 6, minWidth: 480 }}>
              {['Plan', 'Who', 'Date', 'Amount', 'Status', ''].map(h => (
                <div key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {RECENT_INVOICES.map((row, i) => (
                <div key={i}
                  style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.4fr 1fr 32px', gap: 8, padding: '12px 10px', borderBottom: i < RECENT_INVOICES.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s', minWidth: 480 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* Plan badge + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: row.color + '18', color: row.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0, letterSpacing: '0.03em' }}>{row.plan}</div>
                    <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.planName}</span>
                  </div>

                  {/* Who */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Av name={row.who} size={28} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.who}</span>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{row.date}</div>

                  {/* Amount */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{row.amount}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>{row.currency}</div>
                  </div>

                  {/* Status */}
                  <div>
                    {row.status === 'Pending' ? (
                      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', width: '80%' }}>
                        <div style={{ height: '100%', width: '40%', background: row.color, borderRadius: 3 }} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green)' }}>{row.status}</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                    <Icon name="chevronRight" size={14} strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
