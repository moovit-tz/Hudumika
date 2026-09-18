import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { SectionLoading } from '../components/ui/spinner.js';

interface CustomerOverviewData {
  kpis: { active_shipments: number; cleared_this_month: number; pending_customs: number; outstanding_duties_tzs: number };
  status_cards: { on_time_clearance_pct: number; document_compliance_pct: number; at_risk_shipments: number; active_shipment_count: number; freight_revenue_mtd_tzs: number };
  shipment_status: { IN_TRANSIT: number; AT_PORT: number; CUSTOMS_HOLD: number; CLEARED: number };
  declarations_today: { filed: number; approved: number; pending_review: number; cancelled: number };
  top_customers: { name: string; shipments: number; invoiced_mtd: number }[];
  finance_summary: { total_invoiced_mtd: number; collected_mtd: number; outstanding_mtd: number; overdue_30d: number };
}

export const CustomerOverview: React.FC = () => {
  const isMobile = useIsMobile();
  const co = useCompany();
  const cur = co.currency ?? 'TZS';
  const fmtM = (n: number) => `${cur} ${(n / 1_000_000).toFixed(1)}M`;

  const [data, setData] = useState<CustomerOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/analytics/customer-overview')
      .then((res: CustomerOverviewData) => { if (alive) setData(res); })
      .catch((err: any) => { if (alive) setError(err?.message ?? 'Failed to load overview'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <SectionLoading />
    </div>
  );

  if (error || !data) return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
      {error ?? 'Failed to load overview'}
    </div>
  );

  const shipmentTotal = Object.values(data.shipment_status).reduce((a, b) => a + b, 0) || 1;
  const SHIPMENT_STATUSES = [
    { label: 'In Transit',          count: data.shipment_status.IN_TRANSIT,   color: 'var(--blue)',   variant: 'info'    as const },
    { label: 'At Port / Terminal',  count: data.shipment_status.AT_PORT,      color: 'var(--purple)', variant: 'brand'   as const },
    { label: 'Customs Hold',        count: data.shipment_status.CUSTOMS_HOLD, color: 'var(--gold)',   variant: 'warning' as const },
    { label: 'Cleared & Delivered', count: data.shipment_status.CLEARED,      color: 'var(--green)',  variant: 'success' as const },
  ].map(s => ({ ...s, pct: Math.round((s.count / shipmentTotal) * 100) }));

  const DECL_ROWS: { label: string; count: number; variant: React.ComponentProps<typeof Badge>['variant'] }[] = [
    { label: 'Filed Today',     count: data.declarations_today.filed,          variant: 'info'    },
    { label: 'Approved Today',  count: data.declarations_today.approved,       variant: 'success' },
    { label: 'Pending Review',  count: data.declarations_today.pending_review, variant: 'warning' },
    { label: 'Cancelled Today', count: data.declarations_today.cancelled,      variant: 'error'   },
  ];

  const FINANCE_ROWS = [
    { label: 'Total Invoiced (Month)', amount: data.finance_summary.total_invoiced_mtd,  pct: 100, color: 'var(--blue)' },
    { label: 'Collected',              amount: data.finance_summary.collected_mtd,        pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.collected_mtd / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: 'var(--green)' },
    { label: 'Outstanding',            amount: data.finance_summary.outstanding_mtd,      pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.outstanding_mtd / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: 'var(--gold)'  },
    { label: 'Overdue (>30 days)',     amount: data.finance_summary.overdue_30d,          pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.overdue_30d / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: 'var(--red)'   },
  ];

  const QUICK_ACTIONS: { icon: IconName; label: string; path: string }[] = [
    { icon: 'plus',          label: 'New Customer',    path: '/crm/customers'        },
    { icon: 'fileText',      label: 'New Declaration', path: '/clearos/declarations' },
    { icon: 'dollarSign',    label: 'Record Payment',  path: '/finance/payments'     },
    { icon: 'alertTriangle', label: 'View At-Risk',    path: '/shipments'            },
    { icon: 'file',          label: 'Document Status', path: '/documents'            },
    { icon: 'barChart2',     label: 'Finance Report',  path: '/finance'              },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['CRM', 'Overview']}
        titlePlain="Customer"
        titleEm="overview"
        subtitle="Active shipments, financials and performance at a glance."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" asChild>
              <Link to="/crm/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <Icon name="users" size={13} /> Customer List
              </Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link to="/crm/customers/bulk-upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'hsl(var(--primary-foreground))' }}>
                <Icon name="upload" size={13} /> Bulk Upload
              </Link>
            </Button>
          </div>
        }
      />

      <div style={{ width: '100%', paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>

        <MetricsRow cards={[
          { title: 'Active Shipments', value: String(data.kpis.active_shipments), icon: 'package', barHighlight: 'var(--blue)' },
          { title: 'Cleared This Month', value: String(data.kpis.cleared_this_month), icon: 'checkCircle', barHighlight: 'var(--green)' },
          { title: 'Pending Customs', value: String(data.kpis.pending_customs), icon: 'clock', barHighlight: 'var(--gold)' },
          { title: 'Overdue Receivables (30d+)', value: fmtM(data.kpis.outstanding_duties_tzs), icon: 'dollarSign', barHighlight: 'var(--red)' },
        ]} />

        <MetricsRow cards={[
          { title: 'On-Time Clearance', value: `${data.status_cards.on_time_clearance_pct}%`, icon: 'trendingUp', barHighlight: 'var(--green)' },
          { title: 'Document Compliance', value: `${data.status_cards.document_compliance_pct}%`, icon: 'file', barHighlight: 'var(--blue)' },
          { title: 'At-Risk Shipments', value: `${data.status_cards.at_risk_shipments} of ${data.status_cards.active_shipment_count}`, icon: 'alertTriangle', barHighlight: 'var(--red)' },
          { title: 'Freight Revenue (MTD)', value: fmtM(data.status_cards.freight_revenue_mtd_tzs), icon: 'barChart2', barHighlight: 'var(--purple)' },
        ]} />

        {/* Row 3: Two-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <SectionCard title="Shipment Status Breakdown" padded={false}>
              <div style={{ padding: '4px 0' }}>
                {SHIPMENT_STATUSES.map(s => (
                  <div key={s.label} style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink2)', fontWeight: 500 }}>{s.label}</span>
                    <div style={{ width: 90, height: 4, borderRadius: 'var(--r-sm)', background: 'var(--bg)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 'var(--r-sm)', transition: 'width 0.6s ease' }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{s.count}</span>
                    <Badge variant={s.variant} style={{ fontSize: 10, padding: '1px 5px', flexShrink: 0 }}>{s.pct}%</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Top Customers by Shipment Volume"
              padded={false}
              action={<Link to="/crm/customers" style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>View All</Link>}
            >
              <div>
                {data.top_customers.map((c, i) => (
                  <div key={c.name} style={{
                    padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: i < data.top_customers.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'var(--teal-l)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: 'var(--teal)', flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 1 }}>{c.shipments} shipment{c.shipments !== 1 ? 's' : ''} this month</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{cur} {c.invoiced_mtd.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>invoiced MTD</div>
                    </div>
                  </div>
                ))}
                {data.top_customers.length === 0 && (
                  <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No shipments recorded this month.</div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <SectionCard title="Financial Summary — Current Month" padded={false}>
              <div style={{ padding: '4px 0' }}>
                {FINANCE_ROWS.map((r, i) => (
                  <div key={r.label} style={{ padding: '11px 18px', borderBottom: i < FINANCE_ROWS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 500 }}>{r.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{cur} {r.amount.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 'var(--r-sm)', background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, r.pct)}%`, background: r.color, borderRadius: 'var(--r-sm)', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Customs Declarations — Today" padded={false}>
              <div style={{ padding: '4px 0' }}>
                {DECL_ROWS.map(d => (
                  <div key={d.label} style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ink2)', fontWeight: 500 }}>{d.label}</span>
                    <Badge variant={d.variant} style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{d.count}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Quick Actions" padded={false}>
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {QUICK_ACTIONS.map(a => (
                  <Link
                    key={a.label}
                    to={a.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600,
                      textDecoration: 'none', transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-l)'; e.currentTarget.style.color = 'var(--teal)'; e.currentTarget.style.borderColor = 'var(--teal)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--ink2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                  >
                    <Icon name={a.icon} size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                  </Link>
                ))}
              </div>
            </SectionCard>
          </div>

        </div>
      </div>
    </div>
  );
};
