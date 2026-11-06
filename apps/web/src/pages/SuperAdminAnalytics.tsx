import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Card } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import './SuperAdminAnalytics.css';

interface Overview {
  workspaces: { total: number; active_paid: number; free: number; cancelled: number };
  mrr: { mrr_tzs: number; mrr_usd: number; arr_tzs: number; arr_usd: number; by_plan: Array<{ plan: string; count: number; mrr: number; currency: string }> };
  esb: { total_earned: number; total_supplier_cost: number; margin: number; currency: string; by_service: Array<{ service_kind: string; earned: number; supplier_cost: number; operations: number }> };
  support: { total_hours: number; total_cost: number; currency: string; by_category: Array<{ category: string; hours: number; cost: number }> };
  subscriptionMargin: { revenue_tzs: number; included_support_cost_tzs: number; margin_tzs: number; allocation_note: string };
}

interface RetentionCohort { cohort_month: string; signed_up: number; still_active: number; retention_pct: number; immature: boolean }
interface RevenueMonth { month: string; subscription_revenue: number; esb_revenue: number; currency: string }
interface ProviderRow { service_kind: string; total: number; captured: number; failed: number; success_rate: number }
interface ChurnMonth { month: string; new_paid: number; churned: number; upgrades: number; downgrades: number }
interface ActiveAppRow { app_id: string; active_workspaces: number }

