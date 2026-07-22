import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';

interface CustomerOverviewData {
  kpis: { active_shipments: number; cleared_this_month: number; pending_customs: number; outstanding_duties_tzs: number };
  status_cards: { on_time_clearance_pct: number; document_compliance_pct: number; at_risk_shipments: number; active_shipment_count: number; freight_revenue_mtd_tzs: number };
  shipment_status: { IN_TRANSIT: number; AT_PORT: number; CUSTOMS_HOLD: number; CLEARED: number };
  declarations_today: { filed: number; approved: number; pending_review: number; cancelled: number };
  top_customers: { name: string; shipments: number; invoiced_mtd: number }[];
  finance_summary: { total_invoiced_mtd: number; collected_mtd: number; outstanding_mtd: number; overdue_30d: number };
}

function KpiCard({ icon, iconBg, iconColor, value, label }: {
  icon: string; iconBg: string; iconColor: string; value: string; label: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
      padding: '18px 18px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 9, background: iconBg, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} size={20} color={iconColor} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, pct, color, icon }: {
  label: string; value: string; pct: number; color: string; icon: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'var(--white)', borderRadius: 9,
      border: '1px solid var(--border)', padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={14} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{value}</div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 3, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
      overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      padding: '11px 18px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      {action}
    </div>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 5, padding: '2px 7px' }}>
      {label}
    </span>
  );
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

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)' }}>Loading overview…</div>;
  if (error || !data) return <div style={{ padding: '48px 0', textAlign: 'center', color: '#ef4444' }}>{error ?? 'Failed to load overview'}</div>;

  const shipmentTotal = Object.values(data.shipment_status).reduce((a, b) => a + b, 0) || 1;
  const SHIPMENT_STATUSES = [
    { label: 'In Transit',          count: data.shipment_status.IN_TRANSIT,   color: 'var(--blue)',   bg: '#eff6ff' },
    { label: 'At Port / Terminal',  count: data.shipment_status.AT_PORT,      color: 'var(--purple)', bg: '#f5f3ff' },
    { label: 'Customs Hold',        count: data.shipment_status.CUSTOMS_HOLD, color: '#f59e0b',       bg: '#fffbeb' },
    { label: 'Cleared & Delivered', count: data.shipment_status.CLEARED,      color: 'var(--green)',  bg: '#ecfdf5' },
  ].map(s => ({ ...s, pct: Math.round((s.count / shipmentTotal) * 100) }));

  const DECL_ROWS = [
    { label: 'Filed Today',       count: data.declarations_today.filed,         color: 'var(--blue)',  bg: '#eff6ff' },
    { label: 'Approved Today',    count: data.declarations_today.approved,      color: 'var(--green)', bg: '#ecfdf5' },
    { label: 'Pending Review',    count: data.declarations_today.pending_review, color: '#f59e0b',      bg: '#fffbeb' },
    { label: 'Cancelled Today',   count: data.declarations_today.cancelled,     color: 'var(--red)',   bg: '#fef2f2' },
  ];

  const FINANCE_ROWS = [
    { label: 'Total Invoiced (Month)', amount: data.finance_summary.total_invoiced_mtd, pct: 100, color: 'var(--blue)' },
    { label: 'Collected', amount: data.finance_summary.collected_mtd, pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.collected_mtd / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: 'var(--green)' },
    { label: 'Outstanding', amount: data.finance_summary.outstanding_mtd, pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.outstanding_mtd / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: '#f59e0b' },
    { label: 'Overdue (>30 days)', amount: data.finance_summary.overdue_30d, pct: data.finance_summary.total_invoiced_mtd > 0 ? Math.round((data.finance_summary.overdue_30d / data.finance_summary.total_invoiced_mtd) * 100) : 0, color: 'var(--red)' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['CRM', 'Customers']}
        titlePlain="Customer"
        titleEm="overview"
        subtitle="Freight & customs clearing — active shipments, financials and performance at a glance."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/customers"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none' }}
            >
              <Icon name="users" size={13} /> Customer List
            </Link>
            <Link to="/customers/bulk-upload"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none' }}
            >
              <Icon name="upload" size={13} /> Bulk Upload
            </Link>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

        {/* ── Row 1: KPI cards ── */}
        <div style={{ display: 'flex', gap: 14 }}>
          <KpiCard icon="package" iconBg="#eff6ff" iconColor="var(--blue)" value={String(data.kpis.active_shipments)} label="Active Shipments" />
          <KpiCard icon="checkCircle" iconBg="#ecfdf5" iconColor="var(--green)" value={String(data.kpis.cleared_this_month)} label="Cleared This Month" />
          <KpiCard icon="clock" iconBg="#fffbeb" iconColor="#f59e0b" value={String(data.kpis.pending_customs)} label="Pending Customs" />
          <KpiCard icon="dollarSign" iconBg="#fef2f2" iconColor="var(--red)" value={fmtM(data.kpis.outstanding_duties_tzs)} label="Overdue Receivables (30d+)" />
        </div>

        {/* ── Row 2: Status cards ── */}
        <div style={{ display: 'flex', gap: 14 }}>
          <StatusCard label="On-Time Clearance Rate" value={`${data.status_cards.on_time_clearance_pct}%`} pct={data.status_cards.on_time_clearance_pct} color="var(--green)" icon="trendingUp" />
          <StatusCard label="Document Compliance"    value={`${data.status_cards.document_compliance_pct}%`} pct={data.status_cards.document_compliance_pct} color="var(--blue)" icon="file" />
          <StatusCard label="At-Risk Shipments"      value={`${data.status_cards.at_risk_shipments} of ${data.status_cards.active_shipment_count}`} pct={data.status_cards.active_shipment_count > 0 ? Math.round((data.status_cards.at_risk_shipments / data.status_cards.active_shipment_count) * 100) : 0} color="var(--red)" icon="alertTriangle" />
          <StatusCard label="Freight Revenue (MTD)"  value={fmtM(data.status_cards.freight_revenue_mtd_tzs)} pct={100} color="var(--purple)" icon="barChart2" />
        </div>

        {/* ── Row 3: Two-column ── */}
        <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 320 }}>

          {/* LEFT */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Card>
              <CardHeader title="Shipment Status Breakdown" />
              <div style={{ padding: '4px 0' }}>
                {SHIPMENT_STATUSES.map(s => (
                  <div key={s.label} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>{s.label}</span>
                    <div style={{ width: 100, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2 }} />
                    </div>
                    <span style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{s.count}</span>
                    <span style={{ width: 30, textAlign: 'right', fontSize: 10, color: 'var(--ink3)', flexShrink: 0 }}>{s.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ flex: 1 }}>
              <CardHeader
                title="Top Customers by Shipment Volume (MTD)"
                action={
                  <Link
                    to="/customers"
                    style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}
                  >
                    View All
                  </Link>
                }
              />
              <div>
                {data.top_customers.map((c, i) => (
                  <div key={c.name} style={{
                    padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: i < data.top_customers.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 9, background: 'var(--teal-l)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, color: 'var(--teal)', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>{c.shipments} shipments this month</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{cur} {c.invoiced_mtd.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>invoiced MTD</div>
                    </div>
                  </div>
                ))}
                {data.top_customers.length === 0 && (
                  <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12 }}>No shipments recorded this month.</div>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Card>
              <CardHeader title="Financial Summary — Current Month" />
              <div style={{ padding: '4px 0' }}>
                {FINANCE_ROWS.map((r, i) => (
                  <div key={r.label} style={{
                    padding: '10px 18px',
                    borderBottom: i < FINANCE_ROWS.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>{r.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{cur} {r.amount.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, r.pct)}%`, background: r.color, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Customs Declarations — Today" />
              <div style={{ padding: '6px 0' }}>
                {DECL_ROWS.map(d => (
                  <div key={d.label} style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>{d.label}</span>
                    <Badge label={String(d.count)} color={d.color} bg={d.bg} />
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ flex: 1 }}>
              <CardHeader title="Quick Actions" />
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                {[
                  { icon: 'plus',          label: 'New Customer',    path: '/customers'         },
                  { icon: 'fileText',      label: 'New Declaration', path: '/declarations'      },
                  { icon: 'dollarSign',    label: 'Record Payment',  path: '/finance/payments'  },
                  { icon: 'alertTriangle', label: 'View At-Risk',    path: '/shipments'         },
                  { icon: 'file',          label: 'Document Status', path: '/documents'         },
                  { icon: 'barChart2',     label: 'Finance Report',  path: '/finance'           },
                ].map(a => (
                  <Link
                    key={a.label}
                    to={a.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 9,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--ink2)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left', textDecoration: 'none',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--teal-l)';
                      e.currentTarget.style.color = 'var(--teal)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--bg)';
                      e.currentTarget.style.color = 'var(--ink2)';
                    }}
                  >
                    <Icon name={a.icon} size={13} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
