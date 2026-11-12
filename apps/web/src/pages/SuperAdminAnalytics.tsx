import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import './SuperAdminAnalytics.css';
import './OndiPages.css';

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

export function SuperAdminAnalytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [retention, setRetention] = useState<RetentionCohort[] | null>(null);
  const [revenue, setRevenue] = useState<RevenueMonth[] | null>(null);
  const [providers, setProviders] = useState<ProviderRow[] | null>(null);
  const [churn, setChurn] = useState<ChurnMonth[] | null>(null);
  const [activeApps, setActiveApps] = useState<ActiveAppRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compactRows, setCompactRows] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, ret, rev, prov, chu, apps] = await Promise.all([
        apiFetch('/v1/superadmin/analytics/overview'),
        apiFetch('/v1/superadmin/analytics/retention'),
        apiFetch('/v1/superadmin/analytics/revenue-timeline'),
        apiFetch('/v1/superadmin/analytics/provider-reliability'),
        apiFetch('/v1/superadmin/analytics/churn'),
        apiFetch('/v1/superadmin/analytics/active-checkpoints'),
      ]);
      setOverview(ov);
      setRetention(Array.isArray(ret) ? ret : []);
      setRevenue(Array.isArray(rev) ? rev : []);
      setProviders(Array.isArray(prov) ? prov : []);
      setChurn(Array.isArray(chu) ? chu : []);
      setActiveApps(Array.isArray(apps) ? apps : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (error && !overview) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'var(--red)', fontWeight: 600 }}>{error}</p>
        <Button variant="outline" size="sm" onClick={loadAnalytics} className="mt-3 gap-1.5">
          <Icon name="refresh" size={13} />
          <span>Retry loading</span>
        </Button>
      </div>
    );
  }

  if (loading && !overview) {
    return <SectionLoading label="Loading commercial analytics…" />;
  }

  if (!overview) return null;

  const { workspaces, mrr, esb, support, subscriptionMargin } = overview;

  return (
    <div className="sa-analytics">
      <PageHeader
        crumbs={['Admin', 'Analytics']}
        titlePlain="Commercial"
        titleEm="analytics"
        subtitle="Subscription revenue run-rate, external service margins, support costs and retention cohorts."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tip label={compactRows ? "Currently showing dense compressed rows. Click for standard." : "Switch to compressed rows view."}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCompactRows(v => !v)}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Icon name="list" size={13} />
                <span>{compactRows ? 'Dense Rows' : 'Standard Rows'}</span>
              </Button>
            </Tip>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadAnalytics}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Icon name="refresh" size={13} />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {/* Top Executive KPI Deck */}
      <div className="ondi-kpi-grid" style={{ marginBottom: 4 }}>
        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Paying Workspaces</span>
            <div className="ondi-kpi-icon-box purple">
              <Icon name="building" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num">{workspaces.active_paid}</span>
            <span className="ondi-kpi-sub">of {workspaces.total} total ({workspaces.free} free, {workspaces.cancelled} cancelled)</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Monthly Run Rate (MRR)</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="trendingUp" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--green)' }}>{fmt(mrr.mrr_tzs)}</span>
            <span className="ondi-kpi-sub">~{fmt(mrr.mrr_usd, 'USD')} USD / mo</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Annual Run Rate (ARR)</span>
            <div className="ondi-kpi-icon-box teal">
              <Icon name="dollarSign" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--teal)' }}>{fmt(mrr.arr_tzs)}</span>
            <span className="ondi-kpi-sub">~{fmt(mrr.arr_usd, 'USD')} USD / yr</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">ESB Supplier Margin</span>
            <div className="ondi-kpi-icon-box gold">
              <Icon name="zap" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: esb.margin >= 0 ? 'var(--gold)' : 'var(--red)' }}>{fmt(esb.margin)}</span>
            <span className="ondi-kpi-sub">{esb.by_service.length} external services active</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Support Logged Cost</span>
            <div className="ondi-kpi-icon-box blue">
              <Icon name="helpCircle" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: 'var(--blue)' }}>{fmt(support.total_cost)}</span>
            <span className="ondi-kpi-sub">{support.total_hours}h total logged</span>
          </div>
        </div>

        <div className="ondi-kpi-card">
          <div className="ondi-kpi-header">
            <span className="ondi-kpi-title">Subscription Margin</span>
            <div className="ondi-kpi-icon-box green">
              <Icon name="shield" size={18} />
            </div>
          </div>
          <div className="ondi-kpi-body">
            <span className="ondi-kpi-num" style={{ color: subscriptionMargin.margin_tzs >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(subscriptionMargin.margin_tzs)}</span>
            <span className="ondi-kpi-sub">partial · excl. infra allocation</span>
          </div>
        </div>
      </div>

      <div style={{ margin: '-4px 2px 8px', fontSize: 11.5, color: 'var(--ink3)' }}>
        {subscriptionMargin.allocation_note}
      </div>

      {/* Row 1: MRR by Plan & Active Apps */}
      <div className="sa-analytics-two-col">
        {/* MRR by Plan */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="layers" size={14} />
              </span>
              <span>MRR by Plan</span>
            </h3>
            <Badge variant="brand">{mrr.by_plan.length} tiers</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Tenants</th>
                  <th style={{ textAlign: 'right' }}>MRR</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {mrr.by_plan.map(r => (
                  <tr key={r.plan}>
                    <td style={{ fontWeight: 600 }}>{r.plan}</td>
                    <td>{r.count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font)' }}>{fmt(r.mrr, r.currency)}</td>
                    <td><span style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase' }}>{r.currency}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Apps */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="grid" size={14} />
              </span>
              <span>Active Platform Modules</span>
            </h3>
            <Badge variant="outline">{activeApps?.length ?? 0} modules</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            {(!activeApps || activeApps.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                No active checkpoint data recorded yet.
              </div>
            ) : (
              <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
                <thead>
                  <tr>
                    <th>Module / App</th>
                    <th style={{ textAlign: 'right' }}>Active Workspaces</th>
                  </tr>
                </thead>
                <tbody>
                  {activeApps.map(r => (
                    <tr key={r.app_id}>
                      <td style={{ fontWeight: 600 }}>{r.app_id}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.active_workspaces}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Revenue Timeline */}
      {revenue && revenue.length > 0 && (
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="trendingUp" size={14} />
              </span>
              <span>Revenue Timeline</span>
            </h3>
            <Badge variant="success">{revenue.length} months</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Subscriptions</th>
                  <th style={{ textAlign: 'right' }}>External Services (ESB)</th>
                  <th style={{ textAlign: 'right' }}>Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {revenue.map(r => {
                  const total = r.subscription_revenue + r.esb_revenue;
                  return (
                    <tr key={r.month}>
                      <td style={{ fontWeight: 650, fontFamily: 'monospace', fontSize: compactRows ? 11.5 : 12 }}>{r.month}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font)' }}>{fmt(r.subscription_revenue, r.currency)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font)' }}>{fmt(r.esb_revenue, r.currency)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 750, color: 'var(--teal)', fontFamily: 'var(--font)' }}>{fmt(total, r.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row 3: External Service Margin & Support Cost Attribution */}
      <div className="sa-analytics-two-col">
        {/* ESB by Service */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="zap" size={14} />
              </span>
              <span>External Service Margins (ESB)</span>
            </h3>
            <Badge variant="warning">{esb.by_service.length} providers</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            {esb.by_service.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                No external provider transactions recorded.
              </div>
            ) : (
              <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th style={{ textAlign: 'right' }}>Ops</th>
                    <th style={{ textAlign: 'right' }}>Earned</th>
                    <th style={{ textAlign: 'right' }}>Supplier Cost</th>
                    <th style={{ textAlign: 'right' }}>Net Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {esb.by_service.map(r => {
                    const margin = r.earned - r.supplier_cost;
                    return (
                      <tr key={r.service_kind}>
                        <td style={{ fontWeight: 600 }}>{r.service_kind}</td>
                        <td style={{ textAlign: 'right' }}>{r.operations}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font)' }}>{fmt(r.earned)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font)', color: 'var(--ink3)' }}>{fmt(r.supplier_cost)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 750, color: margin >= 0 ? 'var(--green, #10b981)' : 'var(--red, #ef4444)', fontFamily: 'var(--font)' }}>
                          {fmt(margin)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Support Cost by Category */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="helpCircle" size={14} />
              </span>
              <span>Support Cost Attribution</span>
            </h3>
            <Badge variant="outline">{support.by_category.length} categories</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            {support.by_category.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                No support logs attributed yet.
              </div>
            ) : (
              <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Hours</th>
                    <th style={{ textAlign: 'right' }}>Attributed Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {support.by_category.map(r => (
                    <tr key={r.category}>
                      <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{r.category.replace(/_/g, ' ')}</td>
                      <td style={{ textAlign: 'right' }}>{r.hours}h</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font)' }}>{fmt(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Retention Cohorts & Churn/Upgrades */}
      <div className="sa-analytics-two-col">
        {/* Retention Cohorts */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="users" size={14} />
              </span>
              <span>Retention Cohorts (30d)</span>
            </h3>
            <Badge variant="outline">{retention?.length ?? 0} cohorts</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            {(!retention || retention.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                No cohort data available yet.
              </div>
            ) : (
              <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Signed Up</th>
                    <th>Active</th>
                    <th>Retention</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {retention.map(r => (
                    <tr key={r.cohort_month}>
                      <td style={{ fontWeight: 650, fontFamily: 'monospace' }}>{r.cohort_month}</td>
                      <td>{r.signed_up}</td>
                      <td>{r.still_active}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: r.retention_pct >= 80 ? 'var(--green)' : r.retention_pct >= 50 ? 'var(--gold)' : 'var(--red)' }}>
                          {r.retention_pct}%
                        </span>
                      </td>
                      <td>{r.immature && <Badge variant="warning">Immature</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Churn & Changes */}
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="activity" size={14} />
              </span>
              <span>New, Churned &amp; Plan Changes</span>
            </h3>
            <Badge variant="outline">{churn?.length ?? 0} periods</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            {(!churn || churn.length === 0) ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>
                No plan change events recorded yet.
              </div>
            ) : (
              <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ color: 'var(--green)' }}>New Paid</th>
                    <th style={{ color: 'var(--red)' }}>Churned</th>
                    <th>Upgrades</th>
                    <th>Downgrades</th>
                  </tr>
                </thead>
                <tbody>
                  {churn.map(r => (
                    <tr key={r.month}>
                      <td style={{ fontWeight: 650, fontFamily: 'monospace' }}>{r.month}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)' }}>+{r.new_paid}</td>
                      <td style={{ fontWeight: 700, color: r.churned > 0 ? 'var(--red)' : 'var(--ink3)' }}>{r.churned > 0 ? `-${r.churned}` : '0'}</td>
                      <td>{r.upgrades}</td>
                      <td>{r.downgrades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="sa-hint-box">
            <Icon name="info" size={13} />
            <span>Classified from subscription invoices and tenant plan changes.</span>
          </div>
        </div>
      </div>

      {/* Row 5: Provider Reliability */}
      {providers && providers.length > 0 && (
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <h3 className="sa-analytics-card-title">
              <span className="sa-analytics-card-title-icon">
                <Icon name="shield" size={14} />
              </span>
              <span>External Provider Reliability &amp; Uptime</span>
            </h3>
            <Badge variant="brand">{providers.length} providers</Badge>
          </div>
          <div className="sa-analytics-table-wrap">
            <table className="sa-analytics-table" data-compact={compactRows ? 'true' : undefined}>
              <thead>
                <tr>
                  <th>Service Kind</th>
                  <th style={{ textAlign: 'right' }}>Total Operations</th>
                  <th style={{ textAlign: 'right' }}>Captured</th>
                  <th style={{ textAlign: 'right' }}>Failed</th>
                  <th style={{ textAlign: 'right' }}>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(r => (
                  <tr key={r.service_kind}>
                    <td style={{ fontWeight: 650 }}>{r.service_kind}</td>
                    <td style={{ textAlign: 'right' }}>{r.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)' }}>{r.captured.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: r.failed > 0 ? 'var(--red)' : 'var(--ink3)' }}>{r.failed.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge variant={r.success_rate >= 99 ? 'success' : r.success_rate >= 95 ? 'warning' : 'destructive'}>
                        {r.success_rate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
