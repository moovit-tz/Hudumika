import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, MiniBar } from '../components/MetricCard.js';
import { PageHeader } from '../components/PageHeader.js';
import { CompanyAvatar } from '../components/PersonAvatar.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useLocale } from '../hooks/useLocale.js';
import { mapApiInvoice, invoiceTotals } from './Billing.js';
import { SkeletonPage } from '../components/ui/skeleton.js';

/* -- Helpers -- */
function pct(n: number) { return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }

/* -- Avatar -- */

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
      {action && <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--font)' }}>{action}</button>}
    </div>
  );
}

const ACTIVITY_COLORS = ['#9333ea', '#f59e0b', 'var(--teal)', 'var(--purple)', '#ec4899', '#4f46e5'];
const PLAN_COLORS = ['#4f46e5', 'var(--teal)', '#10b981', '#ec4899', 'var(--blue)'];

function fmtDate(d: string | null | undefined): string {
  if (!d) return 'â€”';
  const date = new Date(d);
  return isNaN(date.getTime()) ? 'â€”' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* -- Compact stat tile, used inside the Tax & Compliance card -- */
function StatTile({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'warning' | 'good' }) {
  const color = tone === 'warning' ? 'var(--red)' : tone === 'good' ? 'var(--green)' : 'var(--navy)';
  return (
    <div style={{ padding: '12px 14px', background: 'var(--bg)', borderRadius: 8, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

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
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const { t } = useLocale();
  const [overviewTab, setOverviewTab] = useState<'overview'|'year'|'alltime'>('overview');
  const [actFilter, setActFilter] = useState<'all'|'cancel'>('all');

  const [rawInvoices, setRawInvoices] = useState<any[]>([]);
  const [rawBills, setRawBills] = useState<any[]>([]);
  const [rawPayments, setRawPayments] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/invoices').catch(() => []),
      apiFetch('/v1/bills').catch(() => []),
      apiFetch('/v1/payments').catch(() => []),
      apiFetch('/v1/finance/dashboard-snapshot').catch(() => null),
    ]).then(([inv, bl, pay, snap]) => {
      setRawInvoices(Array.isArray(inv) ? inv : []);
      setRawBills(Array.isArray(bl) ? bl : []);
      setRawPayments(Array.isArray(pay) ? pay : []);
      setSnapshot(snap);
    }).finally(() => setLoadingData(false));
  }, []);

  const derived = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
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

    // Invoiced-in-period, keyed by the Overview/This Year/All Time tabs above
    // the Clearance Overview card. Those tabs used to only move an underline â€”
    // the figures under them never changed with the selection.
    const invoicesThisYear = invoices.filter(i => i.date && i.date >= yearStart);
    const invoicedByPeriod = {
      overview: { amount: invoicesThisMonthAmount, count: invoicesThisMonth.length },
      year: { amount: invoicesThisYear.reduce((s, i) => s + i.total, 0), count: invoicesThisYear.length },
      alltime: { amount: totalRevenue, count: invoices.length },
    };

    // Top customers by revenue â€” real substitute for a "top service plans" breakdown
    // that had no equivalent concept anywhere in the real invoice/shipment model.
    const byClient = new Map<string, number>();
    invoices.forEach(i => byClient.set(i.mapped.client || 'Unknown', (byClient.get(i.mapped.client || 'Unknown') || 0) + i.total));
    const topCustomers = Array.from(byClient.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, amt], idx) => ({ name, pct: totalRevenue > 0 ? Math.round((amt / totalRevenue) * 1000) / 10 : 0, color: PLAN_COLORS[idx % PLAN_COLORS.length] }));

    // Recent activity â€” merged real invoice/bill/payment events, not fabricated
    // names. `kind` backs the All/Cancel filter below: 'cancel' only for
    // invoices actually credited and bills actually voided â€” real status
    // fields, not a filter invented to give the toggle something to do.
    const events: { name: string; action: string; time: string; ts: number; color: string; kind: 'all' | 'cancel' }[] = [];
    invoices.forEach(i => {
      if (i.raw.created_at) events.push({ name: i.mapped.client || 'Unknown', action: `was issued invoice ${i.mapped.id}.`, time: timeAgo(i.raw.created_at), ts: new Date(i.raw.created_at).getTime(), color: ACTIVITY_COLORS[0], kind: 'all' });
      if (i.mapped.status === 'Credited') events.push({ name: i.mapped.client || 'Unknown', action: `had invoice ${i.mapped.id} credited.`, time: timeAgo(i.raw.created_at || i.raw.updated_at), ts: new Date(i.raw.updated_at || i.raw.created_at).getTime(), color: ACTIVITY_COLORS[3], kind: 'cancel' });
    });
    bills.forEach(b => {
      if (b.raw.created_at) events.push({ name: b.raw.supplier_name || 'Vendor', action: `billed ${b.raw.bill_number} to this account.`, time: timeAgo(b.raw.created_at), ts: new Date(b.raw.created_at).getTime(), color: ACTIVITY_COLORS[1], kind: 'all' });
      if (b.raw.status === 'VOID') events.push({ name: b.raw.supplier_name || 'Vendor', action: `had bill ${b.raw.bill_number} voided.`, time: timeAgo(b.raw.updated_at || b.raw.created_at), ts: new Date(b.raw.updated_at || b.raw.created_at).getTime(), color: ACTIVITY_COLORS[3], kind: 'cancel' });
    });
    rawPayments.forEach((p: any) => {
      if (p.created_at) events.push({ name: p.client_name || 'Unknown', action: `paid against invoice ${p.invoice_number}.`, time: timeAgo(p.created_at), ts: new Date(p.created_at).getTime(), color: ACTIVITY_COLORS[2], kind: 'all' });
    });
    events.sort((a, b) => b.ts - a.ts);

    return {
      totalRevenue, monthRevenue, weekRevenue, revenueTrendPct,
      totalWithdraw, monthWithdraw, weekWithdraw,
      balance, monthBalance, weekBalance,
      outstandingCount: outstanding.length, outstandingAmount,
      invoicesThisMonthCount: invoicesThisMonth.length, invoicesThisMonthAmount,
      invoicedByPeriod,
      topCustomers, events,
    };
  }, [rawInvoices, rawBills, rawPayments]);

  /* ------------------------------------------
     TOP STAT CARDS
  ------------------------------------------ */
  const metricCards = [
    { title: t('finance.totalRevenue'),       value: fmt(derived.totalRevenue, 'TZS'),  trend: derived.revenueTrendPct, sub1Value: fmt(derived.monthRevenue, 'TZS'),  sub2Value: fmt(derived.weekRevenue, 'TZS'), barHighlight: 'var(--purple)' },
    { title: t('finance.totalDisbursements'), value: fmt(derived.totalWithdraw, 'TZS'), sub1Value: fmt(derived.monthWithdraw, 'TZS'), sub2Value: fmt(derived.weekWithdraw, 'TZS'),    barHighlight: 'var(--red)', invertTrend: true },
    // Real GL cash balance (account 1010/1001), not the naive
    // invoiced-minus-billed subtraction the old "Balance in Account" card
    // used â€” that number never reflected actual cash received or paid.
    { title: 'Cash & Bank', icon: 'wallet' as const, value: fmt(snapshot?.cash?.total ?? 0, 'TZS'), sub1Label: 'TZS BANK', sub1Value: fmt(snapshot?.cash?.tzs ?? 0, 'TZS'), sub2Label: snapshot?.cash?.usd ? 'USD BANK' : 'CASH ON HAND', sub2Value: fmt(snapshot?.cash?.usd || snapshot?.cash?.onHand || 0, snapshot?.cash?.usd ? 'USD' : 'TZS'), barHighlight: 'var(--blue)' },
  ];

  if (loadingData) return <SkeletonPage variant="dashboard" />;

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
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{t('finance.clearanceOverview')}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>
              {t('finance.revenueOverviewOf')}{' '}
              <span
                role="link"
                tabIndex={0}
                onClick={() => navigate('/clearos/ops')}
                onKeyDown={e => { if (e.key === 'Enter') navigate('/clearos/ops'); }}
                style={{ color: 'var(--teal)', fontWeight: 600, cursor: 'pointer' }}
              >
                {t('finance.allShipments')}
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
              {(['overview', 'year', 'alltime'] as const).map((tabKey, i) => {
                const labels = [t('finance.tabOverview'), t('finance.tabThisYear'), t('finance.tabAllTime')];
                return (
                  <button key={tabKey} onClick={() => setOverviewTab(tabKey)} style={{ padding: 'var(--ds-btn-py-sm) 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', color: overviewTab === tabKey ? 'var(--teal)' : 'var(--ink3)', borderBottom: overviewTab === tabKey ? '2px solid var(--teal)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.12s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
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

            {/* Invoiced in period â€” reflects the Overview/This Year/All Time
                tabs above. Those tabs used to only move the underline; the
                figures underneath never changed with the selection. */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Invoiced {overviewTab === 'overview' ? 'This Month' : overviewTab === 'year' ? 'This Year' : 'All Time'}
              </div>
              <div style={{ display: 'flex', gap: 28 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.5px' }}>{fmt(derived.invoicedByPeriod[overviewTab].amount, 'TZS')}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>{t('finance.amount')}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                    {derived.invoicedByPeriod[overviewTab].count}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.05em', marginTop: 2 }}>invoices</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Customers by Revenue */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Top Customers</div>
              <button
                type="button"
                title="View all customers"
                onClick={() => navigate('/crm/customers')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0, marginTop: 2 }}
              >
                <Icon name="moreHorizontal" size={16} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
              </button>
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
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{t('finance.recentActivities')}</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'cancel'] as const).map(f => (
                  <button key={f} onClick={() => setActFilter(f)} style={{ padding: 'var(--ds-btn-py-xs) 11px', border: 'none', borderRadius: 20, background: actFilter === f ? 'var(--navy)' : 'transparent', color: actFilter === f ? '#fff' : 'var(--ink3)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    {f === 'all' ? t('finance.all') : t('finance.cancel')}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
              {(() => {
                const filteredActivities = (actFilter === 'cancel' ? derived.events.filter(e => e.kind === 'cancel') : derived.events).slice(0, 5);
                return filteredActivities.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                    {actFilter === 'cancel' ? 'No credited invoices or voided bills' : 'No recent activity'}
                  </div>
                ) : filteredActivities.map((act, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < filteredActivities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <CompanyAvatar name={act.name} size={38} shape="circle" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{act.name}</span>
                      <span style={{ color: 'var(--ink2)', fontWeight: 400 }}> {act.action}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{act.time}</div>
                  </div>
                </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* -- ROW 3: Action Required â€” only the things someone here actually
               has to act on (bills/expenses stuck in an approval queue).
               Rendered only when there's real work waiting, not as a
               permanent empty slot. -- */}
        {(snapshot?.approvals?.billsPendingApproval?.count > 0 || snapshot?.approvals?.expensesPendingApproval?.count > 0) && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            {snapshot.approvals.billsPendingApproval.count > 0 && (
              <div onClick={() => navigate('/finance/bills')} style={{ flex: '1 1 260px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 9, padding: '14px 16px' }}>
                <Icon name="clock" size={18} strokeWidth={1.75} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{snapshot.approvals.billsPendingApproval.count} bill{snapshot.approvals.billsPendingApproval.count !== 1 ? 's' : ''} awaiting approval</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmt(snapshot.approvals.billsPendingApproval.amount, 'TZS')} held from posting</div>
                </div>
                <Icon name="chevronRight" size={16} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
              </div>
            )}
            {snapshot.approvals.expensesPendingApproval.count > 0 && (
              <div onClick={() => navigate('/finance/expenses')} style={{ flex: '1 1 260px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 9, padding: '14px 16px' }}>
                <Icon name="clock" size={18} strokeWidth={1.75} style={{ color: 'var(--gold)', flexShrink: 0 } as React.CSSProperties} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{snapshot.approvals.expensesPendingApproval.count} expense claim{snapshot.approvals.expensesPendingApproval.count !== 1 ? 's' : ''} awaiting approval</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmt(snapshot.approvals.expensesPendingApproval.amount, 'TZS')} held from posting</div>
                </div>
                <Icon name="chevronRight" size={16} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
              </div>
            )}
          </div>
        )}

        {/* -- ROW 4: Receivables & Payables + This Month P&L -- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Receivables & Payables */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)' }}>
            <SHdr title="Receivables & Payables" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div onClick={() => navigate('/finance/accounts/aged-receivables')} style={{ cursor: 'pointer', padding: '12px 14px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Outstanding AR</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.3px' }}>{fmt(snapshot?.receivables?.total ?? 0, 'TZS')}</div>
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{fmt(snapshot?.receivables?.overdue ?? 0, 'TZS')} overdue Â· {snapshot?.receivables?.count ?? 0} invoices</div>
              </div>
              <div onClick={() => navigate('/finance/accounts/aged-payables')} style={{ cursor: 'pointer', padding: '12px 14px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Outstanding AP</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.3px' }}>{fmt(snapshot?.payables?.total ?? 0, 'TZS')}</div>
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{fmt(snapshot?.payables?.overdue ?? 0, 'TZS')} overdue Â· {snapshot?.payables?.count ?? 0} bills</div>
              </div>
            </div>
          </div>

          {/* This Month P&L */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)' }}>
            <SHdr title="This Month â€” Profit & Loss" action="Full report" onAction={() => navigate('/finance/accounts/profit-loss')} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <StatTile label="Revenue" value={fmt(snapshot?.profitLoss?.month?.revenue ?? 0, 'TZS')} />
              <StatTile label="Expenses" value={fmt(snapshot?.profitLoss?.month?.expenses ?? 0, 'TZS')} />
              <StatTile label="Net" value={fmt(snapshot?.profitLoss?.month?.net ?? 0, 'TZS')} tone={(snapshot?.profitLoss?.month?.net ?? 0) >= 0 ? 'good' : 'warning'} />
            </div>
          </div>
        </div>

        {/* -- ROW 5: Tax & Compliance snapshot â€” the real numbers behind
               WHT/CIT/deferred tax have never had a dedicated page anywhere
               in the app; this is the first place a user can see them at
               all. Deferred tax is explicitly labelled to its actual scope
               (fixed-asset timing differences only), not shown as if it
               were the whole deferred-tax picture. -- */}
        <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)', marginBottom: 16 }}>
          <SHdr title="Tax & Compliance" action="VAT periods" onAction={() => navigate('/finance/vat-periods')} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile
              label="VAT â€” open period"
              value={snapshot?.tax?.vat ? (snapshot.tax.vat.netPayable != null ? fmt(snapshot.tax.vat.netPayable, 'TZS') : 'Unable to compute') : 'No open period'}
              sub={snapshot?.tax?.vat ? `${fmtDate(snapshot.tax.vat.periodStart)} â€“ ${fmtDate(snapshot.tax.vat.periodEnd)}` : undefined}
              tone={snapshot?.tax?.vat?.netPayable > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label="Withholding Tax Payable"
              value={fmt(snapshot?.tax?.wht?.payable ?? 0, 'TZS')}
              sub="Withheld, not yet remitted to TRA"
              tone={(snapshot?.tax?.wht?.payable ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label="Corporate Income Tax Payable"
              value={fmt(snapshot?.tax?.cit?.payable ?? 0, 'TZS')}
              sub={snapshot?.tax?.cit?.latestReturn ? `${snapshot.tax.cit.latestReturn.ratePct}% Â· ${snapshot.tax.cit.latestReturn.status} return to ${fmtDate(snapshot.tax.cit.latestReturn.periodEnd)}` : 'No return computed yet'}
              tone={(snapshot?.tax?.cit?.payable ?? 0) > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label={(snapshot?.tax?.deferredTax?.netLiability ?? 0) >= 0 ? 'Deferred Tax Liability' : 'Deferred Tax Asset'}
              value={fmt(Math.abs(snapshot?.tax?.deferredTax?.netLiability ?? 0), 'TZS')}
              sub="Fixed-asset timing differences only, as of most recent compute"
            />
          </div>
        </div>

        {/* -- ROW 6: Top Customers + Fixed Assets / Period Close footer -- */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: 16 }}>

          {/* Top Customers by Revenue */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '18px 20px', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Top Customers</div>
              <button
                type="button"
                title="View all customers"
                onClick={() => navigate('/crm/customers')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0, marginTop: 2 }}
              >
                <Icon name="moreHorizontal" size={16} strokeWidth={1.75} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
              </button>
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

          {/* Fixed Assets + Period Close */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div onClick={() => navigate('/finance/accounts/fixed-assets')} style={{ cursor: 'pointer', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="package" size={17} strokeWidth={1.75} style={{ color: 'var(--teal)' } as React.CSSProperties} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{snapshot?.fixedAssets?.activeCount ?? 0} active fixed assets</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{fmt(snapshot?.fixedAssets?.totalCost ?? 0, 'TZS')} total cost</div>
              </div>
              <Icon name="chevronRight" size={15} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
            </div>
            <div onClick={() => navigate('/finance/accounts/gl-periods')} style={{ cursor: 'pointer', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px', boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="lock" size={16} strokeWidth={1.75} style={{ color: 'var(--blue)' } as React.CSSProperties} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{snapshot?.glPeriod ? `${snapshot.glPeriod.name} closed` : 'No period closed yet'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{snapshot?.glPeriod ? fmtDate(snapshot.glPeriod.closedAt) : 'Close a period once its books are final'}</div>
              </div>
              <Icon name="chevronRight" size={15} style={{ color: 'var(--ink3)' } as React.CSSProperties} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
