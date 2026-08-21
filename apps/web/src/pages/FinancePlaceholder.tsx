import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { MetricsRow } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';

const TITLES: Record<string, { title: string; desc: string; iconName: IconName }> = {
  '/finance/payments':        { title: 'Payments',             desc: 'Track and reconcile all incoming and outgoing payments.',    iconName: 'creditCard' },
  '/finance/products':        { title: 'Products & Services',  desc: 'Manage your service catalog and pricing tiers.',             iconName: 'package' },
  '/finance/purchases':       { title: 'Purchases Overview',   desc: 'Summary of all procurement activity and spend analysis.',    iconName: 'shoppingCart' },
  '/finance/bills':           { title: 'Bills',                desc: 'Manage supplier bills, due dates, and payment status.',      iconName: 'receipt' },
  '/finance/suppliers':       { title: 'Suppliers',            desc: 'Maintain your vendor and supplier directory.',               iconName: 'building' },
  '/finance/cash-flow':       { title: 'Cash Flow Manager',    desc: 'Visualize cash inflows and outflows over time.',             iconName: 'activity' },
  '/finance/transactions':    { title: 'Account Transactions', desc: 'Full ledger of all account movements and entries.',          iconName: 'list' },
  '/finance/aged-payables':   { title: 'Aged Payables',        desc: 'Outstanding amounts owed to suppliers, aged by due date.',   iconName: 'clock' },
  '/finance/aged-receivables':{ title: 'Aged Receivables',     desc: 'Outstanding amounts owed by customers, aged by due date.',   iconName: 'clock' },
  '/finance/balance-sheet':   { title: 'Balance Sheet',        desc: 'Snapshot of assets, liabilities, and equity.',              iconName: 'layers' },
  '/finance/pnl':             { title: 'Profit and Loss',      desc: 'Income statement showing revenue, costs, and net income.',   iconName: 'trendingUp' },
  '/finance/sales-tax':       { title: 'Sales Tax Report',     desc: 'VAT/sales tax summary for compliance and filing.',           iconName: 'percent' },
  '/finance/snapshot':        { title: 'Business Snapshot',    desc: 'High-level KPIs and business health indicators.',            iconName: 'barChart' },
};

const DEFAULT = { title: 'Finance Module', desc: 'This module is under construction.', iconName: 'briefcase' as IconName };

export const FinancePlaceholder: React.FC = () => {
  const location = useLocation();
  const meta = TITLES[location.pathname] ?? DEFAULT;

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <Link
            to="/finance"
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink3)', fontFamily: 'var(--font)', padding: 0, textDecoration: 'none' }}
          >
            <Icon name="chevronLeft" size={13} strokeWidth={2} />
            Finance Dashboard
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={meta.iconName} size={22} strokeWidth={2.2} color="var(--teal)" />
            {meta.title}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: '5px 0 0' }}>{meta.desc}</p>
        </div>
      </div>

      {/* Metrics row placeholder */}
      <MetricsRow cards={[
        { title: 'This Month',  value: '—', sub1Label: 'LAST MONTH', sub1Value: '—', sub2Label: 'CHANGE',   sub2Value: '—',  barHighlight: 'var(--blue)' },
        { title: 'This Quarter',value: '—', sub1Label: 'LAST QTR',   sub1Value: '—', sub2Label: 'YTD',      sub2Value: '—', barHighlight: 'var(--green)' },
        { title: 'YTD Total',   value: '—', sub1Label: 'BUDGET',     sub1Value: '—', sub2Label: 'VARIANCE',  sub2Value: '—',  barHighlight: 'var(--gold)' },
      ]} />

      {/* Coming soon card */}
      <div style={{
        background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
        padding: '64px 32px', textAlign: 'center', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 9,
            background: 'var(--teal-l)', border: '1px solid var(--teal-m)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={meta.iconName} size={32} strokeWidth={1.8} color="var(--teal)" />
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>
          {meta.title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 420, margin: '0 auto 28px' }}>
          {meta.desc} This module is currently being built and will be available in an upcoming release.
        </div>
        <Link
          to="/finance"
          style={{
            display: 'inline-block',
            padding: '10px 24px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 13.5, fontWeight: 600,
            fontFamily: 'var(--font)', textDecoration: 'none',
          }}
        >
          Back to Finance Dashboard
        </Link>
      </div>
    </div>
  );
};
