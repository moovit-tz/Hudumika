import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { apiFetch } from '../../lib/api.js';
import type { ProjectCommandCenterMetrics } from '@hudumika/types';

interface ProjectCommandCenterProps {
  metrics?: ProjectCommandCenterMetrics | null;
  loading?: boolean;
  onSelectProject?: (projectId: string) => void;
  onNavigateToProjects?: (filter?: { industry?: string; health?: string }) => void;
  onNavigateToPortfolios?: () => void;
  onNavigateToProcurement?: () => void;
  onNavigateToResources?: () => void;
  onNewProject?: () => void;
}

export const ProjectCommandCenter: React.FC<ProjectCommandCenterProps> = ({
  metrics: propsMetrics,
  loading: propsLoading,
  onSelectProject,
  onNavigateToProjects,
  onNavigateToPortfolios,
  onNavigateToProcurement,
  onNavigateToResources,
  onNewProject,
}) => {
  const [data, setData] = useState<ProjectCommandCenterMetrics | null>(propsMetrics || null);
  const [loading, setLoading] = useState(propsLoading !== undefined ? propsLoading : !propsMetrics);

  const loadMetrics = useCallback(async () => {
    if (propsMetrics) {
      setData(propsMetrics);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/v1/project-os/command-center');
      setData(res.data || res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propsMetrics]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (loading || !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>Loading Project OS Command Center...</p>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
    return `$${Number(val || 0).toLocaleString()}`;
  };

  const cpiHealth = data.portfolio_cpi >= 1.0 ? 'text-emerald-400' : data.portfolio_cpi >= 0.85 ? 'text-amber-400' : 'text-rose-400';
  const spiHealth = data.portfolio_spi >= 1.0 ? 'text-emerald-400' : data.portfolio_spi >= 0.85 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero Banner with Live EVM Radar */}
      <div
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, var(--teal) 50%, hsl(var(--primary)) 100%)',
          borderRadius: 'var(--r-lg)',
          padding: '24px 28px',
          color: 'hsl(var(--primary-foreground))',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', background: 'var(--teal-l)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 'var(--r-sm)', letterSpacing: '0.06em' }}>
                Hudumika Project OS • Global Executive Radar
              </span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Live Enterprise Aggregations</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Multi-Tenant Governance & Portfolio Operations
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.85, maxWidth: 640 }}>
              Real-time earned value indices, stage-gate signoffs, fleet telemetry, and automated procurement across all active capital programs.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--r-lg)', padding: '12px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase' }}>Portfolio CPI</div>
              <div className={`text-2xl font-black ${cpiHealth}`} style={{ marginTop: 2 }}>{data.portfolio_cpi.toFixed(2)}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Cost Efficiency</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--r-lg)', padding: '12px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase' }}>Portfolio SPI</div>
              <div className={`text-2xl font-black ${spiHealth}`} style={{ marginTop: 2 }}>{data.portfolio_spi.toFixed(2)}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Schedule Velocity</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink3)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Total Contract Value</span>
            <Icon name="fileText" size={16} style={{ color: 'var(--teal)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>
            {formatCurrency(data.total_contract_value)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
            Across {data.active_projects} active projects
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink3)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Baseline Budget (BAC)</span>
            <Icon name="dollarSign" size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>
            {formatCurrency(data.total_budget)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
            Actual Spent: <strong>{formatCurrency(data.total_spent)}</strong>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink3)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Total Earned Value (EV)</span>
            <Icon name="checkCircle" size={16} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 8 }}>
            {formatCurrency(data.total_earned_value)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
            Quantified physical progress
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink3)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase' }}>Fleet Utilization</span>
            <Icon name="truck" size={16} style={{ color: 'var(--gold)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', marginTop: 8 }}>
            {data.heavy_machinery_utilization_pct}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
            Machinery active on sites
          </div>
        </div>
      </div>

      {/* Health Distribution & Industry Packs Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
            Portfolio Health Classification
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--green-l)', borderRadius: 'var(--r)', padding: 14, border: '1px solid var(--green)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase' }}>ON TRACK (GREEN)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{data.health_distribution.green}</div>
              <div style={{ fontSize: 11.5, color: 'var(--green)' }}>CPI &ge; 1.0 &bull; SPI &ge; 1.0</div>
            </div>

            <div style={{ background: 'var(--gold-l)', borderRadius: 'var(--r)', padding: 14, border: '1px solid var(--gold)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>AT RISK (AMBER)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', marginTop: 4 }}>{data.health_distribution.amber}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gold)' }}>Cost/time deviation &lt; 15%</div>
            </div>

            <div style={{ background: 'var(--red-l)', borderRadius: 'var(--r)', padding: 14, border: '1px solid var(--red)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>CRITICAL (RED)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)', marginTop: 4 }}>{data.health_distribution.red}</div>
              <div style={{ fontSize: 11.5, color: 'var(--red)' }}>EAC variance &gt; 15%</div>
            </div>

            <div style={{ background: 'var(--teal-l)', borderRadius: 'var(--r)', padding: 14, border: '1px solid var(--teal)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase' }}>STAGE GATES PASSED</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>{data.health_distribution.critical}</div>
              <div style={{ fontSize: 11.5, color: 'var(--teal)' }}>Executive approved</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
            Active Industry Pack Distribution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(data.industry_distribution).map(([ind, count]) => (
              <div
                key={ind}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--r)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textTransform: 'capitalize' }}>
                    {ind.replace('_', ' ')}
                  </span>
                </div>
                <Badge variant="brand">{count} Project{count === 1 ? '' : 's'}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
