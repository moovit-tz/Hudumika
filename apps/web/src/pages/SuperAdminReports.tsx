import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Combobox, type ComboboxOption } from '../components/ui/combobox.js';
import { DateRangePicker } from '../components/ui/date-picker.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { DataTable, ClickableBarChart, ExportButton, exportCsv, type ColumnDef } from '../components/AnalyticsKit.js';
import type { DateRange } from 'react-day-picker';
import './SuperAdminReports.css';

interface MetricDef {
  app_id: string;
  key: string;
  label: string;
  table: string;
  dimension: string;
  agg: 'count' | 'sum';
}

interface MetricRow {
  tenant_id: string;
  tenant_name: string;
  bucket: string;
  value: number;
}

interface ReportDefinition {
  id: string;
  name: string;
  app_id: string;
  metric_key: string;
  filters: { tenant_id?: string; date_from?: string; date_to?: string };
  created_at: string;
}

interface ReportRun {
  id: string;
  app_id: string;
  metric_key: string;
  status: string;
  row_count: number | null;
  duration_ms: number | null;
  started_at: string;
  report_name: string | null;
  run_by_name: string | null;
  error: string | null;
}

const APP_LABELS: Record<string, string> = {
  clearos: 'ClearOS', finops: 'FinOps', nexushr: 'NexusHR', tracking: 'Tracking', complyos: 'ComplyOS',
};
const APP_ICONS: Record<string, IconName> = {
  clearos: 'ship', finops: 'dollarSign', nexushr: 'users', tracking: 'truck', complyos: 'shield',
};
const BAR_COLORS = ['#0052CC', '#00B8D9', '#36B37E', '#6554C0', '#FF5630', '#FFAB00', '#2684FF', '#205081'];

