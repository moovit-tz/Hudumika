import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon, type IconName } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { useAuth } from '../hooks/useAuth.js';

/**
 * The index for /finance/reports.
 *
 * `<Route path="reports">` had five children but no `index` element, so
 * /finance/reports matched the parent and rendered nothing at all — a blank
 * page, no title, no controls, while every child route worked fine. Its
 * sibling `<Route path="accounts">` does have an index, which is why that
 * branch never showed the same symptom.
 *
 * Grouped by activity and then by app: a clearance business asks "what did
 * the warehouse earn" and "what is the fleet costing" as often as it asks for
 * a P&L, and those answers live in other apps' records.
 */

type Variant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';

interface ReportLink {
  to: string;
  label: string;
  blurb: string;
  icon: IconName;
  variant: Variant;
  /** Which app owns the underlying records. Shown so it is obvious when a
   *  report reads another app's data rather than FinOps' own. */
  source?: string;
  /** Cross-tenant, dbPlatform-backed pages under HuduBI's SUPER_ADMIN
   *  section — pointless (and misleading) to show a card for these to a
   *  tenant user who will just be bounced by RequireRoles on click. */
  superAdminOnly?: boolean;
}

const STATEMENTS: ReportLink[] = [
  { to: '/finance/accounts/chart-of-accounts', label: 'Chart of Accounts', icon: 'list',
    variant: 'gray',    blurb: 'Every account, its type, and where it sits in the tree.' },
  { to: '/finance/accounts/ledger', label: 'General Ledger', icon: 'fileText',
    variant: 'brand',   blurb: 'Every posting against an account over a period.' },
  { to: '/finance/accounts/trial-balance', label: 'Trial Balance', icon: 'barChart2',
    variant: 'brand',   blurb: 'Debits and credits per account, and whether they agree.' },
  { to: '/finance/accounts/balance-sheet', label: 'Balance Sheet', icon: 'layers',
    variant: 'info',    blurb: 'Assets, liabilities and equity as at a date.' },
  { to: '/finance/accounts/profit-loss', label: 'Profit & Loss', icon: 'trendingUp',
    variant: 'success', blurb: 'Revenue against expenses over a period.' },
  { to: '/finance/accounts/aged-receivables', label: 'Aged Receivables', icon: 'clock',
    variant: 'warning', blurb: 'What customers owe, bucketed by how late it is.' },
  { to: '/finance/accounts/aged-payables', label: 'Aged Payables', icon: 'clock',
    variant: 'error',   blurb: 'What you owe suppliers, bucketed the same way.' },
];

const ACTIVITY: ReportLink[] = [
  { to: '/finance/reports/sales', label: 'Sales', icon: 'invoice',
    variant: 'success', blurb: 'Invoiced revenue by customer and period.' },
  { to: '/finance/reports/expenses', label: 'Expenses', icon: 'creditCard',
    variant: 'error',   blurb: 'Spend by category, supplier and period.' },
  { to: '/finance/reports/income-vs-expenses', label: 'Income vs Expenses', icon: 'barChart2',
    variant: 'brand',   blurb: 'Both sides side by side, month over month.' },
  { to: '/finance/reports/cash-flow', label: 'Cash Flow', icon: 'dollarSign',
    variant: 'info',    blurb: 'Money in, money out, and what it left behind.' },
  { to: '/finance/reports/tax', label: 'Tax / VAT', icon: 'shield',
    variant: 'warning', blurb: 'Output and input VAT for a filing period.' },
];

/**
 * Only routes that exist are listed here — each was confirmed against the
 * shell that mounts it. There is deliberately no card for landed cost or
 * demurrage: both have live APIs returning 200, but nothing posts them to the
 * ledger, so a link would promise a report that does not exist. They are
 * named in the footer instead, so the gap is visible rather than silent.
 */
const CROSS_APP: ReportLink[] = [
  { to: '/seal/metrics', label: 'Warehouse Metrics', icon: 'package',
    variant: 'brand', source: 'SEAL',
    blurb: 'Storage, throughput, and what the bonded warehouse is earning.' },
  { to: '/tracking/analytics', label: 'Fleet Analytics', icon: 'truck',
    variant: 'info', source: 'HuduFreight',
    blurb: 'Utilisation, fuel, and cost per trip.' },
  { to: '/tracking/reports', label: 'Fleet Reports', icon: 'fileText',
    variant: 'info', source: 'HuduFreight',
    blurb: 'Operational reports for vehicles, drivers and maintenance.' },
  { to: '/hudubi/trade-wizard-analytics', label: 'Trade Wizard Analytics', icon: 'search',
    variant: 'gray', source: 'HuduBI', superAdminOnly: true,
    blurb: 'What tenants search for, and the permits it resolves to.' },
];

function Section({ title, hint, items }: { title: string; hint: string; items: ReportLink[] }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '3px 0 0' }}>{hint}</p>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 'var(--content-gap, 16px)',
      }}>
        {items.map(r => (
          <Link
            key={r.to}
            to={r.to}
            className="card card-interactive"
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textDecoration: 'none' }}
          >
            <FeaturedIcon variant={r.variant} size="sm" shape="square">
              <Icon name={r.icon} size={15} strokeWidth={1.75} />
            </FeaturedIcon>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{r.label}</span>
                {r.source && <Badge variant="gray">{r.source}</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 4, lineHeight: 1.5 }}>
                {r.blurb}
              </div>
            </div>
            <Icon name="chevronRight" size={14} color="var(--ink3)" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export const FinanceReportsHub: React.FC = () => {
  const { user } = useAuth();
  const crossApp = CROSS_APP.filter(r => !r.superAdminOnly || user?.role === 'SUPER_ADMIN');

  return (
  <div>
    <PageHeader
      crumbs={['Finance', 'Reports']}
      titlePlain="Financial"
      titleEm="reports"
      subtitle="Statements from the ledger, activity over a period, and the operational reports that live in other apps."
    />

    <Section
      title="Statements"
      hint="Straight from the general ledger — every one reads /v1/finance/* against posted journal entries."
      items={STATEMENTS}
    />
    <Section
      title="Activity"
      hint="What happened across a chosen period, rather than a position at a date."
      items={ACTIVITY}
    />
    <Section
      title="Across the platform"
      hint="Operational reports owned by another app. The badge names which one, so it is clear whose records you are reading."
      items={crossApp}
    />

    <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <FeaturedIcon variant="warning" size="sm" shape="square">
        <Icon name="alertTriangle" size={15} strokeWidth={1.75} />
      </FeaturedIcon>
      <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--ink)' }}>Not yet reportable: landed cost and demurrage.</strong>{' '}
        Both have live APIs and real records, but nothing posts them to the ledger, so they cannot
        appear in a statement or a period report yet. They are named here rather than linked, because
        a card that opened an empty report would be worse than an acknowledged gap.
      </div>
    </div>
  </div>
  );
};
