import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Badge } from '../../components/ui/badge.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';

const KPI_MGMT_ROLES = [...MGMT_ROLES, 'FINANCE'];

interface KpiTarget {
  id: string;
  metric_key: string;
  metric_name: string;
  app: string;
  domain: string;
  unit: string;
  format: string;
  target_value: number;
  target_direction: 'above' | 'below';
  warning_threshold: number | null;
  period: string;
  notes: string | null;
  current_value: number;
  status: 'ON_TARGET' | 'AT_RISK' | 'OFF_TARGET';
  progress_pct: number;
  as_of: string;
}

interface MetricDef {
  id: string;
  metric_key: string;
  name: string;
  description: string;
  app: string;
  domain: string;
  unit: string;
  format: string;
}

const STATUS_VARIANTS: Record<string, { label: string; variant: 'success' | 'warning' | 'error'; icon: string }> = {
  ON_TARGET: { label: 'On Target', variant: 'success', icon: 'checkCircle' },
  AT_RISK: { label: 'At Risk', variant: 'warning', icon: 'alertTriangle' },
  OFF_TARGET: { label: 'Off Target', variant: 'error', icon: 'alertCircle' },
};

const DOMAIN_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  operational: 'info',
  business: 'brand',
  financial: 'warning',
  customer: 'success',
  employee: 'error',
  technical: 'gray',
};

