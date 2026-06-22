import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.jsx';

/* ── Mini bar sparkline rendered behind the stat number ── */
function SparkBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const bw = 14, gap = 4, h = 56;
  const totalW = data.length * (bw + gap) - gap;
  return (
    <svg
      width={totalW} height={h}
      style={{ position: 'absolute', bottom: 0, right: 12, opacity: 0.18, pointerEvents: 'none' }}
    >
      {data.map((v, i) => {
        const bh = Math.max(3, (v / max) * h);
        return (
          <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={3} fill={color} />
        );
      })}
    </svg>
  );
}

/* ── Top KPI card with background bars ── */
function KpiCard({
  icon, iconBg, iconColor, value, label, sub, subUp, bars, barColor,
}: {
  icon: string; iconBg: string; iconColor: string;
  value: string; label: string; sub: string; subUp: boolean;
  bars: number[]; barColor: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
      background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
      padding: '18px 18px 14px',
    }}>
      <SparkBars data={bars} color={barColor} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, position: 'relative',
        fontSize: 11, color: subUp ? 'var(--green)' : 'var(--red)', fontWeight: 600,
      }}>
        <Icon name={subUp ? 'trendingUp' : 'trendingDown'} size={12} color={subUp ? 'var(--green)' : 'var(--red)'} />
        {sub}
      </div>
    </div>
  );
}

/* ── Status card with progress bar ── */
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
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4, textAlign: 'right' }}>{pct}%</div>
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

const SHIPMENT_STATUSES = [
  { label: 'In Transit',          count: 54, pct: 43, color: 'var(--blue)',   bg: '#eff6ff' },
  { label: 'At Port / Terminal',  count: 38, pct: 30, color: 'var(--purple)', bg: '#f5f3ff' },
  { label: 'Customs Hold',        count: 24, pct: 19, color: '#f59e0b',       bg: '#fffbeb' },
  { label: 'Cleared & Delivered', count: 11, pct:  9, color: 'var(--green)',  bg: '#f0fdf4' },
];

const DECL_ROWS = [
  { label: 'Filed Today',        count: 12, color: 'var(--blue)',  bg: '#eff6ff' },
  { label: 'Approved Today',     count:  9, color: 'var(--green)', bg: '#f0fdf4' },
  { label: 'Pending Review',     count: 15, color: '#f59e0b',      bg: '#fffbeb' },
  { label: 'Rejected / Action',  count:  3, color: 'var(--red)',   bg: '#fef2f2' },
];

const TOP_CUSTOMERS = [
  { name: 'Simba Logistics Ltd',     shipments: 23, value: '4.8M', trend: true  },
  { name: 'Kilimanjaro Trading Co.', shipments: 18, value: '3.2M', trend: true  },
  { name: 'Dar Freight Solutions',   shipments: 15, value: '2.9M', trend: false },
  { name: 'Zanzibar Export Bureau',  shipments: 12, value: '2.1M', trend: true  },
  { name: 'Mombasa Gate Clearers',   shipments:  9, value: '1.7M', trend: false },
];

const FINANCE_ROWS = [
  { label: 'Total Invoiced (Month)',  amount: 'TZS 18.4M', pct: 100, color: 'var(--blue)'   },
  { label: 'Collected',               amount: 'TZS 14.2M', pct:  77, color: 'var(--green)'  },
  { label: 'Outstanding',             amount: 'TZS  4.2M', pct:  23, color: '#f59e0b'       },
  { label: 'Overdue (>30 days)',       amount: 'TZS  1.6M', pct:   9, color: 'var(--red)'   },
];

export const CustomerOverview: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>

      <PageHeader
        crumbs={['CRM', 'Customers']}
        titlePlain="Customer"
        titleEm="overview"
        subtitle="Freight & customs clearing — active shipments, financials and performance at a glance."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button"
              onClick={() => navigate('/customers')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              <Icon name="users" size={13} /> Customer List
            </button>
            <button type="button"
              onClick={() => navigate('/customers/bulk-upload')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              <Icon name="upload" size={13} /> Bulk Upload
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>

        {/* ── Row 1: KPI cards ── */}
        <div style={{ display: 'flex', gap: 14 }}>
          <KpiCard
            icon="package" iconBg="#eff6ff" iconColor="var(--blue)"
            value="127" label="Active Shipments"
            sub="+15 vs last month" subUp
            bars={[72, 85, 91, 88, 97, 105, 112, 127]} barColor="var(--blue)"
          />
          <KpiCard
            icon="checkCircle" iconBg="#f0fdf4" iconColor="var(--green)"
            value="89" label="Cleared This Month"
            sub="+17 vs last month" subUp
            bars={[48, 56, 61, 58, 65, 70, 72, 89]} barColor="var(--green)"
          />
          <KpiCard
            icon="clock" iconBg="#fffbeb" iconColor="#f59e0b"
            value="24" label="Pending Customs"
            sub="−7 vs last month" subUp={false}
            bars={[41, 38, 35, 33, 31, 29, 31, 24]} barColor="#f59e0b"
          />
          <KpiCard
            icon="dollarSign" iconBg="#fef2f2" iconColor="var(--red)"
            value="TZS 4.2M" label="Outstanding Duties"
            sub="+0.4M vs last month" subUp={false}
            bars={[2.1, 2.8, 3.1, 3.8, 3.5, 4.0, 3.8, 4.2]} barColor="var(--red)"
          />
        </div>

        {/* ── Row 2: Status cards ── */}
        <div style={{ display: 'flex', gap: 14 }}>
          <StatusCard label="On-Time Clearance Rate" value="84%"       pct={84} color="var(--green)"  icon="trendingUp"    />
          <StatusCard label="Document Compliance"    value="91%"       pct={91} color="var(--blue)"   icon="file"          />
          <StatusCard label="At-Risk Shipments"      value="8 of 127"  pct={6}  color="var(--red)"    icon="alertTriangle" />
          <StatusCard label="Freight Revenue (MTD)"  value="TZS 18.4M" pct={74} color="var(--purple)" icon="barChart2"     />
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
                title="Top Customers by Shipment Volume"
                action={
                  <button
                    onClick={() => navigate('/customers')}
                    style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    View All
                  </button>
                }
              />
              <div>
                {TOP_CUSTOMERS.map((c, i) => (
                  <div key={c.name} style={{
                    padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: i < TOP_CUSTOMERS.length - 1 ? '1px solid var(--border)' : 'none',
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
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 1 }}>{c.shipments} active shipments</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>TZS {c.value}</div>
                      <div style={{ fontSize: 10, color: c.trend ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 1 }}>
                        {c.trend ? '↑' : '↓'} MTD
                      </div>
                    </div>
                  </div>
                ))}
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
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{r.amount}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${r.pct}%`, background: r.color, borderRadius: 2 }} />
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
                  <button
                    key={a.label}
                    onClick={() => navigate(a.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 9,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--ink2)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left',
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
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
