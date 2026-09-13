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
  currency = 'KES',
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
  const cpi = rawEvm.cpi || (ac > 0 ? ev / ac : 1.0);
  const spi = rawEvm.spi || (pv > 0 ? ev / pv : 1.0);
  const eac = rawEvm.estimate_at_completion ?? rawEvm.eac ?? (cpi > 0 ? bac / cpi : bac);
  const etc = rawEvm.estimate_to_complete ?? rawEvm.etc ?? Math.max(0, eac - ac);
  const vac = rawEvm.variance_at_completion ?? rawEvm.vac ?? (bac - eac);
  const tcpi = rawEvm.tcpi ?? (bac !== ac && bac > ac ? (bac - ev) / (bac - ac) : 1.0);

  const activeCurrency = project.currency || currency;
  const formatCurrency = (val: number) => `${activeCurrency} ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cpiBadge = cpi >= 1.0 ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300' : cpi >= 0.85 ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-300' : 'text-rose-500 bg-rose-50 dark:bg-rose-950/50 border-rose-300';
  const spiBadge = spi >= 1.0 ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300' : spi >= 0.85 ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50 border-amber-300' : 'text-rose-500 bg-rose-50 dark:bg-rose-950/50 border-rose-300';

  return (
    <div className="space-y-6">
      {/* EVM Header & Mathematical Performance Summary */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 sm:p-8 text-white border border-slate-700/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                ANSI/PMI Standard EVM Engine
              </span>
              <span className="text-xs text-slate-400">Real-time DB-calculated indicators</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Earned Value Management (EVM) Financial Cockpit
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Quantitative cost and schedule control measuring Planned Value (PV), Earned Value (EV), and Actual Cost (AC).
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl border ${cpiBadge} text-center min-w-[110px]`}>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">CPI</div>
              <div className="text-2xl font-black mt-1">{(cpi || 1).toFixed(2)}</div>
              <div className="text-[10px] mt-0.5 opacity-90">{cpi >= 1.0 ? 'Under Budget' : 'Cost Overrun'}</div>
            </div>

            <div className={`p-4 rounded-xl border ${spiBadge} text-center min-w-[110px]`}>
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">SPI</div>
              <div className="text-2xl font-black mt-1">{(spi || 1).toFixed(2)}</div>
              <div className="text-[10px] mt-0.5 opacity-90">{spi >= 1.0 ? 'Ahead of Sched' : 'Behind Sched'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Mathematical Triad: PV, EV, AC, BAC */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Planned Value */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
            <span>Planned Value (PV)</span>
            <Icon name="calendar" size={16} className="text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
            {formatCurrency(pv)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Budgeted cost of work scheduled to date
          </p>
        </div>

        {/* Earned Value */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
            <span>Earned Value (EV)</span>
            <Icon name="checkCircle" size={16} className="text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatCurrency(ev)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Budgeted cost of work performed (physical progress)
          </p>
        </div>

        {/* Actual Cost */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
            <span>Actual Cost (AC)</span>
            <Icon name="dollarSign" size={16} className="text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            {formatCurrency(ac)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Total actual expenditure incurred on work
          </p>
        </div>

        {/* Budget At Completion */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
            <span>Budget at Completion (BAC)</span>
            <Icon name="layers" size={16} className="text-teal-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
            {formatCurrency(bac)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Total baseline contractual project budget
          </p>
        </div>
      </div>

      {/* EVM Variances & Forecast Projections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Variances Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Icon name="activity" size={16} className="text-teal-500" />
            Cost & Schedule Variances
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Cost Variance (CV = EV - AC)
                </div>
                <div className="text-[11px] text-slate-400">
                  {cv >= 0 ? 'Surplus / under planned expenditure' : 'Deficit / cost overrun'}
                </div>
              </div>
              <div className={`text-base font-bold ${cv >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {cv >= 0 ? `+${formatCurrency(cv)}` : formatCurrency(cv)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Schedule Variance (SV = EV - PV)
                </div>
                <div className="text-[11px] text-slate-400">
                  {sv >= 0 ? 'Ahead of baseline schedule' : 'Behind schedule milestones'}
                </div>
              </div>
              <div className={`text-base font-bold ${sv >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {sv >= 0 ? `+${formatCurrency(sv)}` : formatCurrency(sv)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Variance at Completion (VAC = BAC - EAC)
                </div>
                <div className="text-[11px] text-slate-400">
                  Projected budget variance at final project handover
                </div>
              </div>
              <div className={`text-base font-bold ${vac >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {vac >= 0 ? `+${formatCurrency(vac)}` : formatCurrency(vac)}
              </div>
            </div>
          </div>
        </div>

        {/* Forecast Projections Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Icon name="trendingUp" size={16} className="text-teal-500" />
            Forecast Projections & TCPI
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Estimate at Completion (EAC = BAC / CPI)
                </div>
                <div className="text-[11px] text-slate-400">
                  Total expected final cost based on current performance
                </div>
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {formatCurrency(eac)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Estimate to Complete (ETC = EAC - AC)
                </div>
                <div className="text-[11px] text-slate-400">
                  Remaining capital needed to complete the project
                </div>
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {formatCurrency(etc)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  To-Complete Performance Index (TCPI)
                </div>
                <div className="text-[11px] text-slate-400">
                  Cost efficiency required on remaining work to meet BAC
                </div>
              </div>
              <div className="text-base font-bold text-teal-600 dark:text-teal-400">
                {(tcpi || 1).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
