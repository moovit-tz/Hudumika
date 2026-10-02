import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar, CompanyAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useCompany } from '../data/companyStore.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import './SalesAnalytics.css';

export const CustomerOverview: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const co = useCompany();
  const cur = co.currency ?? 'USD';

  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/v1/crm/deals').catch(() => []),
      apiFetch('/v1/analytics/customer-overview').catch(() => null),
    ]).then(([d, a]) => {
      if (alive) {
        setDeals(Array.isArray(d) ? d : []);
        setAnalytics(a);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  if (loading) return <SkeletonPage variant="dashboard" />;

  const funnelStages = [
    { label: '1. Leads Captured', count: 6840, pct: 100, fill: '#0d9488', drop: '32.9% drop' },
    { label: '2. Qualified (SQL)', count: 4444, pct: 67.1, fill: '#14b8a6', drop: '26.0% drop' },
    { label: '3. Demo Scheduled', count: 2814, pct: 41.1, fill: '#f59e0b', drop: '11.8% drop' },
    { label: '4. Proposal Sent', count: 2007, pct: 29.3, fill: '#3b82f6', drop: '12.1% drop' },
    { label: '5. Closed / Won', count: 1180, pct: 17.2, fill: '#10b981', drop: null },
  ];

  const heatmapDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const heatmapHours = ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p'];
  const heatmapMatrix = [
    [1, 2, 4, 4, 3, 2, 4, 3, 2, 1, 0],
    [2, 3, 4, 4, 4, 3, 4, 4, 3, 2, 1],
    [1, 4, 4, 3, 2, 4, 4, 3, 4, 2, 0],
    [3, 4, 4, 4, 3, 3, 4, 4, 2, 1, 1],
    [1, 2, 3, 4, 2, 2, 3, 2, 1, 0, 0],
  ];

  const leaderboardReps = [
    { rank: 1, name: 'Jordan Myers', role: 'Enterprise Account Exec', revenue: '$1,420,000', deals: 14, quota: '142%' },
    { rank: 2, name: 'Tanya Rossi', role: 'Senior Strategic Rep', revenue: '$1,150,000', deals: 11, quota: '115%' },
    { rank: 3, name: 'Grace Kim', role: 'Commercial Sales Lead', revenue: '$1,050,000', deals: 9, quota: '105%' },
    { rank: 4, name: 'David Chen', role: 'Mid-Market Rep', revenue: '$495,000', deals: 6, quota: '99%' },
    { rank: 5, name: 'Alex Vance', role: 'SMB Account Exec', revenue: '$314,000', deals: 4, quota: '78%' },
  ];

  const riskDeals = [
    { name: 'Meridian Logistics Group', amount: '$84,000', days: '14 days in stage · Neglected demo follow-up', risk: 'High' as const },
    { name: 'Freemen Retail Chains', amount: '$154,000', days: 'No decision maker response in 7 days', risk: 'Medium' as const },
    { name: 'DHL Africa Partner Corridors', amount: '$98,000', days: 'Budget committee review requested', risk: 'Medium' as const },
    { name: 'Solar Point Dar es Salaam', amount: '$112,000', days: 'Competitor offering discounts', risk: 'High' as const },
    { name: 'BlueSky Frozen Foods', amount: '$71,000', days: 'Lead champion moved roles', risk: 'Medium' as const },
  ];

  const recentOrders = [
    { id: 'ORD-48256', customer: 'Acme Corporation East Africa', rep: 'Jordan Myers', amount: '$244,000', date: 'Jul 28, 2026', status: 'Paid' as const },
    { id: 'ORD-48255', customer: 'Nexus Industrial Hub', rep: 'Tanya Rossi', amount: '$184,500', date: 'Jul 27, 2026', status: 'Pending' as const },
    { id: 'ORD-48254', customer: 'Vortex Technologies TZ', rep: 'Grace Kim', amount: '$94,000', date: 'Jul 25, 2026', status: 'Paid' as const },
    { id: 'ORD-48253', customer: 'Knight Logistics Ports', rep: 'David Chen', amount: '$72,000', date: 'Jul 20, 2026', status: 'Overdue' as const },
    { id: 'ORD-48252', customer: 'Quantum Freight Ltd', rep: 'Jordan Myers', amount: '$68,500', date: 'Jul 18, 2026', status: 'Paid' as const },
  ];

  return (
    <div className="sales-analytics-container">
      {/* ── Page Header ── */}
      <PageHeader
        crumbs={['CRM', 'Analytics']}
        titlePlain="Sales"
        titleEm="analytics"
        subtitle="Sales velocity, 5-stage funnel conversion, rep quota leaderboard, and deal slip risk AI advisor."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/crm/pipeline')}>
              <Icon name="briefcase" size={14} /> Pipeline Board
            </Button>
            <Button variant="default" size="sm" onClick={() => navigate('/crm/sales')}>
              <Icon name="plus" size={14} /> New Deal
            </Button>
          </div>
        }
      />

      {/* ── Top Hero: Revenue Intelligence ── */}
      <div className="sales-hero-banner">
        <div className="sales-hero-left">
          <div className="sales-hero-title-row">
            <h2>Revenue Intelligence Center</h2>
            <span className="sales-hero-badge">On Track Q3 (+21.4%)</span>
          </div>
          <p className="sales-hero-desc">
            Closed Won Revenue is pacing 21.4% ahead of target. Sales velocity sits at $18.4K/day with an average 23.6-day lead-to-close cycle.
          </p>
        </div>

        <div className="sales-hero-kpis">
          <div className="sales-hero-kpi-tile">
            <div className="sales-hero-kpi-label">Closed Won Rev</div>
            <div className="sales-hero-kpi-val">$4.62M</div>
            <div className="sales-hero-kpi-sub">+21.4% YoY</div>
          </div>
          <div className="sales-hero-kpi-tile">
            <div className="sales-hero-kpi-label">Win Rate</div>
            <div className="sales-hero-kpi-val">84.0%</div>
            <div className="sales-hero-kpi-sub">Top Decile</div>
          </div>
          <div className="sales-hero-kpi-tile">
            <div className="sales-hero-kpi-label">Avg Sales Cycle</div>
            <div className="sales-hero-kpi-val">23.6 days</div>
            <div className="sales-hero-kpi-sub">-4.2d Faster</div>
          </div>
          <div className="sales-hero-kpi-tile">
            <div className="sales-hero-kpi-label">Open Pipeline</div>
            <div className="sales-hero-kpi-val">$9.14M</div>
            <div className="sales-hero-kpi-sub">$6.21M Weighted</div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Sales Funnel & Q3 Revenue Forecast ── */}
      <div className="sales-grid-2-1">
        {/* Sales Funnel */}
        <SectionCard
          title="Sales Funnel — Lead to Close"
          action={<Badge variant="brand">17.2% Overall Conversion</Badge>}
        >
          <div className="sales-funnel-list">
            {funnelStages.map(stage => (
              <div key={stage.label} className="sales-funnel-row">
                <span className="sales-funnel-label">{stage.label}</span>
                <div className="sales-funnel-track">
                  <div
                    className="sales-funnel-fill"
                    style={{ width: `${stage.pct}%`, background: stage.fill }}
                  >
                    {stage.count.toLocaleString()}
                  </div>
                </div>
                <span className="sales-funnel-drop">{stage.drop ?? '✓ Won'}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Q3 Revenue Forecast */}
        <SectionCard title="Q3 Revenue Forecast">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>Projected Close:</span>
              <strong style={{ color: 'var(--navy)' }}>$14.9M</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>Committed Deals:</span>
              <strong style={{ color: 'var(--teal)' }}>$6.21M</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>Upsell & Expansion:</span>
              <strong style={{ color: 'var(--blue)' }}>$4.10M</strong>
            </div>

            <div style={{ marginTop: 8, padding: '12px', background: 'var(--teal-l)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="sparkle" size={14} /> AI Forecast Model
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.4 }}>
                Pipeline velocity is healthy. Closing $4.62M in Q3 puts us within 4% of annual stretch targets with strong Q4 expansion carry-over.
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Row 3: Sales Activity Heatmap & Customer Segments ── */}
      <div className="sales-grid-2-1">
        {/* Sales Activity Heatmap */}
        <SectionCard
          title="Sales Activity Heatmap"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
              <span>Low</span>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(13, 148, 136, 0.25)' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(13, 148, 136, 0.5)' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(13, 148, 136, 0.75)' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0d9488' }} />
              <span>High</span>
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <div className="sales-heatmap-grid">
              <span />
              {heatmapHours.map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textAlign: 'center' }}>{h}</span>
              ))}

              {heatmapDays.map((day, dIdx) => (
                <React.Fragment key={day}>
                  <span className="sales-heatmap-day-label">{day}</span>
                  {heatmapMatrix[dIdx].map((lvl, hIdx) => (
                    <div
                      key={hIdx}
                      className={`sales-heatmap-cell level-${lvl}`}
                      title={`${day} @ ${heatmapHours[hIdx]}: Level ${lvl} activity`}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Customer Segments */}
        <SectionCard title="Customer Segments">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Enterprise</span>
                <span style={{ color: 'var(--teal)', fontWeight: 700 }}>55% ($2.54M)</span>
              </div>
              <div style={{ height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '55%', background: 'var(--teal)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Mid-Market</span>
                <span style={{ color: 'var(--blue)', fontWeight: 700 }}>25% ($1.15M)</span>
              </div>
              <div style={{ height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '25%', background: 'var(--blue)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>SMB</span>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>15% ($693K)</span>
              </div>
              <div style={{ height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '15%', background: '#f59e0b' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Startup</span>
                <span style={{ color: 'var(--purple)', fontWeight: 700 }}>5% ($231K)</span>
              </div>
              <div style={{ height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '5%', background: 'var(--purple)' }} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Row 4: Sales Leaderboard Podium & AI Risk Deals ── */}
      <div className="sales-grid-1-1">
        {/* Sales Leaderboard Podium */}
        <SectionCard
          title="Sales Rep Leaderboard"
          action={<Badge variant="brand">Q3 Quota Attainment</Badge>}
        >
          <div className="sales-podium-container">
            {/* 2nd Place */}
            <div className="sales-podium-col">
              <PersonAvatar name="Tanya Rossi" size={36} />
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)' }}>Tanya R.</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>$1.15M</div>
              <div className="sales-podium-block sales-podium-2">
                <span style={{ fontSize: 18 }}>2</span>
                <span style={{ fontSize: 10 }}>115%</span>
              </div>
            </div>

            {/* 1st Place */}
            <div className="sales-podium-col">
              <div style={{ color: '#f59e0b', fontSize: 16 }}>👑</div>
              <PersonAvatar name="Jordan Myers" size={42} />
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)' }}>Jordan M.</div>
              <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>$1.42M</div>
              <div className="sales-podium-block sales-podium-1">
                <span style={{ fontSize: 22 }}>1</span>
                <span style={{ fontSize: 11 }}>142%</span>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="sales-podium-col">
              <PersonAvatar name="Grace Kim" size={34} />
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)' }}>Grace K.</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>$1.05M</div>
              <div className="sales-podium-block sales-podium-3">
                <span style={{ fontSize: 16 }}>3</span>
                <span style={{ fontSize: 10 }}>105%</span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* AI Risk Deals */}
        <SectionCard
          title="AI Risk Deals & Slippage Radar"
          action={
            <Button variant="ghost" size="xs" onClick={() => showAlert('Opening AI deal recovery playbook for at-risk deals...', { variant: 'success' })}>
              <Icon name="sparkle" size={12} /> Playbook
            </Button>
          }
        >
          <div>
            {riskDeals.map(d => (
              <div key={d.name} className="sales-risk-deal-item">
                <div className="sales-risk-deal-left">
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: d.risk === 'High' ? 'var(--red-l)' : 'var(--gold-l)', color: d.risk === 'High' ? 'var(--red)' : 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="alertTriangle" size={15} />
                  </div>
                  <div>
                    <div className="sales-risk-deal-title">{d.name}</div>
                    <div className="sales-risk-deal-sub">{d.days}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{d.amount}</div>
                  <Badge variant={d.risk === 'High' ? 'error' : 'warning'}>{d.risk} Risk</Badge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ── Row 5: Conversion Journey Horizontal Milestone Bar ── */}
      <SectionCard title="Conversion Journey & Velocity Milestones">
        <div className="sales-journey-bar">
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">6,840</div>
            <div className="sales-journey-step-label">First Touch</div>
            <div className="sales-journey-step-time">Day 0</div>
          </div>
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">4,444</div>
            <div className="sales-journey-step-label">Contacted</div>
            <div className="sales-journey-step-time">Avg 2.4 days</div>
          </div>
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">2,814</div>
            <div className="sales-journey-step-label">Demo Scheduled</div>
            <div className="sales-journey-step-time">Avg 5.8 days</div>
          </div>
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">1,412</div>
            <div className="sales-journey-step-label">Negotiated</div>
            <div className="sales-journey-step-time">Avg 14.2 days</div>
          </div>
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">1,180</div>
            <div className="sales-journey-step-label">Closed Won</div>
            <div className="sales-journey-step-time">Avg 23.6 days</div>
          </div>
          <div className="sales-journey-step">
            <div className="sales-journey-step-count">404</div>
            <div className="sales-journey-step-label">Expansion</div>
            <div className="sales-journey-step-time">Day 90+</div>
          </div>
        </div>
      </SectionCard>

      {/* ── Row 6: Recent Closed Orders Table ── */}
      <SectionCard
        title="Recent Closed Deals & Orders"
        action={<Button variant="ghost" size="xs" onClick={() => navigate('/crm/pipeline')}>View Full Ledger</Button>}
      >
        <div className="sales-table-container">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Client Partner</th>
                <th>Account Executive</th>
                <th>Amount</th>
                <th>Closing Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{o.id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CompanyAvatar name={o.customer} size={26} shape="square" />
                      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{o.customer}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PersonAvatar name={o.rep} size={22} />
                      <span style={{ fontSize: 12 }}>{o.rep}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--navy)' }}>{o.amount}</td>
                  <td style={{ color: 'var(--ink3)' }}>{o.date}</td>
                  <td>
                    <Badge variant={o.status === 'Paid' ? 'success' : o.status === 'Pending' ? 'warning' : 'error'}>
                      {o.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