export function SuperAdminReports() {
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [tenants, setTenants] = useState<ComboboxOption[]>([]);
  const [savedReports, setSavedReports] = useState<ReportDefinition[]>([]);
  const [activeView, setActiveView] = useState<string>('');
  const [tenantId, setTenantId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  useEffect(() => {
    apiFetch('/v1/superadmin/reports/metrics').then(setMetrics).catch(() => {});
    apiFetch('/v1/superadmin/reports/definitions').then(setSavedReports).catch(() => {});
    apiFetch('/v1/superadmin/tenants').then((res: any) => {
      const list = Array.isArray(res) ? res : res.tenants || [];
      setTenants(list.map((t: any) => ({ value: t.id, label: t.name })));
    }).catch(() => {});
  }, []);

  const activeMetric = metrics.find(m => m.key === activeView);

  async function runActiveMetric(metricKey: string, filters: { tenant_id?: string; date_from?: string; date_to?: string }, reportDefinitionId?: string) {
    const metric = metrics.find(m => m.key === metricKey);
    if (!metric) return;
    setLoading(true);
    setRunError(null);
    try {
      const res = await apiFetch('/v1/superadmin/reports/run', {
        method: 'POST',
        body: JSON.stringify({ app_id: metric.app_id, metric_key: metricKey, filters, report_definition_id: reportDefinitionId }),
      });
      setRows(res.rows || []);
    } catch (err: any) {
      setRunError(err?.message || 'Failed to run report');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function selectMetric(metricKey: string) {
    setActiveView(metricKey);
    setSaveFlash(false);
    const filters = {
      tenant_id: tenantId || undefined,
      date_from: dateRange?.from?.toISOString(),
      date_to: dateRange?.to?.toISOString(),
    };
    runActiveMetric(metricKey, filters);
  }

  function selectSavedReport(def: ReportDefinition) {
    setActiveView(def.metric_key);
    setTenantId(def.filters.tenant_id || '');
    setDateRange(
      def.filters.date_from || def.filters.date_to
        ? { from: def.filters.date_from ? new Date(def.filters.date_from) : undefined, to: def.filters.date_to ? new Date(def.filters.date_to) : undefined }
        : undefined
    );
    setSaveFlash(false);
    runActiveMetric(def.metric_key, def.filters, def.id);
  }

  function applyFilters() {
    if (!activeView) return;
    runActiveMetric(activeView, {
      tenant_id: tenantId || undefined,
      date_from: dateRange?.from?.toISOString(),
      date_to: dateRange?.to?.toISOString(),
    });
  }

  async function loadRuns() {
    setActiveView('__history__');
    try {
      setRuns(await apiFetch('/v1/superadmin/reports/runs'));
    } catch { setRuns([]); }
  }

  async function saveAsReport() {
    if (!activeMetric || !saveName.trim()) return;
    setSaving(true);
    try {
      const def = await apiFetch('/v1/superadmin/reports/definitions', {
        method: 'POST',
        body: JSON.stringify({
          name: saveName.trim(), app_id: activeMetric.app_id, metric_key: activeMetric.key,
          filters: { tenant_id: tenantId || undefined, date_from: dateRange?.from?.toISOString(), date_to: dateRange?.to?.toISOString() },
        }),
      });
      setSavedReports(prev => [def, ...prev]);
      setSaveName('');
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1600);
    } catch { /* surfaced via unset saveFlash */ } finally { setSaving(false); }
  }

  async function deleteReport(id: string) {
    await apiFetch(`/v1/superadmin/reports/definitions/${id}`, { method: 'DELETE' }).catch(() => {});
    setSavedReports(prev => prev.filter(r => r.id !== id));
  }

  const combined = useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const r of rows) byBucket.set(r.bucket, (byBucket.get(r.bucket) || 0) + r.value);
    return Array.from(byBucket.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const tenantColumns: ColumnDef<MetricRow>[] = [
    { key: 'tenant', label: 'Tenant', sortValue: r => r.tenant_name, render: r => r.tenant_name },
    { key: 'bucket', label: activeMetric?.dimension || 'Bucket', sortValue: r => r.bucket, render: r => r.bucket },
    { key: 'value', label: activeMetric?.agg === 'sum' ? 'Total' : 'Count', align: 'right', sortValue: r => r.value, render: r => r.value.toLocaleString() },
  ];

  const runColumns: ColumnDef<ReportRun>[] = [
    { key: 'report', label: 'Report', sortValue: r => r.report_name || '', render: r => r.report_name || <span style={{ color: 'var(--ink3)' }}>Ad hoc</span> },
    { key: 'metric', label: 'Metric', sortValue: r => r.metric_key, render: r => metrics.find(m => m.key === r.metric_key)?.label || r.metric_key },
    { key: 'status', label: 'Status', sortValue: r => r.status, render: r => (
      <Badge variant={r.status === 'succeeded' ? 'success' : 'error'}>{r.status}</Badge>
    ) },
    { key: 'rows', label: 'Rows', align: 'right', sortValue: r => r.row_count || 0, render: r => r.row_count ?? '—' },
    { key: 'duration', label: 'Duration', align: 'right', sortValue: r => r.duration_ms || 0, render: r => r.duration_ms != null ? `${r.duration_ms}ms` : '—' },
    { key: 'runBy', label: 'Run by', sortValue: r => r.run_by_name || '', render: r => r.run_by_name || '—' },
    { key: 'started', label: 'Started', sortValue: r => r.started_at, render: r => new Date(r.started_at).toLocaleString() },
  ];

  return (
    <div className="sar-root">
      <PageHeader
        crumbs={['HuduBI', 'Reports']}
        titlePlain="Cross-tenant"
        titleEm="reports"
        subtitle="Cross-tenant metrics per app — combined or scoped to a single tenant, saved for re-use, and exportable."
      />

      <div className="sar-layout">
        <nav className="sar-rail">
          {Object.keys(APP_LABELS).map(appId => {
            const appMetrics = metrics.filter(m => m.app_id === appId);
            if (!appMetrics.length) return null;
            return (
              <div key={appId}>
                <div className="sar-rail-group-label">
                  <Icon name={APP_ICONS[appId]} size={13} /> {APP_LABELS[appId]}
                </div>
                {appMetrics.map(m => (
                  <button key={m.key} type="button"
                    className={`sar-rail-item${activeView === m.key ? ' sar-rail-item--active' : ''}`}
                    onClick={() => selectMetric(m.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
            );
          })}

          {savedReports.length > 0 && (
            <div>
              <div className="sar-rail-group-label">Saved Reports</div>
              {savedReports.map(def => (
                <div key={def.id} className="sar-saved-row">
                  <button type="button"
                    className={`sar-rail-item${activeView === def.metric_key ? ' sar-rail-item--active' : ''}`}
                    onClick={() => selectSavedReport(def)}>
                    {def.name}
                  </button>
                  <button type="button" className="sar-saved-delete" title="Delete report" onClick={() => deleteReport(def.id)}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="sar-rail-group-label">Observability</div>
            <button type="button"
              className={`sar-rail-item${activeView === '__history__' ? ' sar-rail-item--active' : ''}`}
              onClick={loadRuns}>
              Run History
            </button>
          </div>
        </nav>

        <div className="sar-panel">
          {!activeView && (
            <div className="sar-empty">Pick a metric on the left to see combined and per-tenant data.</div>
          )}

          {activeView === '__history__' && (
            <div>
              <h2 className="sar-panel-title">Run History</h2>
              <DataTable rows={runs} columns={runColumns} rowKey={r => r.id} emptyMessage="No runs yet." />
            </div>
          )}

          {activeMetric && (
            <div>
              <h2 className="sar-panel-title">{activeMetric.label}</h2>

              <div className="sar-filters">
                <Combobox
                  options={[{ value: '', label: 'All tenants (combined)' }, ...tenants]}
                  value={tenantId}
                  onChange={v => { setTenantId(v); }}
                  placeholder="All tenants (combined)"
                  className="sar-filter-combobox"
                />
                <DateRangePicker range={dateRange} onChange={setDateRange} placeholder="All time" />
                <Button size="sm" onClick={applyFilters} disabled={loading}>{loading ? 'Running…' : 'Apply'}</Button>
                <ExportButton onClick={() => exportCsv(
                  `${activeMetric.key}.csv`,
                  ['Tenant', activeMetric.dimension, activeMetric.agg === 'sum' ? 'Total' : 'Count'],
                  rows.map(r => [r.tenant_name, r.bucket, r.value])
                )} />
              </div>

              {runError && <p className="sar-error">{runError}</p>}

              <div className="sar-save-row">
                <Input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this view to save it…" className="sar-save-input" />
                <Button size="sm" variant="outline" onClick={saveAsReport} disabled={!saveName.trim() || saving}>
                  {saveFlash ? 'Saved!' : saving ? 'Saving…' : 'Save as Report'}
                </Button>
              </div>

              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <ClickableBarChart
                  labels={combined.map(([bucket]) => bucket)}
                  values={combined.map(([, value]) => value)}
                  barColors={combined.map((_, i) => BAR_COLORS[i % BAR_COLORS.length])}
                  yLabel={activeMetric.agg === 'sum' ? 'Total' : 'Count'}
                />
              </div>

              <DataTable rows={rows} columns={tenantColumns} rowKey={r => `${r.tenant_id}-${r.bucket}`} emptyMessage="No data for this selection." pageSize={10} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
