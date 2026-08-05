import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, MiniBar, spark } from '../components/MetricCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useLocale } from '../hooks/useLocale.js';
import { mapApiInvoice, invoiceTotals, STATUS_STYLE } from './Billing.js';

/* -- Helpers -- */
function pct(n: number) { return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }

/* -- Avatar -- */
function Av({ name, color, size = 38, img }: { name: string; color?: string; size?: number; img?: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#0d7a6b','#4f46e5','#ec4899','#f59e0b','#8b5cf6','#0550ae','#059669'];
  const bg = color || colors[((name ?? '?').charCodeAt(0)) % colors.length];
  if (img) return <img src={img} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.33, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials}
    </div>
  );
}

/* MiniBar and Trend are imported from MetricCard */

/* -- Progress bar -- */
function ProgressBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
      <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

/* Trend imported from MetricCard */

/* -- Section header -- */
function SHdr({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font)' }}>{title}</div>
      {action && <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font)' }}>{action}</button>}
    </div>
  );
}

const ACTIVITY_COLORS = ['#9333ea', '#f59e0b', 'var(--teal)', 'var(--purple)', '#ec4899', '#4f46e5'];
const PLAN_COLORS = ['#4f46e5', 'var(--teal)', '#10b981', '#ec4899', 'var(--blue)'];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/* ---------------------------------------------------
   Main dashboard component
--------------------------------------------------- */
export const FinanceDashboard: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const { t } = useLocale();
  const [overviewTab, setOverviewTab] = useState<'overview'|'year'|'alltime'>('overview');
  const [actFilter, setActFilter] = useState<'all'|'cancel'>('all');

  const [rawInvoices, setRawInvoices] = useState<any[]>([]);
  const [rawBills, setRawBills] = useState<any[]>([]);
  const [rawPayments, setRawPayments] = useState<any[]>([]);
  const [rawNotifications, setRawNotifications] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/invoices').catch(() => []),
      apiFetch('/v1/bills').catch(() => []),
      apiFetch('/v1/payments').catch(() => []),
      apiFetch('/v1/notifications').catch(() => ({ notifications: [] })),
    ]).then(([inv, bl, pay, notif]) => {
      setRawInvoices(Array.isArray(inv) ? inv : []);
      setRawBills(Array.isArray(bl) ? bl : []);
      setRawPayments(Array.isArray(pay) ? pay : []);
      setRawNotifications(Array.isArray(notif?.notifications) ? notif.notifications : []);
    }).finally(() => setLoadingData(false));
  }, []);

  const derived = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now.getTime() - 7 * 86400000);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const invoices = rawInvoices.map(d => {
      const mapped = mapApiInvoice(d);
      return { raw: d, mapped, total: invoiceTotals(mapped).grandTotalTZS, date: d.bill_date ? new Date(d.bill_date) : null };
    });

    const sumSince = (items: { total: number; date: Date | null }[], since: Date) =>
      items.filter(i => i.date && i.date >= since).reduce((s, i) => s + i.total, 0);
    const sumBetween = (items: { total: number; date: Date | null }[], from: Date, to: Date) =>
      items.filter(i => i.date && i.date >= from && i.date < to).reduce((s, i) => s + i.total, 0);

    const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
    const monthRevenue = sumSince(invoices, monthStart);
    const weekRevenue = sumSince(invoices, weekStart);
    const lastMonthRevenue = sumBetween(invoices, lastMonthStart, monthStart);

    const bills = rawBills.map(b => ({ raw: b, total: Number(b.total) || 0, date: b.bill_date ? new Date(b.bill_date) : null }));
    const totalWithdraw = bills.reduce((s, b) => s + b.total, 0);
    const monthWithdraw = sumSince(bills, monthStart);
    const weekWithdraw = sumSince(bills, weekStart);

    const balance = totalRevenue - totalWithdraw;
    const monthBalance = monthRevenue - monthWithdraw;
    const weekBalance = weekRevenue - weekWithdraw;

    // Only compute a real trend when there's a genuine prior-month figure to compare against.
    const revenueTrendPct = lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;

    const outstanding = invoices.filter(i => i.mapped.status !== 'Paid' && i.mapped.status !== 'Credited');
    const outstandingAmount = outstanding.reduce((s, i) => s + i.total, 0);
    const invoicesThisMonth = invoices.filter(i => i.date && i.date >= monthStart);
    const invoicesThisMonthAmount = invoicesThisMonth.reduce((s, i) => s + i.total, 0);

    // Top customers by revenue — real substitute for a "top service plans" breakdown
    // that had no equivalent concept anywhere in the real invoice/shipment model.
    const byClient = new Map<string, number>();
    invoices.forEach(i => byClient.set(i.mapped.client || 'Unknown', (byClient.get(i.mapped.client || 'Unknown') || 0) + i.total));
    const topCustomers = Array.from(byClient.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, amt], idx) => ({ name, pct: totalRevenue > 0 ? Math.round((amt / totalRevenue) * 1000) / 10 : 0, color: PLAN_COLORS[idx % PLAN_COLORS.length] }));

    // Recent activity — merged real invoice/bill/payment events, not fabricated names.
    const events: { name: string; action: string; time: string; ts: number; color: string }[] = [];
    invoices.forEach(i => {
      if (i.raw.created_at) events.push({ name: i.mapped.client || 'Unknown', action: `was issued invoice ${i.mapped.id}.`, time: timeAgo(i.raw.created_at), ts: new Date(i.raw.created_at).getTime(), color: ACTIVITY_COLORS[0] });
    });
    bills.forEach(b => {
      if (b.raw.created_at) events.push({ name: b.raw.supplier_name || 'Vendor', action: `billed ${b.raw.bill_number} to this account.`, time: timeAgo(b.raw.created_at), ts: new Date(b.raw.created_at).getTime(), color: ACTIVITY_COLORS[1] });
    });
    rawPayments.forEach((p: any) => {
      if (p.created_at) events.push({ name: p.client_name || 'Unknown', action: `paid against invoice ${p.invoice_number}.`, time: timeAgo(p.created_at), ts: new Date(p.created_at).getTime(), color: ACTIVITY_COLORS[2] });
    });
    events.sort((a, b) => b.ts - a.ts);

    const recentInvoices = [...invoices].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)).slice(0, 5);

    return {
      totalRevenue, monthRevenue, weekRevenue, revenueTrendPct,
      totalWithdraw, monthWithdraw, weekWithdraw,
      balance, monthBalance, weekBalance,
      outstandingCount: outstanding.length, outstandingAmount,
      invoicesThisMonthCount: invoicesThisMonth.length, invoicesThisMonthAmount,
      topCustomers, activities: events.slice(0, 5), recentInvoices,
    };
  }, [rawInvoices, rawBills, rawPayments]);

  /* ------------------------------------------
     TOP STAT CARDS
  ------------------------------------------ */
  const metricCards = [
    { title: t('finance.totalRevenue'),       value: fmt(derived.totalRevenue, 'TZS'),  trend: derived.revenueTrendPct, sub1Value: fmt(derived.monthRevenue, 'TZS'),  sub2Value: fmt(derived.weekRevenue, 'TZS'),  bars: derived.totalRevenue > 0 ? spark(1,15,'up') : undefined,   barColor: 'var(--purple-l)', barHighlight: 'var(--purple)' },
    { title: t('finance.totalDisbursements'), value: fmt(derived.totalWithdraw, 'TZS'), trend: 0, sub1Value: fmt(derived.monthWithdraw, 'TZS'), sub2Value: fmt(derived.weekWithdraw, 'TZS'), bars: derived.totalWithdraw > 0 ? spark(2,15,'flat') : undefined, barColor: 'var(--red-l)',    barHighlight: 'var(--red)', invertTrend: true },
    { title: t('finance.balanceInAccount'),   value: fmt(derived.balance, 'TZS'),       trend: 0, sub1Value: fmt(derived.monthBalance, 'TZS'),  sub2Value: fmt(derived.weekBalance, 'TZS'),  bars: derived.balance !== 0 ? spark(3,15,'up') : undefined,   barColor: 'var(--green-l)', barHighlight: 'var(--green)' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['Finance', 'Dashboard']}
        titlePlain={t('finance.financial')}
        titleEm={t('finance.overview')}
        subtitle={t('finance.dashboardSubtitle')}
      />

      <div style={{ padding: isMobile ? '0 16px 24px' : '0 0 24px' }}>

        {/* -- ROW 1: Stat cards -- */}
        <MetricsRow cards={metricCards} />

        {/* -- ROW 2: Overview + Top Plans + Activities -- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.3fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Investment Overview */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{t('finance.clearanceOverview')}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
              {t('finance.revenueOverviewOf')}{' '}
              <span style={{ color: 'var(--teal)', fontWeight: 600, cursor: 'pointer' }}>{t('finance.allShipments')}</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
              {(['overview', 'year', 'alltime'] as const).map((tabKey, i) => {
                const labels = [t('finance.tabOverview'), t('finance.tabThisYear'), t('finance.tabAllTime')];
                return (
                  <button key={tabKey} onClick={() => setOverviewTab(tabKey)} style={{ padding: 'var(--ds-btn-py-sm) 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font)', color: overviewTab === tabKey ? 'var(--teal)' : 'var(--ink3)', borderBottom: overviewTab === tabKey ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.12s' }}>
                    {labels[i]}
                  </button>
                );
              })}
            </div>

            {/* Outstanding Invoices */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Outstanding Invoices</div>
              <div style={{ display: 'flex', gap: 28, marginBottom: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>{fmt(derived.outstandingAmount, 'TZS')}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>{t('finance.amount')}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                    {derived.outstandingCount}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>invoices</div>
                </div>
              </div>
            </div>

            {/* This Month */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoiced This Month</div>
              <div style={{ display: 'flex', gap: 28 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>{fmt(derived.invoicesThisMonthAmount, 'TZS')}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>{t('finance.amount')}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                    {derived.invoicesThisMonthCount}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>invoices</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Customers by Revenue */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Top Customers</div>
              <Icon name="moreHorizontal" size={16} strokeWidth={1.75} style={{ color: 'var(--ink3)', flexShrink: 0, marginTop: 2 } as React.CSSProperties} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 18 }}>By total invoiced revenue</div>

            {derived.topCustomers.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No invoices yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {derived.topCustomers.map(plan => (
                  <div key={plan.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                      <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>{plan.name}</span>
                      <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>{plan.pct}%</span>
                    </div>
                    <ProgressBar pct={plan.pct} color={plan.color} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activities */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{t('finance.recentActivities')}</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'cancel'] as const).map(f => (
                  <button key={f} onClick={() => setActFilter(f)} style={{ padding: 'var(--ds-btn-py-sm) 11px', border: 'none', borderRadius: 20, background: actFilter === f ? 'var(--navy)' : 'transparent', color: actFilter === f ? '#fff' : 'var(--ink3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    {f === 'all' ? t('finance.all') : t('finance.cancel')}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
              {derived.activities.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No recent activity</div>
              ) : derived.activities.map((act, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < derived.activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
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

        {/* -- ROW 3: Notifications + Recent Invoices -- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 16 }}>

          {/* Notifications */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <SHdr title={t('finance.notifications')} action={t('finance.viewAll')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {rawNotifications.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No notifications yet</div>
              ) : rawNotifications.slice(0, 6).map((n, i, arr) => (
                <div key={n.id || i} style={{ display: 'flex', gap: 12, paddingBottom: 16, marginBottom: 16, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', position: 'relative' }}>
                  {/* Timeline dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0, width: 52 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: n.read ? 'var(--ink3)' : 'var(--teal)', flexShrink: 0, marginTop: 4 }} />
                    {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
                      <Icon name="clock" size={11} strokeWidth={1.75} style={{ color: 'var(--ink3)', flexShrink: 0 } as React.CSSProperties} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.4 }}>{n.body || n.message || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Invoices / Transactions */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <SHdr title={t('finance.recentInvoices')} action={t('finance.viewAll')} />

            <div style={{ overflowX: 'auto' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.4fr 1fr 32px', gap: 8, padding: '7px 10px', background: 'var(--bg)', borderRadius: 7, marginBottom: 6, minWidth: 480 }}>
              {[t('finance.colPlan'), t('finance.colWho'), t('finance.colDate'), t('finance.colAmount'), t('finance.colStatus'), ''].map(h => (
                <div key={h} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {derived.recentInvoices.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No invoices yet</div>
              ) : derived.recentInvoices.map((row, i) => {
                const statusStyle = STATUS_STYLE[row.mapped.status] || STATUS_STYLE.Draft;
                return (
                <div key={row.mapped.id + i}
                  style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.4fr 1fr 32px', gap: 8, padding: '12px 10px', borderBottom: i < derived.recentInvoices.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s', minWidth: 480 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* Invoice badge + number */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: statusStyle.bg, color: statusStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0, letterSpacing: '0.03em' }}>
                      <Icon name="fileText" size={14} />
                    </div>
                    <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mapped.id}</span>
                  </div>

                  {/* Who */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Av name={row.mapped.client || 'Unknown'} size={28} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mapped.client || 'Unknown'}</span>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{row.mapped.billDate || '—'}</div>

                  {/* Amount */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{row.total.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>TZS</div>
                  </div>

                  {/* Status */}
                  <div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: statusStyle.color }}>{statusStyle.label}</span>
                  </div>

                  {/* Arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)' }}>
                    <Icon name="chevronRight" size={14} strokeWidth={2} />
                  </div>
                </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
