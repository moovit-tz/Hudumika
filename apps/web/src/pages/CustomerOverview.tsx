import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import { useCompany } from '../data/companyStore.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import './SalesAnalytics.css';

function fmt(n: number, cur = '') {
  if (n >= 1_000_000) return `${cur}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${cur}${(n / 1_000).toFixed(0)}K`;
  return `${cur}${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const CustomerOverview: React.FC = () => {
  const navigate = useNavigate();
  const co = useCompany();
  const cur = co.currency ?? 'USD';

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [deals,   setDeals]   = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [leads,   setLeads]   = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/v1/deals'),
      apiFetch('/v1/deals/metrics'),
      apiFetch('/v1/leads').catch(() => []),
    ]).then(([d, m, l]) => {
      if (!alive) return;
      setDeals(Array.isArray(d) ? d : []);
      setMetrics(m ?? null);
      setLeads(Array.isArray(l) ? l : []);
    }).catch((e: any) => {
      if (alive) setError(e?.message ?? 'Could not load CRM analytics.');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // ── computed ──────────────────────────────────────────────────────────────
  const wonDeals = useMemo(() => deals.filter(d => {
    const stg = (d.stage ?? '').toLowerCase();
    return stg === 'won' || stg === 'closed_won' || stg === 'won_closed';
  }), [deals]);

  const lostDeals = useMemo(() => deals.filter(d => {
    const stg = (d.stage ?? '').toLowerCase();
    return stg === 'lost' || stg === 'closed_lost';
  }), [deals]);

  const openDeals = useMemo(() => deals.filter(d => {
    const stg = (d.stage ?? '').toLowerCase();
    return !['won', 'closed_won', 'won_closed', 'lost', 'closed_lost'].includes(stg);
  }), [deals]);

  const winRate = metrics?.win_rate_30d ?? null;
  const openValue = metrics?.open_value ?? openDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const closedWonValue = wonDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);

  const avgDealSize = wonDeals.length
    ? Math.round(closedWonValue / wonDeals.length)
    : null;

  // Avg sales cycle for closed won deals
  const avgCycleDays = useMemo(() => {
    const cycles = wonDeals
      .filter(d => d.closed_at && d.created_at)
      .map(d => Math.floor((new Date(d.closed_at).getTime() - new Date(d.created_at).getTime()) / 86_400_000))
      .filter(n => n >= 0);
    if (!cycles.length) return null;
    return Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length);
  }, [wonDeals]);

  // At-risk: open deals not moved in 14+ days
  const atRiskDeals = useMemo(() =>
    openDeals
      .filter(d => (d.days_in_stage ?? 0) >= 14)
      .sort((a, b) => (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0))
      .slice(0, 5),
  [openDeals]);

  // Recent closed (won) deals
  const recentWon = useMemo(() =>
    wonDeals
      .filter(d => d.closed_at)
      .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
      .slice(0, 5),
  [wonDeals]);

  // Funnel from leads + pipeline stages
  const funnel = useMemo(() => {
    const leadsByStage: Record<string, number> = {};
    for (const l of leads) leadsByStage[(l.stage ?? 'NEW').toUpperCase()] = (leadsByStage[(l.stage ?? 'NEW').toUpperCase()] ?? 0) + 1;

    const total = leads.length;
    if (total === 0 && deals.length === 0) return null;

    const contacted  = leads.filter(l => l.stage && l.stage !== 'NEW').length;
    const qualified  = leads.filter(l => ['QUALIFIED','PROPOSAL','NEGOTIATION','WON'].includes((l.stage ?? '').toUpperCase())).length;
    const proposal   = leads.filter(l => ['PROPOSAL','NEGOTIATION','WON'].includes((l.stage ?? '').toUpperCase())).length + (metrics?.by_stage ? Object.entries(metrics.by_stage).filter(([k]) => k.toLowerCase().includes('proposal')).reduce((s: number, [, v]: any) => s + v.count, 0) : 0);
    const won        = wonDeals.length;

    // Normalise to top of funnel
    const top = Math.max(total + deals.length, won);
    if (top === 0) return null;

    return [
      { label: 'Leads Captured',  count: total,     pct: 100, color: 'var(--teal)' },
      { label: 'Contacted',       count: contacted,  pct: Math.round((contacted / Math.max(total, 1)) * 100), color: '#14b8a6' },
      { label: 'Qualified',       count: qualified,  pct: Math.round((qualified / Math.max(total, 1)) * 100), color: 'var(--gold)' },
      { label: 'Proposal',        count: proposal,   pct: Math.round((proposal / Math.max(total, 1)) * 100), color: 'var(--blue)' },
      { label: 'Closed Won',      count: won,        pct: Math.round((won / Math.max(total, 1)) * 100), color: 'var(--green)' },
    ];
  }, [leads, wonDeals, deals, metrics]);

  // Weighted forecast
  const weightedForecast = useMemo(() =>
    openDeals.reduce((s, d) => s + (Number(d.value ?? 0) * (d.probability ?? 50) / 100), 0),
  [openDeals]);

  if (loading) return <SkeletonPage variant="dashboard" />;

  const noData = deals.length === 0 && leads.length === 0;

  return (
    <div className="sales-analytics-container">
      <PageHeader
        crumbs={['CRM', 'Overview']}
        titlePlain="CRM"
        titleEm="overview"
        subtitle="Pipeline overview, funnel conversion, rep performance, and deal risk — from your live CRM data."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/crm/pipeline')}>
              <Icon name="briefcase" size={14} /> Pipeline
            </Button>
            <Button variant="default" size="sm" onClick={() => navigate('/crm/sales')}>
              <Icon name="plus" size={14} /> New Deal
            </Button>
          </div>
        }
      />

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--red-l)', color: 'var(--red)', fontSize: 12.5, marginBottom: 18 }}>{error}</div>
      )}

      {noData ? (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="barChart2" size={22} color="var(--teal)" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No CRM data yet</div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
            Add some leads and deals to see your pipeline, funnel, and rep performance here.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="default" size="sm" onClick={() => navigate('/crm/leads')}>Add Leads</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/crm/sales')}>Add Deals</Button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Hero KPIs ── */}
          <div className="sales-hero-banner">
            <div className="sales-hero-left">
              <div className="sales-hero-title-row">
                <h2>Pipeline Summary</h2>
                {winRate !== null && (
                  <span className="sales-hero-badge">{winRate}% win rate (30 days)</span>
                )}
              </div>
              <p className="sales-hero-desc">
                {openDeals.length} open deal{openDeals.length !== 1 ? 's' : ''} worth {fmt(openValue, cur + ' ')}.
                {avgCycleDays !== null ? ` Average close cycle: ${avgCycleDays} days.` : ''}
                {weightedForecast > 0 ? ` Weighted forecast: ${fmt(weightedForecast, cur + ' ')}.` : ''}
              </p>
            </div>
            <div className="sales-hero-kpis">
              <div className="sales-hero-kpi-tile">
                <div className="sales-hero-kpi-label">Open Pipeline</div>
                <div className="sales-hero-kpi-val">{fmt(openValue, cur + ' ')}</div>
                <div className="sales-hero-kpi-sub">{openDeals.length} deals</div>
              </div>
              <div className="sales-hero-kpi-tile">
                <div className="sales-hero-kpi-label">Win Rate (30d)</div>
                <div className="sales-hero-kpi-val">{winRate !== null ? `${winRate}%` : '—'}</div>
                <div className="sales-hero-kpi-sub">{metrics?.closed_30d ?? 0} closed this month</div>
              </div>
              <div className="sales-hero-kpi-tile">
                <div className="sales-hero-kpi-label">Avg Sales Cycle</div>
                <div className="sales-hero-kpi-val">{avgCycleDays !== null ? `${avgCycleDays}d` : '—'}</div>
                <div className="sales-hero-kpi-sub">from create → won</div>
              </div>
              <div className="sales-hero-kpi-tile">
                <div className="sales-hero-kpi-label">Weighted Forecast</div>
                <div className="sales-hero-kpi-val">{fmt(weightedForecast, cur + ' ')}</div>
                <div className="sales-hero-kpi-sub">probability-adjusted</div>
              </div>
            </div>
          </div>

          {/* ── Funnel & Pipeline by Stage ── */}
          <div className="sales-grid-2-1">
            {/* Funnel */}
            <SectionCard
              title="Lead-to-Close Funnel"
              action={funnel && funnel[funnel.length - 1].count > 0 && funnel[0].count > 0
                ? <Badge variant="brand">{Math.round((funnel[funnel.length - 1].count / funnel[0].count) * 100)}% overall conversion</Badge>
                : undefined}
            >
              {funnel ? (
                <div className="sales-funnel-list">
                  {funnel.map(stage => (
                    <div key={stage.label} className="sales-funnel-row">
                      <span className="sales-funnel-label">{stage.label}</span>
                      <div className="sales-funnel-track">
                        <div className="sales-funnel-fill" style={{ width: `${stage.pct}%`, background: stage.color }}>
                          {stage.count.toLocaleString()}
                        </div>
                      </div>
                      <span className="sales-funnel-drop">{stage.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  No lead or deal data to build a funnel yet.
                </div>
              )}
            </SectionCard>

            {/* Pipeline by stage */}
            <SectionCard title="Pipeline by Stage">
              {metrics?.by_stage && Object.keys(metrics.by_stage).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(metrics.by_stage as Record<string, { count: number; value: number }>)
                    .sort((a, b) => b[1].value - a[1].value)
                    .map(([stage, { count, value }]) => {
                      const maxVal = Math.max(...Object.values(metrics.by_stage as Record<string, { count: number; value: number }>).map(v => v.value)) || 1;
                      return (
                        <div key={stage}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink2)', textTransform: 'capitalize' }}>{stage.replace(/_/g, ' ')}</span>
                            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmt(value, cur + ' ')} · {count} deal{count !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(value / maxVal) * 100}%`, background: 'hsl(var(--primary))' }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No stage data yet.</div>
              )}
            </SectionCard>
          </div>

          {/* ── Rep Leaderboard & At-Risk Deals ── */}
          <div className="sales-grid-1-1">
            {/* Rep Leaderboard */}
            <SectionCard
              title="Rep Leaderboard"
              action={<Badge variant="brand">Closed Won Revenue</Badge>}
            >
              {metrics?.leaderboard?.length > 0 ? (
                <>
                  {/* Top 3 podium */}
                  {metrics.leaderboard.length >= 3 && (
                    <div className="sales-podium-container">
                      {[1, 0, 2].map(idx => {
                        const rep = metrics.leaderboard[idx];
                        if (!rep) return null;
                        const podiumClass = idx === 0 ? 'sales-podium-1' : idx === 1 ? 'sales-podium-2' : 'sales-podium-3';
                        const rank = idx + 1;
                        return (
                          <div key={rep.owner_id} className="sales-podium-col">
                            {rank === 1 && <span style={{ fontSize: 14 }}>👑</span>}
                            <PersonAvatar userId={rep.owner_id} name={rep.owner_name} size={rank === 1 ? 42 : 34} />
                            <div style={{ fontSize: rank === 1 ? 12 : 11.5, fontWeight: 700, color: 'var(--ink)' }}>
                              {rep.owner_name.split(' ')[0]} {rep.owner_name.split(' ')[1]?.[0]}.
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{fmt(rep.value, cur + ' ')}</div>
                            <div className={`sales-podium-block ${podiumClass}`}>
                              <span style={{ fontSize: rank === 1 ? 22 : 18 }}>{rank}</span>
                              <span style={{ fontSize: 10 }}>{rep.won} won</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Full list */}
                  <div style={{ marginTop: metrics.leaderboard.length >= 3 ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {metrics.leaderboard.map((rep: any, i: number) => (
                      <div key={rep.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < metrics.leaderboard.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', width: 18, textAlign: 'center' }}>#{i + 1}</span>
                        <PersonAvatar userId={rep.owner_id} name={rep.owner_name} size={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{rep.owner_name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{fmt(rep.value, cur + ' ')}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{rep.won} deals won</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  No closed-won deals yet. Win your first deal to see rep performance here.
                </div>
              )}
            </SectionCard>

            {/* At-Risk Deals */}
            <SectionCard title="At-Risk Deals">
              {atRiskDeals.length > 0 ? (
                <div>
                  {atRiskDeals.map(d => (
                    <div key={d.id} className="sales-risk-deal-item">
                      <div className="sales-risk-deal-left">
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: d.days_in_stage >= 21 ? 'var(--red-l)' : 'var(--gold-l)', color: d.days_in_stage >= 21 ? 'var(--red)' : 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="alertTriangle" size={15} />
                        </div>
                        <div>
                          <div className="sales-risk-deal-title">{d.name || d.customer_name || 'Unnamed Deal'}</div>
                          <div className="sales-risk-deal-sub">
                            {d.days_in_stage} days in "{d.stage}" stage
                            {d.owner_name ? ` · ${d.owner_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{fmt(Number(d.value ?? 0), cur + ' ')}</div>
                        <Badge variant={d.days_in_stage >= 21 ? 'error' : 'warning'}>{d.days_in_stage >= 21 ? 'High' : 'Medium'} Risk</Badge>
                      </div>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" style={{ width: '100%', marginTop: 10 }} onClick={() => navigate('/crm/pipeline')}>
                    View Full Pipeline
                  </Button>
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No stuck deals right now.</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4, opacity: 0.7 }}>Deals in the same stage for 14+ days will appear here.</div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Recent Won Deals ── */}
          <SectionCard
            title="Recent Closed Deals"
            action={<Button variant="ghost" size="xs" onClick={() => navigate('/crm/pipeline')}>View Pipeline</Button>}
          >
            {recentWon.length > 0 ? (
              <div className="sales-table-container">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Owner</th>
                      <th>Value</th>
                      <th>Closed</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentWon.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.name || d.customer_name || '—'}</td>
                        <td>
                          {d.owner_id
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <PersonAvatar userId={d.owner_id} name={d.owner_name ?? '?'} size={22} />
                                <span style={{ fontSize: 12 }}>{d.owner_name ?? '—'}</span>
                              </div>
                            : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Unassigned</span>
                          }
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmt(Number(d.value ?? 0), cur + ' ')}</td>
                        <td style={{ color: 'var(--ink3)', fontSize: 12 }}>{d.closed_at ? fmtDate(d.closed_at) : '—'}</td>
                        <td><Badge variant="success" className="text-[11px]">Won</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No closed-won deals yet. Move a deal to your "Won" stage to see it here.
              </div>
            )}
          </SectionCard>

          {/* ── Pipeline Journey ── */}
          {metrics?.by_stage && Object.keys(metrics.by_stage).length > 0 && (
            <SectionCard title="Pipeline Journey">
              <div className="sales-journey-bar">
                {Object.entries(metrics.by_stage as Record<string, { count: number; value: number }>).map(([stage, { count, value }]) => (
                  <div key={stage} className="sales-journey-step">
                    <div className="sales-journey-step-count">{count}</div>
                    <div className="sales-journey-step-label" style={{ textTransform: 'capitalize' }}>{stage.replace(/_/g, ' ')}</div>
                    <div className="sales-journey-step-time">{fmt(value, cur + ' ')}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
};
