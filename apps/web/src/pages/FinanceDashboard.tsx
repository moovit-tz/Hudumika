import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FinanceDashboardSnapshot } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Banner } from '../components/ui/alert.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Icon } from '../components/Icon.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu.js';
import './FinanceDashboard.css';

export function FinanceDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<FinanceDashboardSnapshot>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [periodTab, setPeriodTab] = useState<'month' | 'ytd'>('month');
  const { isEnabled } = useFinanceCapabilities();

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    apiFetch<FinanceDashboardSnapshot>('/v1/finance/dashboard-snapshot')
      .then(result => {
        if (live) setData(result);
      })
      .catch(err => {
        if (live) {
          setData(undefined);
          setError(err instanceof Error ? err.message : 'Unable to load finance dashboard.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);

  if (loading) {
    return <SkeletonPage variant="dashboard" />;
  }

  const currency = data?.currency || 'TZS';
  const money = (value: number | undefined) =>
    new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value ?? 0);

  // Profit & Loss Performance Metrics
  const monthRevenue = data?.profitLoss.month.revenue ?? 0;
  const monthExpenses = data?.profitLoss.month.expenses ?? 0;
  const monthNet = data?.profitLoss.month.net ?? 0;
  const monthMarginPct = monthRevenue > 0 ? ((monthNet / monthRevenue) * 100).toFixed(1) : '0.0';
  const monthExpPct = monthRevenue > 0 ? Math.min(100, Math.round((monthExpenses / monthRevenue) * 100)) : 0;

  const ytdRevenue = data?.profitLoss.ytd.revenue ?? 0;
  const ytdExpenses = data?.profitLoss.ytd.expenses ?? 0;
  const ytdNet = data?.profitLoss.ytd.net ?? 0;
  const ytdMarginPct = ytdRevenue > 0 ? ((ytdNet / ytdRevenue) * 100).toFixed(1) : '0.0';
  const ytdExpPct = ytdRevenue > 0 ? Math.min(100, Math.round((ytdExpenses / ytdRevenue) * 100)) : 0;

  // Active view metrics based on selected tab
  const activeRev = periodTab === 'month' ? monthRevenue : ytdRevenue;
  const activeExp = periodTab === 'month' ? monthExpenses : ytdExpenses;
  const activeNet = periodTab === 'month' ? monthNet : ytdNet;
  const activeMargin = periodTab === 'month' ? monthMarginPct : ytdMarginPct;

  // Multi-Currency Cash Distribution
  const totalCash = data?.cash.total ?? 0;
  const cashTzs = data?.cash.tzs ?? 0;
  const cashUsd = data?.cash.usd ?? 0;
  const cashOnHand = data?.cash.onHand ?? 0;

  const tzsPct = totalCash > 0 ? Math.max(4, Math.round((cashTzs / totalCash) * 100)) : 33;
  const usdPct = totalCash > 0 ? Math.max(4, Math.round((cashUsd / totalCash) * 100)) : 33;
  const onHandPct = totalCash > 0 ? Math.max(4, Math.round((cashOnHand / totalCash) * 100)) : 34;

  // Working Capital & Aging
  const receivablesTotal = data?.receivables.total ?? 0;
  const receivablesOverdue = data?.receivables.overdue ?? 0;
  const receivablesCount = data?.receivables.count ?? 0;
  const arOverduePct = receivablesTotal > 0 ? Math.round((receivablesOverdue / receivablesTotal) * 100) : 0;

  const payablesTotal = data?.payables.total ?? 0;
  const payablesOverdue = data?.payables.overdue ?? 0;
  const payablesCount = data?.payables.count ?? 0;
  const apOverduePct = payablesTotal > 0 ? Math.round((payablesOverdue / payablesTotal) * 100) : 0;

  const netWorkingCapital = receivablesTotal - payablesTotal;
  const liquidityRatio = payablesTotal > 0 ? (totalCash / payablesTotal).toFixed(1) + 'x' : '100%';

  // Approvals
  const billsPendingCount = data?.approvals.billsPendingApproval.count ?? 0;
  const billsPendingAmount = data?.approvals.billsPendingApproval.amount ?? 0;
  const expensesPendingCount = data?.approvals.expensesPendingApproval.count ?? 0;
  const expensesPendingAmount = data?.approvals.expensesPendingApproval.amount ?? 0;
  const totalApprovalsCount = billsPendingCount + expensesPendingCount;
  const totalApprovalsAmount = billsPendingAmount + expensesPendingAmount;

  return (
    <div className="fin-dashboard">
      <PageHeader
        crumbs={['Finance', 'Dashboard']}
        titlePlain="Finance"
        titleEm="intelligence"
        subtitle={
          data
            ? `Posted accounting records synced as of ${data.asOf}. All reporting figures in ${data.currency}.`
            : 'Review recorded financial balances, cash liquidity, and pending approvals.'
        }
        actions={
          <div className="fin-header-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default">
                  <Icon name="plus" size={14} />
                  <span>New Transaction</span>
                  <Icon name="chevronDown" size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/finance/invoices">
                    <Icon name="invoice" size={15} />
                    <span>Create Customer Invoice</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/finance/quotations">
                    <Icon name="fileText" size={15} />
                    <span>Create Commercial Quote</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/finance/bills">
                    <Icon name="receipt" size={15} />
                    <span>Record Supplier Bill</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/finance/expenses">
                    <Icon name="creditCard" size={15} />
                    <span>Record Operating Expense</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/finance/accounts/bank-reconciliation">
                    <Icon name="refresh" size={15} />
                    <span>Reconcile Bank Statement</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isEnabled('finance.pos') && (
              <Button asChild variant="outline">
                <Link to="/finance/pos">
                  <Icon name="shoppingCart" size={14} />
                  <span>POS Counter</span>
                </Link>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setRevision(v => v + 1)}
              title="Refresh financial data"
            >
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {error && (
        <Banner variant="error" onDismiss={() => setError('')}>
          <div className="fin-error-banner-content">
            <span>{error} — Balances are temporarily unavailable. Retry before making financial decisions.</span>
            <Button size="sm" variant="outline" onClick={() => setRevision(v => v + 1)}>
              Retry Sync
            </Button>
          </div>
        </Banner>
      )}

      {data && (
        <>
          {/* ── 1. Hero Treasury Command Banner ── */}
          <div className="fin-hero-banner">
            <div className="fin-hero-main">
              <div className="fin-hero-header">
                <div className="fin-hero-tag">
                  <Icon name="shield" size={13} />
                  <span>Treasury & Liquidity Desk</span>
                </div>
                <div className="fin-hero-sync">
                  <Icon name="clock" size={13} />
                  <span>Synced {data.asOf}</span>
                </div>
              </div>

              <div className="fin-hero-liquidity">
                <span className="fin-hero-liquidity-label">Total Cash Liquidity</span>
                <div className="fin-hero-liquidity-value">
                  <span>{money(totalCash)}</span>
                  <span className="fin-hero-currency-tag">{currency} Holdings</span>
                </div>
              </div>

              {/* Multi-Currency Cash Distribution Bar */}
              <div className="fin-currency-distribution">
                <div className="fin-dist-meter" title="Cash Liquidity Distribution">
                  <div className="fin-dist-seg fin-dist-seg--tzs" style={{ width: `${tzsPct}%` }} title={`TZS: ${tzsPct}%`} />
                  <div className="fin-dist-seg fin-dist-seg--usd" style={{ width: `${usdPct}%` }} title={`USD: ${usdPct}%`} />
                  <div className="fin-dist-seg fin-dist-seg--onhand" style={{ width: `${onHandPct}%` }} title={`On Hand: ${onHandPct}%`} />
                </div>

                <div className="fin-currency-chips">
                  <div className="fin-currency-chip">
                    <span className="fin-currency-dot fin-currency-dot--tzs" />
                    <span>TZS Accounts:</span>
                    <strong>{money(cashTzs)}</strong>
                    <span className="fin-currency-pct">({tzsPct}%)</span>
                  </div>
                  <div className="fin-currency-chip">
                    <span className="fin-currency-dot fin-currency-dot--usd" />
                    <span>USD Equivalents:</span>
                    <strong>{money(cashUsd)}</strong>
                    <span className="fin-currency-pct">({usdPct}%)</span>
                  </div>
                  <div className="fin-currency-chip">
                    <span className="fin-currency-dot fin-currency-dot--onhand" />
                    <span>Petty Cash / Till:</span>
                    <strong>{money(cashOnHand)}</strong>
                    <span className="fin-currency-pct">({onHandPct}%)</span>
                  </div>
                </div>
              </div>

              <div className="fin-hero-actions">
                <Button asChild variant="outline" size="sm">
                  <Link to="/finance/accounts/bank-reconciliation">
                    <Icon name="checkCircle" size={14} />
                    <span>Bank Reconciliation</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/finance/reports/cash-flow">
                    <Icon name="trendingUp" size={14} />
                    <span>Cash Flow</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/finance/accounts/balance-sheet">
                    <Icon name="layers" size={14} />
                    <span>Balance Sheet</span>
                  </Link>
                </Button>
              </div>
            </div>

            {/* Hero Right: Working Capital & Liquidity Barometer */}
            <div className="fin-hero-barometer">
              <div className="fin-barometer-header">
                <span className="fin-barometer-title">Working Capital Coverage</span>
                <Badge variant={netWorkingCapital >= 0 ? 'gray' : 'error'}>
                  {netWorkingCapital >= 0 ? 'Sufficient Capital' : 'Capital Deficit'}
                </Badge>
              </div>

              <div className="fin-barometer-metrics">
                <div className="fin-barometer-tile">
                  <span>Net Working Capital</span>
                  <strong>{money(netWorkingCapital)}</strong>
                </div>
                <div className="fin-barometer-tile">
                  <span>Liquidity Ratio</span>
                  <strong>{liquidityRatio}</strong>
                </div>
              </div>

              <div className="fin-barometer-breakdown">
                <div className="fin-barometer-row">
                  <span>Receivables vs Payables Gap:</span>
                  <strong>{money(Math.abs(netWorkingCapital))}</strong>
                </div>
                <div className="fin-barometer-row">
                  <span>Overdue Capital Exposure:</span>
                  <strong className={receivablesOverdue + payablesOverdue > 0 ? 'fin-text-risk' : 'fin-text-muted'}>
                    {money(receivablesOverdue + payablesOverdue)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Top Executive KPI Metric Cards (4 Columns) ── */}
          <div className="fin-kpi-grid">
            {/* KPI 1: Monthly Revenue & Net Result */}
            <div className="fin-kpi-card">
              <div className="fin-kpi-top">
                <div className="fin-kpi-identity">
                  <span className="fin-kpi-label">Revenue This Month</span>
                  <div className="fin-kpi-value">{money(monthRevenue)}</div>
                </div>
                <FeaturedIcon variant="gray" size="sm">
                  <Icon name="trendingUp" size={16} />
                </FeaturedIcon>
              </div>

              <div className="fin-kpi-middle">
                <div className="fin-kpi-subline">
                  <span className="fin-kpi-sublabel">Net Margin</span>
                  <Badge variant={monthNet >= 0 ? 'brand' : 'error'}>
                    {monthNet >= 0 ? `+${monthMarginPct}% Net` : `${monthMarginPct}% Loss`}
                  </Badge>
                </div>
                <div className="fin-kpi-meter-bar" title={`Net Result: ${money(monthNet)}`}>
                  <div
                    className="fin-kpi-meter-fill fin-kpi-meter-fill--brand"
                    style={{
                      width: `${Math.min(100, Math.max(8, 100 - monthExpPct))}%`
                    }}
                  />
                </div>
              </div>

              <div className="fin-kpi-bottom">
                <span>Net: <strong>{money(monthNet)}</strong></span>
                <Link to="/finance/accounts/profit-loss" className="fin-kpi-link">
                  <span>P&L Report</span>
                  <Icon name="arrowRight" size={12} />
                </Link>
              </div>
            </div>

            {/* KPI 2: YTD Cumulative Performance */}
            <div className="fin-kpi-card">
              <div className="fin-kpi-top">
                <div className="fin-kpi-identity">
                  <span className="fin-kpi-label">Year to Date Revenue</span>
                  <div className="fin-kpi-value">{money(ytdRevenue)}</div>
                </div>
                <FeaturedIcon variant="gray" size="sm">
                  <Icon name="barChart" size={16} />
                </FeaturedIcon>
              </div>

              <div className="fin-kpi-middle">
                <div className="fin-kpi-subline">
                  <span className="fin-kpi-sublabel">Operating Net</span>
                  <Badge variant={ytdNet >= 0 ? 'brand' : 'error'}>
                    {ytdNet >= 0 ? `+${ytdMarginPct}% YTD` : `${ytdMarginPct}% YTD`}
                  </Badge>
                </div>
                <div className="fin-kpi-meter-bar" title={`YTD Net: ${money(ytdNet)}`}>
                  <div
                    className="fin-kpi-meter-fill fin-kpi-meter-fill--neutral"
                    style={{
                      width: `${Math.min(100, Math.max(8, 100 - ytdExpPct))}%`
                    }}
                  />
                </div>
              </div>

              <div className="fin-kpi-bottom">
                <span>Net: <strong>{money(ytdNet)}</strong></span>
                <Link to="/finance/accounts/profit-loss" className="fin-kpi-link">
                  <span>Detailed P&L</span>
                  <Icon name="arrowRight" size={12} />
                </Link>
              </div>
            </div>

            {/* KPI 3: Accounts Receivable (AR) */}
            <div className="fin-kpi-card">
              <div className="fin-kpi-top">
                <div className="fin-kpi-identity">
                  <span className="fin-kpi-label">Accounts Receivable</span>
                  <div className="fin-kpi-value">{money(receivablesTotal)}</div>
                </div>
                <FeaturedIcon variant="gray" size="sm">
                  <Icon name="invoice" size={16} />
                </FeaturedIcon>
              </div>

              <div className="fin-kpi-middle">
                <div className="fin-kpi-subline">
                  <span className="fin-kpi-sublabel">{receivablesCount} Debtors</span>
                  <Badge variant={receivablesOverdue > 0 ? 'warning' : 'gray'}>
                    {receivablesOverdue > 0 ? `${money(receivablesOverdue)} Overdue` : 'Current & Clean'}
                  </Badge>
                </div>
                <div className="fin-kpi-meter-bar" title={`Overdue: ${arOverduePct}%`}>
                  <div
                    className={`fin-kpi-meter-fill ${receivablesOverdue > 0 ? 'fin-kpi-meter-fill--warning' : 'fin-kpi-meter-fill--neutral'}`}
                    style={{
                      width: `${Math.max(6, arOverduePct)}%`
                    }}
                  />
                </div>
              </div>

              <div className="fin-kpi-bottom">
                <span>{arOverduePct}% overdue exposure</span>
                <Link to="/finance/accounts/aged-receivables" className="fin-kpi-link">
                  <span>Aged AR</span>
                  <Icon name="arrowRight" size={12} />
                </Link>
              </div>
            </div>

            {/* KPI 4: Accounts Payable (AP) */}
            <div className="fin-kpi-card">
              <div className="fin-kpi-top">
                <div className="fin-kpi-identity">
                  <span className="fin-kpi-label">Accounts Payable</span>
                  <div className="fin-kpi-value">{money(payablesTotal)}</div>
                </div>
                <FeaturedIcon variant="gray" size="sm">
                  <Icon name="receipt" size={16} />
                </FeaturedIcon>
              </div>

              <div className="fin-kpi-middle">
                <div className="fin-kpi-subline">
                  <span className="fin-kpi-sublabel">{payablesCount} Creditors</span>
                  <Badge variant={payablesOverdue > 0 ? 'error' : 'gray'}>
                    {payablesOverdue > 0 ? `${money(payablesOverdue)} Overdue` : 'No Overdue Bills'}
                  </Badge>
                </div>
                <div className="fin-kpi-meter-bar" title={`Overdue: ${apOverduePct}%`}>
                  <div
                    className={`fin-kpi-meter-fill ${payablesOverdue > 0 ? 'fin-kpi-meter-fill--risk' : 'fin-kpi-meter-fill--brand'}`}
                    style={{
                      width: `${Math.max(6, apOverduePct)}%`
                    }}
                  />
                </div>
              </div>

              <div className="fin-kpi-bottom">
                <span>{apOverduePct}% overdue exposure</span>
                <Link to="/finance/accounts/aged-payables" className="fin-kpi-link">
                  <span>Aged AP</span>
                  <Icon name="arrowRight" size={12} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── 3. Middle Section: 2-Column Analytical Studio ── */}
          <div className="fin-studio-grid">
            {/* Left Card: Financial Performance & Margin Analysis */}
            <div className="fin-studio-card">
              <div className="fin-studio-header">
                <div className="fin-studio-header-title">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="barChart" size={16} />
                  </FeaturedIcon>
                  <div>
                    <h3>Income & Operating Margin</h3>
                    <p>Comparison of posted ledger revenues against disbursements.</p>
                  </div>
                </div>

                <div className="fin-period-toggle">
                  <Button
                    size="sm"
                    variant={periodTab === 'month' ? 'default' : 'ghost'}
                    onClick={() => setPeriodTab('month')}
                    className="fin-toggle-btn"
                  >
                    This Month
                  </Button>
                  <Button
                    size="sm"
                    variant={periodTab === 'ytd' ? 'default' : 'ghost'}
                    onClick={() => setPeriodTab('ytd')}
                    className="fin-toggle-btn"
                  >
                    Year to Date
                  </Button>
                </div>
              </div>

              <div className="fin-studio-body">
                {/* 3 Overview Tiles */}
                <div className="fin-pnl-overview">
                  <div className="fin-pnl-tile">
                    <span className="fin-pnl-tile-label">Gross Revenue</span>
                    <strong className="fin-pnl-tile-val">
                      {money(activeRev)}
                    </strong>
                    <span className="fin-pnl-tile-sub">Posted Inflow</span>
                  </div>
                  <div className="fin-pnl-tile">
                    <span className="fin-pnl-tile-label">Operating Expenses</span>
                    <strong className="fin-pnl-tile-val">
                      {money(activeExp)}
                    </strong>
                    <span className="fin-pnl-tile-sub">Ledger Disbursements</span>
                  </div>
                  <div className="fin-pnl-tile">
                    <span className="fin-pnl-tile-label">Net Operating Result</span>
                    <strong className="fin-pnl-tile-val">
                      {money(activeNet)}
                    </strong>
                    <span className="fin-pnl-tile-sub">{activeMargin}% Net Margin</span>
                  </div>
                </div>

                {/* Flow Ratio Track */}
                <div className="fin-flow-bar-container">
                  <div className="fin-flow-bar-header">
                    <span>Revenue vs. Expense Ratio</span>
                    <span>
                      {activeRev > 0 ? `${(100 - Number(activeMargin)).toFixed(0)}% Expense Ratio` : '0%'}
                    </span>
                  </div>
                  <div className="fin-flow-track" title="Revenue vs Expense distribution">
                    <div
                      className="fin-flow-revenue"
                      style={{ width: `${Math.max(15, 100 - (activeRev > 0 ? Math.round((activeExp / activeRev) * 100) : 0))}%` }}
                    />
                    <div
                      className="fin-flow-expense"
                      style={{ width: `${Math.min(85, activeRev > 0 ? Math.round((activeExp / activeRev) * 100) : 0)}%` }}
                    />
                  </div>
                  <div className="fin-flow-legend">
                    <span>
                      <span className="fin-dot-sm fin-dot-sm--brand" />
                      Net Retained Earnings ({money(activeNet)})
                    </span>
                    <span>
                      <span className="fin-dot-sm fin-dot-sm--neutral" />
                      Operating Disbursements ({money(activeExp)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="fin-studio-footer">
                <span className="fin-footer-note">
                  Ledger statements reconciled continuously
                </span>
                <div className="fin-footer-actions">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance/accounts/profit-loss">
                      <Icon name="fileText" size={13} />
                      <span>Profit & Loss</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance/accounts/trial-balance">
                      <Icon name="layers" size={13} />
                      <span>Trial Balance</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Card: Working Capital & Treasury Studio */}
            <div className="fin-studio-card">
              <div className="fin-studio-header">
                <div className="fin-studio-header-title">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="wallet" size={16} />
                  </FeaturedIcon>
                  <div>
                    <h3>Working Capital & Liquidity</h3>
                    <p>Asset coverage, aging risk, and liability obligations.</p>
                  </div>
                </div>
                <Badge variant={netWorkingCapital >= 0 ? 'gray' : 'error'}>
                  {netWorkingCapital >= 0 ? 'Positive Capital' : 'Action Required'}
                </Badge>
              </div>

              <div className="fin-studio-body">
                <div className="fin-working-capital-meter">
                  <div className="fin-wc-row">
                    <div className="fin-wc-left">
                      <FeaturedIcon variant="gray" size="sm">
                        <Icon name="invoice" size={15} />
                      </FeaturedIcon>
                      <div className="fin-wc-copy">
                        <strong>Receivables Outstanding</strong>
                        <span>{receivablesCount} open customer invoices</span>
                      </div>
                    </div>
                    <div className="fin-wc-amount">
                      {money(receivablesTotal)}
                    </div>
                  </div>

                  <div className="fin-wc-row">
                    <div className="fin-wc-left">
                      <FeaturedIcon variant="gray" size="sm">
                        <Icon name="receipt" size={15} />
                      </FeaturedIcon>
                      <div className="fin-wc-copy">
                        <strong>Payables Outstanding</strong>
                        <span>{payablesCount} open vendor bills</span>
                      </div>
                    </div>
                    <div className="fin-wc-amount">
                      {money(payablesTotal)}
                    </div>
                  </div>

                  <div className="fin-wc-row fin-wc-row--summary">
                    <div className="fin-wc-left">
                      <FeaturedIcon variant="gray" size="sm">
                        <Icon name="shield" size={15} />
                      </FeaturedIcon>
                      <div className="fin-wc-copy">
                        <strong>Net Working Capital Gap</strong>
                        <span>Receivables less Payables obligations</span>
                      </div>
                    </div>
                    <div className="fin-wc-amount">
                      {money(netWorkingCapital)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="fin-studio-footer">
                <span className="fin-footer-note">
                  Liquidity coverage ratio: <strong>{liquidityRatio}</strong>
                </span>
                <div className="fin-footer-actions">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance/accounts/aged-receivables">
                      <Icon name="clock" size={13} />
                      <span>Aged AR</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/finance/accounts/aged-payables">
                      <Icon name="clock" size={13} />
                      <span>Aged AP</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── 4. Bottom Section: 3-Column Operational Hub ── */}
          <div className="fin-ops-grid">
            {/* Card 1: Executive Approval Center */}
            <div className="fin-ops-card">
              <div className="fin-ops-card-header">
                <div className="fin-ops-card-title">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="checkCircle" size={16} />
                  </FeaturedIcon>
                  <h3>Approval Queue</h3>
                </div>
                <Badge variant={totalApprovalsCount > 0 ? 'warning' : 'gray'}>
                  {totalApprovalsCount > 0 ? `${totalApprovalsCount} Pending` : 'All Clear'}
                </Badge>
              </div>

              <div className="fin-ops-list">
                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">Supplier Bills</strong>
                    <span className="fin-ops-item-sub">{billsPendingCount} invoices pending review</span>
                  </div>
                  <div className="fin-ops-item-right">
                    <span className="fin-ops-item-amount">{money(billsPendingAmount)}</span>
                    <Button asChild size="sm" variant="outline" className="fin-ops-item-btn">
                      <Link to="/finance/bills">Review</Link>
                    </Button>
                  </div>
                </div>

                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">Expense Claims</strong>
                    <span className="fin-ops-item-sub">{expensesPendingCount} claims awaiting approval</span>
                  </div>
                  <div className="fin-ops-item-right">
                    <span className="fin-ops-item-amount">{money(expensesPendingAmount)}</span>
                    <Button asChild size="sm" variant="outline" className="fin-ops-item-btn">
                      <Link to="/finance/expenses">Review</Link>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="fin-ops-card-actions">
                <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                  <Link to="/finance/bills">
                    <Icon name="receipt" size={13} />
                    <span>Supplier Bills</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                  <Link to="/finance/expenses">
                    <Icon name="creditCard" size={13} />
                    <span>Expenses</span>
                  </Link>
                </Button>
              </div>
            </div>

            {/* Card 2: Fiscal Period & Tax Governance */}
            <div className="fin-ops-card">
              <div className="fin-ops-card-header">
                <div className="fin-ops-card-title">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="calendar" size={16} />
                  </FeaturedIcon>
                  <h3>Period & Tax Controls</h3>
                </div>
                <Badge variant="gray">Fiscal Schedules</Badge>
              </div>

              <div className="fin-ops-list">
                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">General Ledger Period</strong>
                    <span className="fin-ops-item-sub">
                      {data.glPeriod
                        ? `Closed: ${data.glPeriod.name}`
                        : 'Open current accounting period.'}
                    </span>
                  </div>
                  <div className="fin-ops-item-right">
                    <Badge variant="gray">{data.glPeriod ? 'Closed' : 'Open'}</Badge>
                  </div>
                </div>

                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">TRA VAT Return</strong>
                    <span className="fin-ops-item-sub">Monthly input/output VAT schedules</span>
                  </div>
                  <div className="fin-ops-item-right">
                    <Button asChild size="sm" variant="outline" className="fin-ops-item-btn">
                      <Link to="/finance/vat-periods">Prepare</Link>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="fin-ops-card-actions">
                <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                  <Link to="/finance/vat-periods">
                    <Icon name="fileText" size={13} />
                    <span>VAT Schedules</span>
                  </Link>
                </Button>
                {isEnabled('finance.accounting.advanced') && (
                  <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                    <Link to="/finance/accounts/gl-periods">
                      <Icon name="lock" size={13} />
                      <span>Period Close</span>
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Card 3: Bank & Cash Desk Health */}
            <div className="fin-ops-card">
              <div className="fin-ops-card-header">
                <div className="fin-ops-card-title">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="building" size={16} />
                  </FeaturedIcon>
                  <h3>Bank & Statement Feeds</h3>
                </div>
                <Badge variant="gray">Connected</Badge>
              </div>

              <div className="fin-ops-list">
                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">Bank Reconciliation</strong>
                    <span className="fin-ops-item-sub">Match statement entries to ledger</span>
                  </div>
                  <div className="fin-ops-item-right">
                    <Button asChild size="sm" variant="outline" className="fin-ops-item-btn">
                      <Link to="/finance/accounts/bank-reconciliation">Open</Link>
                    </Button>
                  </div>
                </div>

                <div className="fin-ops-item">
                  <div className="fin-ops-item-left">
                    <strong className="fin-ops-item-title">Cash Register / POS Till</strong>
                    <span className="fin-ops-item-sub">On-hand takings: {money(cashOnHand)}</span>
                  </div>
                  <div className="fin-ops-item-right">
                    {isEnabled('finance.pos') ? (
                      <Button asChild size="sm" variant="outline" className="fin-ops-item-btn">
                        <Link to="/finance/pos">Open Till</Link>
                      </Button>
                    ) : (
                      <Badge variant="gray">Standard</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="fin-ops-card-actions">
                <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                  <Link to="/finance/accounts/bank-reconciliation">
                    <Icon name="refresh" size={13} />
                    <span>Bank Feeds</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="fin-btn-flex">
                  <Link to="/finance/accounts/chart-of-accounts">
                    <Icon name="list" size={13} />
                    <span>Chart of Accounts</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* ── 5. Enterprise Workspaces & Commercial Launchpad ── */}
          <div className="fin-launchpad-section">
            <div className="fin-launchpad-header">
              <div>
                <h3>Enterprise Financial Workspaces</h3>
                <p>Direct access to operational accounting desks, customer ledgers, and industry modules.</p>
              </div>
              <Badge variant="gray">Modules</Badge>
            </div>

            <div className="fin-launchpad-grid">
              <Link to="/finance/invoices" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="invoice" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>Invoices & Receivables</strong>
                <p>Draft proforma quotations, issue tax invoices, and track automated payment receipts.</p>
              </Link>

              <Link to="/finance/bills" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="receipt" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>Purchasing & Bills</strong>
                <p>Capture vendor bills, approve expense claims, and track scheduled disbursements.</p>
              </Link>

              <Link to="/finance/accounts/bank-reconciliation" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="building" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>Banking & Statements</strong>
                <p>Reconcile statement lines with auto-match suggestions and statement import uploads.</p>
              </Link>

              <Link to="/finance/industries" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="layers" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>Industry Operating ERP</strong>
                <p>Pre-configured retail POS, wholesale trade desks, manufacturing BOM, and warehousing.</p>
              </Link>

              <Link to="/crm/customers" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="users" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>CRM & Stakeholders</strong>
                <p>Customer accounts, supplier directories, credit limits, and interaction history.</p>
              </Link>

              <Link to="/agentic" className="fin-launchpad-card">
                <div className="fin-launchpad-card-top">
                  <FeaturedIcon variant="gray" size="sm">
                    <Icon name="sparkle" size={16} />
                  </FeaturedIcon>
                  <Icon name="arrowRight" size={14} className="fin-launchpad-arrow" />
                </div>
                <strong>AI Financial Planner</strong>
                <p>Automate ledger classifications, forecast cash flow anomalies, and dispatch reminders.</p>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