function fmt(n: number, currency = 'TZS'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `TZS ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function StatCard({ label, value, badge }: { label: string; value: string; badge?: { text: string; variant: 'brand' | 'success' | 'warning' | 'error' } }) {
  return (
    <Card className="sa-stat-card">
      <span className="sa-stat-label">{label}</span>
      <span className="sa-stat-value">{value}</span>
      {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
    </Card>
  );
}

export function SuperAdminAnalytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [retention, setRetention] = useState<RetentionCohort[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueMonth[] | null>(null);
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [churn, setChurn] = useState<ChurnMonth[] | null>(null);
  const [activeApps, setActiveApps] = useState<ActiveAppRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([
      apiFetch('/v1/superadmin/analytics/overview'),
      apiFetch('/v1/superadmin/analytics/retention'),
      apiFetch('/v1/superadmin/analytics/revenue-timeline'),
      apiFetch('/v1/superadmin/analytics/provider-reliability'),
      apiFetch('/v1/superadmin/analytics/churn'),
      apiFetch('/v1/superadmin/analytics/active-checkpoints'),
    ]).then(([ov, ret, rev, prov, chu, apps]) => {
      if (!live) return;
      setOverview(ov);
      setRetention(Array.isArray(ret) ? ret : []);
      setRevenue(Array.isArray(rev) ? rev : []);
      setProviders(Array.isArray(prov) ? prov : []);
      setChurn(Array.isArray(chu) ? chu : []);
      setActiveApps(Array.isArray(apps) ? apps : []);
    }).catch(e => { if (live) setError(e.message || 'Failed to load analytics'); });
    return () => { live = false; };
  }, []);

  if (error) return <div style={{ padding: 32 }}><p style={{ color: 'var(--red)' }}>{error}</p></div>;
  if (!overview) return <SectionLoading label="Loading commercial analytics…" />;

  const { workspaces, mrr, esb, support, subscriptionMargin } = overview;

  return (
    <div className="sa-analytics">
      <PageHeader
        crumbs={['Admin', 'Analytics']}
        titlePlain="Commercial"
        titleEm="analytics"
        subtitle="Subscription revenue, external-service margins, support costs and tenant retention."
      />

      {/* KPI row */}
      <div className="sa-stat-grid">
        <StatCard label="Paying workspaces" value={String(workspaces.active_paid)} badge={{ text: `${workspaces.total} total`, variant: 'brand' }} />
        <StatCard label="MRR (TZS)" value={fmt(mrr.mrr_tzs)} />
        <StatCard label="MRR (USD)" value={fmt(mrr.mrr_usd, 'USD')} />
        <StatCard label="ARR (TZS)" value={fmt(mrr.arr_tzs)} />
        <StatCard label="ESB margin" value={fmt(esb.margin)} badge={{ text: `${esb.by_service.length} services`, variant: esb.margin > 0 ? 'success' : 'warning' }} />
        <StatCard label="Support cost" value={fmt(support.total_cost)} badge={{ text: `${support.total_hours}h logged`, variant: 'gray' as any }} />
        <StatCard label="Subscription margin (partial)" value={fmt(subscriptionMargin.margin_tzs)} badge={{ text: 'excl. infra cost', variant: 'warning' }} />
      </div>
      <p className="s-fld-hint" style={{ margin: '-8px 2px 16px' }}>{subscriptionMargin.allocation_note}</p>

      {/* MRR by plan */}
      <Card className="sa-analytics-section">
        <h3>MRR by plan</h3>
        <table className="sa-analytics-table">
          <thead><tr><th>Plan</th><th>Tenants</th><th>MRR</th><th>Currency</th></tr></thead>
          <tbody>
            {mrr.by_plan.map(r => (
              <tr key={r.plan}><td>{r.plan}</td><td>{r.count}</td><td>{fmt(r.mrr, r.currency)}</td><td>{r.currency}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Revenue timeline */}
      {revenue && revenue.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>Revenue timeline</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Month</th><th>Subscriptions</th><th>ESB</th><th>Total</th></tr></thead>
            <tbody>
              {revenue.map(r => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{fmt(r.subscription_revenue, r.currency)}</td>
                  <td>{fmt(r.esb_revenue, r.currency)}</td>
                  <td>{fmt(r.subscription_revenue + r.esb_revenue, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ESB by service */}
      {esb.by_service.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>External-service margin</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Service</th><th>Operations</th><th>Earned</th><th>Supplier cost</th><th>Margin</th></tr></thead>
            <tbody>
              {esb.by_service.map(r => (
                <tr key={r.service_kind}>
                  <td>{r.service_kind}</td>
                  <td>{r.operations}</td>
                  <td>{fmt(r.earned)}</td>
                  <td>{fmt(r.supplier_cost)}</td>
                  <td style={{ color: r.earned - r.supplier_cost >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(r.earned - r.supplier_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Support cost by category */}
      {support.by_category.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>Support cost attribution</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Category</th><th>Hours</th><th>Cost</th></tr></thead>
            <tbody>
              {support.by_category.map(r => (
                <tr key={r.category}><td>{r.category.replace(/_/g, ' ')}</td><td>{r.hours}</td><td>{fmt(r.cost)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Retention cohorts */}
      {retention && retention.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>Retention cohorts (30-day window)</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Cohort</th><th>Signed up</th><th>Still active</th><th>Retention</th><th></th></tr></thead>
            <tbody>
              {retention.map(r => (
                <tr key={r.cohort_month}>
                  <td>{r.cohort_month}</td>
                  <td>{r.signed_up}</td>
                  <td>{r.still_active}</td>
                  <td>{r.retention_pct}%</td>
                  <td>{r.immature && <Badge variant="warning">Immature</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Churn / upgrades */}
      {churn && churn.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>New, churned &amp; plan changes</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Month</th><th>New paid</th><th>Churned</th><th>Upgrades</th><th>Downgrades</th></tr></thead>
            <tbody>
              {churn.map(r => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{r.new_paid}</td>
                  <td>{r.churned}</td>
                  <td>{r.upgrades}</td>
                  <td>{r.downgrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="s-fld-hint" style={{ margin: '8px 2px 0' }}>
            New-paid/churned come from subscription_invoices status counts; upgrades/downgrades come from tenant_plan_changes, classified by comparing each change's PLAN_LEVELS.
          </p>
        </Card>
      )}

      {/* Active apps */}
      {activeApps && activeApps.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>Active apps</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>App</th><th>Workspaces with a real activation checkpoint</th></tr></thead>
            <tbody>
              {activeApps.map(r => (
                <tr key={r.app_id}><td>{r.app_id}</td><td>{r.active_workspaces}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Provider reliability */}
      {providers && providers.length > 0 && (
        <Card className="sa-analytics-section">
          <h3>Provider reliability</h3>
          <table className="sa-analytics-table">
            <thead><tr><th>Service</th><th>Total ops</th><th>Captured</th><th>Failed</th><th>Success rate</th></tr></thead>
            <tbody>
              {providers.map(r => (
                <tr key={r.service_kind}>
                  <td>{r.service_kind}</td>
                  <td>{r.total}</td>
                  <td>{r.captured}</td>
                  <td>{r.failed}</td>
                  <td><Badge variant={r.success_rate >= 99 ? 'success' : r.success_rate >= 95 ? 'warning' : 'error'}>{r.success_rate}%</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
