import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import type { ProjectOSDetail } from '@hudumika/types';

interface ProjectFinancialsEvmProps {
  projectId?: string;
  project?: ProjectOSDetail;
  currency?: string;
}

export const ProjectFinancialsEvm: React.FC<ProjectFinancialsEvmProps> = ({
  projectId,
  project: propsProject,
  currency = 'TZS',
}) => {
  const [project, setProject] = useState<ProjectOSDetail | null>(propsProject || null);
  const [loading, setLoading] = useState(!propsProject && !!projectId);

  const loadDetail = useCallback(async () => {
    if (propsProject) {
      setProject(propsProject);
      return;
    }
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/v1/project-os/projects/${projectId}/detail`);
      setProject(res.data || res);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, propsProject]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (loading) {
    return <SectionLoading />;
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
        <Icon name="calculator" size={32} style={{ color: 'var(--ink3)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Financials & EVM Engine</div>
        <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4, maxWidth: 440, margin: '4px auto 16px' }}>
          No EVM baselines found for this project yet. Configure baseline budget and work packages to compute Earned Value Analysis.
        </div>
        <Button size="sm" onClick={loadDetail}>Recalculate EVM Metrics</Button>
      </div>
    );
  }

  const rawEvm = project.evm || ({} as any);
  const pv = rawEvm.planned_value ?? rawEvm.pv ?? 0;
  const ev = rawEvm.earned_value ?? rawEvm.ev ?? 0;
  const ac = rawEvm.actual_cost ?? rawEvm.ac ?? 0;
  const bac = rawEvm.budget_at_completion ?? rawEvm.bac ?? project.baseline_budget ?? project.current_budget ?? 0;
  const cv = rawEvm.cost_variance ?? rawEvm.cv ?? (ev - ac);
  const sv = rawEvm.schedule_variance ?? rawEvm.sv ?? (ev - pv);
  const cpi = ac > 0 ? (rawEvm.cpi ?? ev / ac) : 0;
  const spi = pv > 0 ? (rawEvm.spi ?? ev / pv) : 0;
  const eac = rawEvm.estimate_at_completion ?? rawEvm.eac ?? (cpi > 0 ? bac / cpi : bac);
  const etc = rawEvm.estimate_to_complete ?? rawEvm.etc ?? Math.max(0, eac - ac);
  const vac = rawEvm.variance_at_completion ?? rawEvm.vac ?? (bac - eac);
  const tcpi = rawEvm.tcpi ?? (bac !== ac && bac > ac ? (bac - ev) / (bac - ac) : 1.0);

  const activeCurrency = project.currency || currency;
  const formatCurrency = (val: number) => `${activeCurrency} ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const evmBandStyle = (val: number, hasData: boolean) => {
    if (!hasData) return { color: 'var(--ink3)', background: 'var(--bg)', borderColor: 'var(--border)' };
    if (val >= 1.0) return { color: 'var(--green)', background: 'var(--green-l)', borderColor: 'var(--green)' };
    if (val >= 0.85) return { color: 'var(--gold)', background: 'var(--gold-l)', borderColor: 'var(--gold)' };
    return { color: 'var(--red)', background: 'var(--red-l)', borderColor: 'var(--red)' };
  };
  const cpiStyle = evmBandStyle(cpi, ac > 0);
  const spiStyle = evmBandStyle(spi, pv > 0);

  return (
    <div className="space-y-6">
      {/* EVM Header & Mathematical Performance Summary */}
      <div style={{ background: 'hsl(var(--primary))', borderRadius: 'var(--r-lg)', padding: '24px 32px', color: 'hsl(var(--primary-foreground))', border: '1px solid var(--teal)', boxShadow: 'var(--elev)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 24, position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>
                EVM Financial Cockpit
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Earned Value Management
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.85, maxWidth: 540 }}>
              Cost and schedule control — Planned Value (PV), Earned Value (EV), and Actual Cost (AC).
            </p>
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ padding: 16, borderRadius: 'var(--r)', border: '1px solid', textAlign: 'center', minWidth: 110, ...cpiStyle }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>CPI</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{ac > 0 ? cpi.toFixed(2) : '—'}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.9 }}>{ac <= 0 ? 'No recorded actuals' : cpi === 1 ? 'On budget' : cpi > 1 ? 'Under budget' : 'Cost overrun'}</div>
            </div>

            <div style={{ padding: 16, borderRadius: 'var(--r)', border: '1px solid', textAlign: 'center', minWidth: 110, ...spiStyle }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>SPI</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{pv > 0 ? spi.toFixed(2) : '—'}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.9 }}>{pv <= 0 ? 'No planned value yet' : spi === 1 ? 'On schedule' : spi > 1 ? 'Ahead of schedule' : 'Behind schedule'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Mathematical Triad: PV, EV, AC, BAC */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Planned Value */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground dark:text-muted-foreground text-xs font-semibold uppercase">
            <span>Planned Value (PV)</span>
            <Icon name="calendar" size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div className="text-xl font-bold text-foreground mt-2">
            {formatCurrency(pv)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Budgeted cost of work scheduled to date
          </p>
        </div>

        {/* Earned Value */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground dark:text-muted-foreground text-xs font-semibold uppercase">
            <span>Earned Value (EV)</span>
            <Icon name="checkCircle" size={16} style={{ color: 'var(--green)' }} />
          </div>
          <div className="text-xl font-bold mt-2" style={{ color: 'var(--green)' }}>
            {formatCurrency(ev)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Budgeted cost of work performed (physical progress)
          </p>
        </div>

        {/* Actual Cost */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground dark:text-muted-foreground text-xs font-semibold uppercase">
            <span>Actual Cost (AC)</span>
            <Icon name="dollarSign" size={16} style={{ color: 'var(--red)' }} />
          </div>
          <div className="text-xl font-bold mt-2" style={{ color: 'var(--red)' }}>
            {formatCurrency(ac)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Total actual expenditure incurred on work
          </p>
        </div>

        {/* Budget At Completion */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground dark:text-muted-foreground text-xs font-semibold uppercase">
            <span>Budget at Completion (BAC)</span>
            <Icon name="layers" size={16} className="text-primary" />
          </div>
          <div className="text-xl font-bold text-foreground mt-2">
            {formatCurrency(bac)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Total baseline contractual project budget
          </p>
        </div>
      </div>

      {/* EVM Variances & Forecast Projections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Variances Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Icon name="activity" size={16} className="text-primary" />
            Cost & Schedule Variances
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Cost Variance (CV = EV - AC)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {cv >= 0 ? 'Surplus / under planned expenditure' : 'Deficit / cost overrun'}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: cv >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {cv >= 0 ? `+${formatCurrency(cv)}` : formatCurrency(cv)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Schedule Variance (SV = EV - PV)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {sv >= 0 ? 'Ahead of baseline schedule' : 'Behind schedule milestones'}
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: sv >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {sv >= 0 ? `+${formatCurrency(sv)}` : formatCurrency(sv)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Variance at Completion (VAC = BAC - EAC)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Projected budget variance at final project handover
                </div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: vac >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {vac >= 0 ? `+${formatCurrency(vac)}` : formatCurrency(vac)}
              </div>
            </div>
          </div>
        </div>

        {/* Forecast Projections Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Icon name="trendingUp" size={16} className="text-primary" />
            Forecast Projections & TCPI
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Estimate at Completion (EAC = BAC / CPI)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Total expected final cost based on current performance
                </div>
              </div>
              <div className="text-base font-bold text-foreground">
                {formatCurrency(eac)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  Estimate to Complete (ETC = EAC - AC)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Remaining capital needed to complete the project
                </div>
              </div>
              <div className="text-base font-bold text-foreground">
                {formatCurrency(etc)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-card border border-border/50">
              <div>
                <div className="text-xs font-bold text-foreground">
                  To-Complete Performance Index (TCPI)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Cost efficiency required on remaining work to meet BAC
                </div>
              </div>
              <div className="text-base font-bold text-primary">
                {Number(tcpi).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
