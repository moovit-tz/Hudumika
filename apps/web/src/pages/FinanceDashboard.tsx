import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCurrency } from '../hooks/useCurrency.js';
import { useLocale } from '../hooks/useLocale.js';
import { showAlert } from '../lib/alert.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import type { PosAnalytics } from '@hudumika/types';
import './FinanceDashboard.css';

export const FinanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency, fmtCompact, convert } = useCurrency();
  const { t } = useLocale();
  const { isEnabled } = useFinanceCapabilities();

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [posAnalytics, setPosAnalytics] = useState<PosAnalytics | null>(null);

  const posEnabled = isEnabled('finance.pos');

  useEffect(() => {
    if (!posEnabled) { setPosAnalytics(null); return; }
    let alive = true;
    apiFetch('/v1/finance/pos/analytics')
      .then(result => { if (alive) setPosAnalytics(result as PosAnalytics); })
      .catch(() => { if (alive) setPosAnalytics(null); });
    return () => { alive = false; };
  }, [posEnabled]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/v1/finance/dashboard-snapshot').catch(() => null),
      apiFetch('/v1/petti/wallets').catch(() => []),
      apiFetch('/v1/invoices').catch(() => []),
      apiFetch('/v1/bills').catch(() => []),
      apiFetch('/v1/payments').catch(() => []),
    ]).then(([snap, wal, inv, bl, pay]) => {
      if (alive) {
        setSnapshot(snap);
        setWallets(Array.isArray(wal) ? wal : []);
        setInvoices(Array.isArray(inv) ? inv : []);
        setBills(Array.isArray(bl) ? bl : []);
        setPayments(Array.isArray(pay) ? pay : []);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const derived = useMemo(() => {
    // Each invoice/bill may carry its own currency — always convert to the
    // company's base currency before summing, otherwise a TZS invoice and a
    // USD invoice contribute their raw numbers and the total is meaningless.
    const toBase = (raw: number, c?: string) => convert(raw, c || currency);

    const totalRev = invoices.reduce((s, i) =>
      s + toBase(Number(i.total_amount) || Number(i.total) || 0, i.currency), 0);
    const totalExp = bills.reduce((s, b) =>
      s + toBase(Number(b.total) || 0, b.currency), 0);
    const totalCash = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);

    // Working capital from live invoice/bill state
    const ar = invoices
      .filter(i => ['sent', 'overdue', 'partial'].includes(i.status))
      .reduce((s, i) => s + toBase(Number(i.total_amount) || Number(i.total) || 0, i.currency), 0);
    const overdueAR = invoices
      .filter(i => i.status === 'overdue')
      .reduce((s, i) => s + toBase(Number(i.total_amount) || Number(i.total) || 0, i.currency), 0);
    const ap = bills
      .filter(b => ['received', 'partial'].includes(b.status))
      .reduce((s, b) => s + toBase(Number(b.total) || 0, b.currency), 0);
    const nowPlus7 = new Date(Date.now() + 7 * 86_400_000);
    const apDueSoon = bills
      .filter(b => b.due_date && b.status !== 'paid' && new Date(b.due_date) <= nowPlus7)
      .reduce((s, b) => s + toBase(Number(b.total) || 0, b.currency), 0);

    return {
      consolidatedCash: totalCash,
      freeCashFlow: totalRev - totalExp,
      netMargin: totalRev > 0 ? ((totalRev - totalExp) / totalRev) * 100 : null,
      cashConversion: null as number | null,
      ar,
      overdueAR,
      ap,
      apDueSoon,
    };
  }, [invoices, bills, wallets, currency, convert]);

  const recentTransactions = useMemo(() => payments.slice(0, 5).map((p: any) => {
    const raw = Number(p.amount) || 0;
    const amt = convert(raw, p.currency || currency);
    const isIn = p.direction === 'in' || p.type === 'receipt' || p.payment_type === 'receipt';
    return {
      id: p.reference || (p.id ? p.id.slice(0, 8).toUpperCase() : '—'),
      name: p.customer_name || p.supplier_name || p.party_name || '—',
      desc: p.description || p.notes || '—',
      date: p.created_at
        ? new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        : '—',
      amount: (isIn ? '+' : '−') + fmtCompact(amt),
      type: isIn ? 'in' : 'out',
      badge: p.status === 'settled' || p.status === 'completed' ? 'Settled' : 'Posted',
    };
  }), [payments, currency, convert, fmtCompact]);

  if (loading) return <SkeletonPage variant="dashboard" />;

  const cashFlowData = [
    { m: 'Jan', inPct: 58, outPct: 40 },
    { m: 'Feb', inPct: 62, outPct: 42 },
    { m: 'Mar', inPct: 68, outPct: 45 },
    { m: 'Apr', inPct: 65, outPct: 48 },
    { m: 'May', inPct: 74, outPct: 50 },
    { m: 'Jun', inPct: 78, outPct: 52 },
    { m: 'Jul', inPct: 82, outPct: 56 },
    { m: 'Aug', inPct: 86, outPct: 58 },
    { m: 'Sep', inPct: 88, outPct: 60 },
    { m: 'Oct', inPct: 92, outPct: 62 },
    { m: 'Nov', inPct: 96, outPct: 64 },
    { m: 'Dec', inPct: 100, outPct: 68 },
  ];

  const closeChecklist = [
    { title: 'Revenue recognition', role: 'Controller', status: 'Complete' as const, pct: 100 },
    { title: 'Accrual review', role: 'Accounting Lead', status: 'In review' as const, pct: 65 },
    { title: 'Bank reconciliation', role: 'Treasury Officer', status: 'Complete' as const, pct: 100 },
    { title: 'Expense cut-off & claims', role: 'FP&A Manager', status: 'Pending' as const, pct: 30 },
  ];

  return (
    <div className="vex-finance-root">
      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['Finance', 'Overview']}
        titlePlain="Finance"
        titleEm="overview"
        subtitle={`Good morning, ${user?.name || 'Administrator'} · Real-time liquidity, quality of earnings, and capital control.`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => showAlert('Opening AI Financial Copilot...', { variant: 'success' })}
            >
              <Icon name="sparkle" size={14} /> Finance AI
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/finance/invoices')}
            >
              <Icon name="plus" size={14} /> Create invoice
            </Button>
          </div>
        }
      />

      {/* ── Top Bento Row ── */}
      <div className="vex-top-bento">
        {/* Treasury Control Tower */}
        <div className="vex-treasury-tower">
          <div>
            <div className="vex-tower-header">
              <span className="vex-tower-chip">
                <Icon name="building" size={13} /> Treasury control tower
              </span>
              <span className="vex-tower-sync">Updated 8 min ago</span>
            </div>

            <div className="vex-tower-metric-label">Consolidated cash on hand</div>
            <div className="vex-tower-metric-val">{fmtCompact(derived.consolidatedCash)}</div>
            <div className="vex-tower-metric-badge">
              <Icon name="trendingUp" size={13} /> +8.6% vs plan
            </div>

            <div className="vex-tower-stats-grid">
              <div className="vex-tower-stat-box">
                <div className="vex-tower-stat-lbl">Net margin</div>
                <div className="vex-tower-stat-num">{derived.netMargin != null ? `${derived.netMargin.toFixed(1)}%` : '—'}</div>
              </div>
              <div className="vex-tower-stat-box">
                <div className="vex-tower-stat-lbl">Free cash flow</div>
                <div className="vex-tower-stat-num">{fmtCompact(derived.freeCashFlow)}</div>
              </div>
              <div className="vex-tower-stat-box">
                <div className="vex-tower-stat-lbl">Currency</div>
                <div className="vex-tower-stat-num">{currency}</div>
              </div>
            </div>
          </div>

          <div className="vex-tower-actions">
            <Button
              variant="default"
              size="sm"
              style={{ background: '#ffffff', color: 'var(--teal)', fontWeight: 800 }}
              onClick={() => navigate('/petti')}
            >
              <Icon name="arrowUpRight" size={13} /> Transfer funds
            </Button>
            <Button
              variant="ghost"
              size="sm"
              style={{ color: '#ffffff', border: '1px solid rgba(255,255,255,0.3)' }}
              onClick={() => navigate('/finance/accounts/ledger')}
            >
              Treasury details
            </Button>
          </div>
        </div>

        {/* Account Liquidity Breakdown — from real petty-cash wallets */}
        <div className="vex-liquidity-card">
          {wallets.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
              No wallets configured yet.<br />Create one in Petti.
            </div>
          ) : wallets.map((w: any, i: number) => {
            const bal = Number(w.balance) || 0;
            const pct = derived.consolidatedCash > 0 ? Math.round((bal / derived.consolidatedCash) * 100) : 0;
            const barColors = ['var(--teal)', 'var(--blue)', 'var(--purple)', 'var(--green)', 'var(--gold)'];
            const badgeVariant: 'success' | 'warning' | 'gray' = bal > 0 ? 'success' : bal === 0 ? 'gray' : 'warning';
            return (
              <div key={w.id || i} className="vex-acct-row">
                <div className="vex-acct-header">
                  <span className="vex-acct-name">{w.name || `Wallet ${i + 1}`}</span>
                  <Badge variant={badgeVariant}>{bal > 0 ? 'Funded' : 'Empty'}</Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="vex-acct-amount">{fmtCompact(bal)}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700 }}>{pct}%</span>
                </div>
                <div className="vex-acct-track">
                  <div className="vex-acct-bar" style={{ width: `${pct}%`, background: barColors[i % barColors.length] }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Finance Control Rail */}
        <div className="vex-control-rail">
          <div className="vex-rail-header">
            <div>
              <div className="vex-rail-title">Finance control rail</div>
              <div className="vex-rail-sub">Quality of earnings, liquidity and capital efficiency.</div>
            </div>
            <Icon name="shield" size={16} color="var(--teal)" />
          </div>

          <div className="vex-rail-item">
            <div className="vex-rail-left">
              <div className="vex-rail-icon" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>
                <Icon name="trendingUp" size={16} />
              </div>
              <div>
                <div className="vex-rail-lbl">Free Cash Flow</div>
                <div className="vex-rail-val">{fmtCompact(derived.freeCashFlow)}</div>
              </div>
            </div>
            <Badge variant={derived.freeCashFlow >= 0 ? 'success' : 'error'}>
              {derived.freeCashFlow >= 0 ? 'Positive' : 'Negative'}
            </Badge>
          </div>

          <div className="vex-rail-item">
            <div className="vex-rail-left">
              <div className="vex-rail-icon" style={{ background: 'var(--teal-l)', color: 'var(--teal)' }}>
                <Icon name="percent" size={16} />
              </div>
              <div>
                <div className="vex-rail-lbl">Net Margin</div>
                <div className="vex-rail-val">{derived.netMargin != null ? `${derived.netMargin.toFixed(1)}%` : '—'}</div>
              </div>
            </div>
            <Badge variant={derived.netMargin != null && derived.netMargin >= 0 ? 'brand' : 'gray'}>
              {derived.netMargin != null ? (derived.netMargin >= 0 ? 'Healthy' : 'Loss') : 'No data'}
            </Badge>
          </div>

          <div className="vex-rail-item">
            <div className="vex-rail-left">
              <div className="vex-rail-icon" style={{ background: 'var(--blue-l)', color: 'var(--blue)' }}>
                <Icon name="dollarSign" size={16} />
              </div>
              <div>
                <div className="vex-rail-lbl">Cash Conversion</div>
                <div className="vex-rail-val">{derived.cashConversion != null ? `${derived.cashConversion.toFixed(1)}%` : '—'}</div>
              </div>
            </div>
            <Badge variant="gray">Unavailable</Badge>
          </div>
        </div>
      </div>

      {posEnabled && posAnalytics && (
        <section className="vex-pos-strip" aria-label="Point of sale performance">
          <div className="vex-pos-heading">
            <div className="vex-pos-icon"><Icon name="shoppingCart" size={17} /></div>
            <div><strong>Point of sale</strong><span>Live trading performance for today</span></div>
          </div>
          <div className="vex-pos-stat"><span>Net sales</span><strong>{fmtCompact(posAnalytics.today.revenue)}</strong><small>{posAnalytics.today.sales_count} transactions</small></div>
          <div className="vex-pos-stat"><span>Average sale</span><strong>{fmtCompact(posAnalytics.today.average_sale)}</strong><small>Per completed receipt</small></div>
          <div className="vex-pos-stat"><span>Gross margin</span><strong>{fmtCompact(posAnalytics.today.margin)}</strong><small>After tax and recorded cost</small></div>
          <div className="vex-pos-stat"><span>Leading cashier</span><strong>{posAnalytics.cashiers[0]?.name ?? 'No sales yet'}</strong><small>{posAnalytics.cashiers[0] ? `${posAnalytics.cashiers[0].sales_count} sales · ${fmtCompact(posAnalytics.cashiers[0].revenue)}` : 'Waiting for the first sale'}</small></div>
          <Button variant="outline" size="sm" onClick={() => navigate('/finance/pos')}>Open POS <Icon name="arrowUpRight" size={13} /></Button>
        </section>
      )}

      {/* ── Row 2: Cash-Flow Forecast & AI Signals ── */}
      <div className="vex-row-2">
        {/* Cash-flow Forecast Chart */}
        <SectionCard
          title="Cash-flow forecast"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge variant="success">Trend</Badge>
              <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Relative cash flow trend</span>
            </div>
          }
        >
          <div className="vex-cf-chart-wrap">
            <div className="vex-cf-legend">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--teal)' }} /> Cash in ({currency}K)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#38bdf8' }} /> Cash out ({currency}K)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 2, background: 'var(--gold)' }} /> Forecast cash ({currency}M)
              </span>
            </div>

            <div className="vex-cf-bars-grid">
              {cashFlowData.map(item => (
                <div key={item.m} className="vex-cf-month-col">
                  <div className="vex-cf-bars-pair">
                    <div className="vex-cf-bar-in" style={{ height: `${item.inPct}%` }} title={`In: $${item.inPct * 18}K`} />
                    <div className="vex-cf-bar-out" style={{ height: `${item.outPct}%` }} title={`Out: $${item.outPct * 15}K`} />
                  </div>
                  <span className="vex-cf-month-label">{item.m}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* AI Finance Signals */}
        <SectionCard
          title="AI Finance Signals"
          action={<Badge variant="brand">Live</Badge>}
        >
          <div className="vex-signals-list">
            <div className="vex-signal-card">
              <div className="vex-signal-header">
                <span className="vex-signal-title">
                  <Icon name="dollarSign" size={14} color="var(--green)" /> $96K Collections opportunity
                </span>
                <Badge variant="success">7 invoices</Badge>
              </div>
              <div className="vex-signal-desc">
                AI predicts seven late invoices can be accelerated with automated SMS reminders and Selcom checkout links.
              </div>
            </div>

            <div className="vex-signal-card">
              <div className="vex-signal-header">
                <span className="vex-signal-title">
                  <Icon name="alertTriangle" size={14} color="var(--gold)" /> +11.8% Cloud spend anomaly
                </span>
                <Badge variant="warning">Investigate</Badge>
              </div>
              <div className="vex-signal-desc">
                Inference and edge telematics server costs exceeded budget threshold in East Africa zones.
              </div>
            </div>

            <div className="vex-signal-card">
              <div className="vex-signal-header">
                <span className="vex-signal-title">
                  <Icon name="shield" size={14} color="var(--teal)" /> 94% Cash forecast confidence
                </span>
                <Badge variant="brand">Strong</Badge>
              </div>
              <div className="vex-signal-desc">
                Base-case liquidity remains securely above the 14-month board risk minimum through FY26 Q4.
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => showAlert('Opening AI Financial Copilot drawer...', { variant: 'success' })}
            >
              <Icon name="sparkle" size={13} /> Open Finance Copilot
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* ── Row 3: Working Capital & Spend/Budget Control ── */}
      <div className="vex-row-3">
        {/* Working Capital Intelligence */}
        <SectionCard
          title="Working capital intelligence"
          action={<Icon name="fileText" size={16} color="var(--ink3)" />}
        >
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            Receivables and payables momentum with collection and payment-cycle pressure.
          </div>

          <div style={{ height: 50, display: 'flex', alignItems: 'center', marginTop: 10 }}>
            <svg width="100%" height="40" viewBox="0 0 400 40">
              <path d="M 0 25 Q 100 10 200 18 T 400 12" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeDasharray="4 4" />
              <path d="M 0 35 Q 100 20 200 28 T 400 22" fill="none" stroke="var(--teal)" strokeWidth="2.5" />
            </svg>
          </div>

          <div className="vex-wc-kpis">
            <div className="vex-wc-kpi-card">
              <div className="vex-wc-kpi-badge">Receivables</div>
              <div className="vex-wc-kpi-val">{fmtCompact(derived.ar)}</div>
              <div className="vex-wc-kpi-sub">Open invoices</div>
            </div>
            <div className="vex-wc-kpi-card">
              <div className="vex-wc-kpi-badge" style={{ color: 'var(--red)' }}>Overdue A/R</div>
              <div className="vex-wc-kpi-val">{fmtCompact(derived.overdueAR)}</div>
              <div className="vex-wc-kpi-sub">{derived.ar > 0 ? `${Math.round((derived.overdueAR / derived.ar) * 100)}% of A/R` : '—'}</div>
            </div>
            <div className="vex-wc-kpi-card">
              <div className="vex-wc-kpi-badge">Payables</div>
              <div className="vex-wc-kpi-val">{fmtCompact(derived.ap)}</div>
              <div className="vex-wc-kpi-sub">Open bills</div>
            </div>
            <div className="vex-wc-kpi-card">
              <div className="vex-wc-kpi-badge" style={{ color: 'var(--gold)' }}>Due in 7 days</div>
              <div className="vex-wc-kpi-val">{fmtCompact(derived.apDueSoon)}</div>
              <div className="vex-wc-kpi-sub">{derived.ap > 0 ? `${Math.round((derived.apDueSoon / derived.ap) * 100)}% of A/P` : '—'}</div>
            </div>
          </div>
        </SectionCard>

        {/* Spend & Budget Control */}
        <SectionCard
          title="Spend & budget control"
          action={<Button variant="ghost" size="xs" onClick={() => navigate('/finance/budgets')}>Set budgets</Button>}
        >
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
            Bill expense distribution by category this period.
          </div>

          {bills.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              No bills recorded yet.
            </div>
          ) : (() => {
            const catTotals: Record<string, number> = {};
            bills.forEach((b: any) => {
              const cat = b.category || b.bill_category || 'Uncategorised';
              catTotals[cat] = (catTotals[cat] || 0) + (convert(Number(b.total) || 0, b.currency || currency));
            });
            const total = Object.values(catTotals).reduce((s, v) => s + v, 0);
            const barColors = ['var(--teal)', 'var(--gold)', 'var(--blue)', 'var(--green)', 'var(--purple)'];
            return Object.entries(catTotals)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([cat, amt], i) => {
                const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
                return (
                  <div key={cat} className="vex-budget-row">
                    <div className="vex-budget-header">
                      <span className="vex-budget-name">{cat}</span>
                      <span className="vex-budget-caps">{fmtCompact(amt)} <span className="vex-budget-pct">({pct}%)</span></span>
                    </div>
                    <div className="vex-acct-track">
                      <div className="vex-acct-bar" style={{ width: `${pct}%`, background: barColors[i % barColors.length] }} />
                    </div>
                  </div>
                );
              });
          })()}
        </SectionCard>
      </div>

      {/* ── Row 4: Recent Cash Activity & Month-End Close Readiness ── */}
      <div className="vex-row-4">
        {/* Recent Cash Activity */}
        <SectionCard
          title="Recent cash activity"
          action={
            <Button variant="ghost" size="xs" onClick={() => navigate('/finance/accounts/ledger')}>
              View ledger
            </Button>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="vex-activity-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Counterparty</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'var(--ink3)' }}>{t.id}</td>
                    <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{t.name}</td>
                    <td style={{ color: 'var(--ink2)', fontSize: 12 }}>{t.desc}</td>
                    <td style={{ color: 'var(--ink3)' }}>{t.date}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font)',
                        fontWeight: 800,
                        color: t.type === 'in' ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {t.amount}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge variant={t.badge === 'Settled' ? 'success' : 'brand'}>{t.badge}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Month-End Close Readiness */}
        <SectionCard
          title="Month-end close readiness"
          action={<Icon name="checkCircle" size={16} color="var(--teal)" />}
        >
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 10 }}>
            Controller checklist and August close progress.
          </div>

          {closeChecklist.map(item => (
            <div key={item.title} className="vex-close-item">
              <div className="vex-close-left">
                <span className="vex-close-name">{item.title}</span>
                <span className="vex-close-owner">{item.role}</span>
              </div>
              <Badge variant={item.status === 'Complete' ? 'success' : item.status === 'In review' ? 'brand' : 'warning'}>
                {item.status}
              </Badge>
            </div>
          ))}

          <div className="vex-alert-callout">
            <span className="vex-alert-title">
              <Icon name="alertTriangle" size={14} color="var(--gold)" /> 2 close items need attention
            </span>
            <span className="vex-alert-body">
              Accrual review and expense cut-off remain the only material blockers before controller sign-off.
            </span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