function formatMetricVal(v: number, format: string, unit: string): string {
  if (format === 'percentage' || format === 'percent') return `${v}%`;
  if (format === 'duration' || format === 'hours') return `${v}h`;
  if (format === 'currency') return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M ${unit}` : `${Math.round(v).toLocaleString()} ${unit}`;
  return `${v.toLocaleString()} ${unit}`.trim();
}

export function HuduBIKpiCenter() {
  const { user } = useAuth();
  const canManage = !!user && KPI_MGMT_ROLES.includes(user.role);

  const [targets, setTargets] = useState<KpiTarget[] | null>(null);
  const [metricDefs, setMetricDefs] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');

  // Modal form state
  const [showModal, setShowModal] = useState(false);
  const [selectedMetricKey, setSelectedMetricKey] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetDirection, setTargetDirection] = useState<'above' | 'below'>('above');
  const [warningThreshold, setWarningThreshold] = useState('');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [targetsRes, defsRes] = await Promise.all([
        apiFetch('/v1/metrics/kpi-targets'),
        apiFetch('/v1/metrics/definitions').catch(() => ({ data: [] })),
      ]);
      setTargets(targetsRes.data || []);
      setMetricDefs(defsRes.data || []);
    } catch {
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    if (!targets) return { total: 0, onTarget: 0, atRisk: 0, offTarget: 0 };
    return {
      total: targets.length,
      onTarget: targets.filter(t => t.status === 'ON_TARGET').length,
      atRisk: targets.filter(t => t.status === 'AT_RISK').length,
      offTarget: targets.filter(t => t.status === 'OFF_TARGET').length,
    };
  }, [targets]);

  const filteredTargets = useMemo(() => {
    if (!targets) return [];
    return targets.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (domainFilter !== 'all' && t.domain !== domainFilter) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchName = t.metric_name.toLowerCase().includes(query);
        const matchKey = t.metric_key.toLowerCase().includes(query);
        const matchApp = t.app.toLowerCase().includes(query);
        if (!matchName && !matchKey && !matchApp) return false;
      }
      return true;
    });
  }, [targets, statusFilter, domainFilter, search]);

  async function handleSaveTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMetricKey || !targetValue) return;

    setSaving(true);
    try {
      await apiFetch('/v1/metrics/kpi-targets', {
        method: 'POST',
        body: JSON.stringify({
          metricKey: selectedMetricKey,
          targetValue: Number(targetValue),
          targetDirection,
          warningThreshold: warningThreshold ? Number(warningThreshold) : null,
          period,
          notes: notes.trim() || null,
        }),
      });
      setShowModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save KPI target');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedMetricKey('');
    setTargetValue('');
    setTargetDirection('above');
    setWarningThreshold('');
    setPeriod('monthly');
    setNotes('');
  }

  function openEditModal(target: KpiTarget) {
    setSelectedMetricKey(target.metric_key);
    setTargetValue(String(target.target_value));
    setTargetDirection(target.target_direction);
    setWarningThreshold(target.warning_threshold != null ? String(target.warning_threshold) : '');
    setPeriod((target.period as any) || 'monthly');
    setNotes(target.notes || '');
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this KPI target?')) return;
    try {
      await apiFetch(`/v1/metrics/kpi-targets/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete KPI target');
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        crumbs={['HuduBI', 'KPI Center']}
        titlePlain="KPI "
        titleEm="Center"
        subtitle="Set organizational objectives, live thresholds, and monitor real-time health across all departments."
        actions={
          canManage ? (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors"
            >
              <Icon name="plus" size={16} />
              Set KPI Target
            </button>
          ) : undefined
        }
      />

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total KPI Goals</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Icon name="target" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">On Target</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.onTarget}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Icon name="checkCircle" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">At Risk</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats.atRisk}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Icon name="alertTriangle" size={20} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Off Target</p>
            <p className="text-2xl font-bold mt-1 text-rose-600">{stats.offTarget}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
            <Icon name="alertCircle" size={20} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <SectionCard>
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 flex flex-wrap gap-2 items-center">
            <div className="relative min-w-[240px] flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search KPI goals, metric keys, apps..."
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Statuses</option>
              <option value="ON_TARGET">On Target</option>
              <option value="AT_RISK">At Risk</option>
              <option value="OFF_TARGET">Off Target</option>
            </select>

            <select
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All Domains</option>
              <option value="operational">Operational</option>
              <option value="financial">Financial</option>
              <option value="customer">Customer</option>
              <option value="employee">Employee / HR</option>
              <option value="business">Business</option>
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </SectionCard>

      {/* KPI Target Cards Grid */}
      {loading && !targets ? (
        <SectionLoading />
      ) : filteredTargets.length === 0 ? (
        <SectionCard>
          <div className="text-center py-16 text-muted-foreground space-y-3">
            <div className="w-12 h-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
              <Icon name="target" size={24} />
            </div>
            <p className="font-medium text-foreground">No KPI targets defined</p>
            <p className="text-sm max-w-md mx-auto text-muted-foreground">
              Define operational thresholds and targets for SLA compliance, clearance turnaround, headcount, or revenue to monitor progress.
            </p>
            {canManage && (
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-xs"
              >
                <Icon name="plus" size={14} />
                Set First KPI Target
              </button>
            )}
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTargets.map(t => {
            const statusInfo = STATUS_VARIANTS[t.status] || STATUS_VARIANTS.OFF_TARGET;
            const domainVariant = DOMAIN_VARIANTS[t.domain] || 'info';

            const isAbove = t.target_direction === 'above';
            const progressColor =
              t.status === 'ON_TARGET'
                ? 'bg-emerald-500'
                : t.status === 'AT_RISK'
                ? 'bg-amber-500'
                : 'bg-rose-500';

            return (
              <div
                key={t.id}
                className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-all space-y-4"
              >
                {/* Header: Title & Badges */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={domainVariant}>
                          {t.domain}
                        </Badge>
                        <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {t.app}
                        </span>
                        <span className="text-[11px] capitalize text-muted-foreground">
                          • {t.period}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground text-base leading-snug">
                        {t.metric_name}
                      </h3>
                      <p className="text-[11px] font-mono text-muted-foreground">{t.metric_key}</p>
                    </div>

                    <Badge variant={statusInfo.variant}>
                      <Icon name={statusInfo.icon as any} size={12} className="mr-1 inline" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                </div>

                {/* Values & Progress Display */}
                <div className="space-y-3 bg-muted/30 p-3.5 rounded-xl border border-border/40">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground">Current Live</span>
                      <div className="text-2xl font-bold text-foreground">
                        {formatMetricVal(t.current_value, t.format, t.unit)}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">Target Goal</span>
                      <div className="text-sm font-semibold text-foreground">
                        {isAbove ? '≥' : '≤'} {formatMetricVal(t.target_value, t.format, t.unit)}
                      </div>
                      {t.warning_threshold != null && (
                        <div className="text-[11px] text-amber-600">
                          Warn: {formatMetricVal(t.warning_threshold, t.format, t.unit)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.min(t.progress_pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Achievement</span>
                      <span className="font-semibold text-foreground">{t.progress_pct}%</span>
                    </div>
                  </div>
                </div>

                {/* Notes & Actions */}
                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="line-clamp-1 italic max-w-[200px]" title={t.notes || ''}>
                    {t.notes || 'No strategic notes'}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(t)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit target threshold"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 transition-colors"
                        title="Delete target"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Target Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                  <Icon name="target" size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Configure KPI Target</h3>
                  <p className="text-xs text-muted-foreground">Set standing performance goals for your workspace</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTarget} className="space-y-4">
              {/* Metric Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Metric Key <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={selectedMetricKey}
                  onChange={e => setSelectedMetricKey(e.target.value)}
                  className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="">Select a metric definition...</option>
                  {metricDefs.map(m => (
                    <option key={m.metric_key} value={m.metric_key}>
                      [{m.app.toUpperCase()}] {m.name} ({m.metric_key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction & Target Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Direction <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={targetDirection}
                    onChange={e => setTargetDirection(e.target.value as 'above' | 'below')}
                    className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    <option value="above">Greater than or equal (≥ Higher is better)</option>
                    <option value="below">Less than or equal (≤ Lower is better)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Target Goal Value <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={targetValue}
                    onChange={e => setTargetValue(e.target.value)}
                    placeholder="e.g. 95, 24, 5000000"
                    className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Warning Threshold & Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Warning Threshold (Optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={warningThreshold}
                    onChange={e => setWarningThreshold(e.target.value)}
                    placeholder="At-risk trigger value"
                    className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Evaluation Window
                  </label>
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value as any)}
                    className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    <option value="daily">Daily (Last 24h)</option>
                    <option value="weekly">Weekly (Last 7 days)</option>
                    <option value="monthly">Monthly (Last 30 days)</option>
                    <option value="quarterly">Quarterly (Last 90 days)</option>
                  </select>
                </div>
              </div>

              {/* Strategic Notes */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                  Strategic Notes / Description
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. 2026 Q3 operational SLA benchmark agreed with enterprise customs clients..."
                  className="w-full p-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !selectedMetricKey || !targetValue}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {saving ? 'Saving...' : 'Save KPI Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HuduBIKpiCenter;
