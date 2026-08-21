import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

/**
 * HuduBI's configurable widget/report builder (ClearOS M9) — turns the
 * previous fixed five-endpoint executive snapshot into pickable, savable,
 * date-filterable widgets. Every metric here is a real, curated piece of
 * hudubi.routes.ts's own pre-existing queries (see hudubi-widgets.service.ts) —
 * not a freeform query tool.
 */

interface MetricInfo { key: string; label: string; defaultChartType: 'number' | 'bar' | 'line' | 'table'; supportsDateRange: boolean; }
interface Widget { id: string; name: string; metric_key: string; chart_type: 'number' | 'bar' | 'line' | 'table'; filters: { date_from?: string; date_to?: string } | string; sort_order: number; }
interface MetricRow { label: string; value: number; }

function parseFilters(f: Widget['filters']): { date_from?: string; date_to?: string } {
  if (typeof f === 'string') { try { return JSON.parse(f); } catch { return {}; } }
  return f || {};
}

function BarList({ rows }: { rows: MetricRow[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No data.</div>}
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--ink2)' }}>{r.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.value.toLocaleString()}</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((r.value / max) * 100)}%`, background: 'var(--teal)', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WidgetCard({ widget, onDelete }: { widget: Widget; onDelete: (id: string) => void }) {
  const [data, setData] = useState<MetricRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/hudubi/widgets/${widget.id}/data`)
      .then((res: any) => setData(res?.rows ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [widget.id]);

  return (
    <SectionCard
      title={widget.name}
      collapsible={false}
      action={<Button size="icon" variant="ghost" onClick={() => onDelete(widget.id)}><Icon name="trash" size={14} /></Button>}
    >
      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Loading…</div>
      ) : widget.chart_type === 'number' ? (
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)' }}>{(data?.[0]?.value ?? 0).toLocaleString()}</div>
      ) : (
        <BarList rows={data ?? []} />
      )}
    </SectionCard>
  );
}

export function HuduBIDashboardBuilder() {
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', metricKey: '', chartType: '' as '' | 'number' | 'bar' | 'line' | 'table', dateFrom: '', dateTo: '' });
  const [preview, setPreview] = useState<MetricRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/hudubi/metrics').catch(() => []),
      apiFetch('/v1/hudubi/widgets').catch(() => []),
    ]).then(([m, w]) => { setMetrics(m); setWidgets(w); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const selectedMetric = metrics.find(m => m.key === form.metricKey);

  useEffect(() => {
    if (!form.metricKey) { setPreview(null); return; }
    setPreviewing(true);
    const params = new URLSearchParams();
    if (form.dateFrom) params.set('date_from', form.dateFrom);
    if (form.dateTo) params.set('date_to', form.dateTo);
    apiFetch(`/v1/hudubi/metrics/${form.metricKey}/preview?${params.toString()}`)
      .then((res: any) => setPreview(res?.rows ?? []))
      .catch(() => setPreview(null))
      .finally(() => setPreviewing(false));
  }, [form.metricKey, form.dateFrom, form.dateTo]);

  async function saveWidget() {
    if (!form.name.trim() || !form.metricKey) { setError('Name and metric are required.'); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch('/v1/hudubi/widgets', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(), metricKey: form.metricKey,
          chartType: form.chartType || undefined,
          filters: { date_from: form.dateFrom || undefined, date_to: form.dateTo || undefined },
        }),
      });
      setForm({ name: '', metricKey: '', chartType: '', dateFrom: '', dateTo: '' });
      setPreview(null);
      setShowForm(false);
      load();
    } catch (err: any) { setError(err.message || 'Failed to save widget'); }
    finally { setSaving(false); }
  }

  async function deleteWidget(id: string) {
    const ok = await showConfirm('Remove this widget from your dashboard?', { variant: 'warning', confirmLabel: 'Remove' });
    if (!ok) return;
    try { await apiFetch(`/v1/hudubi/widgets/${id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { showAlert(err.message || 'Could not remove widget.', { variant: 'error' }); }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['HuduBI', 'Dashboard', 'Builder']}
        titlePlain="Dashboard"
        titleEm="builder"
        subtitle="Pick from real metrics already backing the executive snapshot, filter by date, and save what you want to see."
        actions={<Button onClick={() => setShowForm(s => !s)}><Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add widget'}</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {showForm && (
          <SectionCard title="New widget" collapsible={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Name *</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Active cases this quarter" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Metric *</label>
                <Select value={form.metricKey} onValueChange={v => setForm(p => ({ ...p, metricKey: v, chartType: '' }))}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="Choose a metric…" /></SelectTrigger>
                  <SelectContent>{metrics.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedMetric && selectedMetric.defaultChartType !== 'number' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Chart type</label>
                  <Select value={form.chartType || selectedMetric.defaultChartType} onValueChange={v => setForm(p => ({ ...p, chartType: v as any }))}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar</SelectItem>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="table">Table</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedMetric?.supportsDateRange && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>From</label>
                    <DatePicker date={parseDateOnly(form.dateFrom)} onChange={d => setForm(p => ({ ...p, dateFrom: toDateOnlyString(d) }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>To</label>
                    <DatePicker date={parseDateOnly(form.dateTo)} onChange={d => setForm(p => ({ ...p, dateTo: toDateOnlyString(d) }))} />
                  </div>
                </>
              )}
            </div>

            {form.metricKey && (
              <div style={{ padding: '12px 14px', borderRadius: 9, background: 'var(--bg)', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Preview</div>
                {previewing ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Loading…</div>
                ) : (form.chartType || selectedMetric?.defaultChartType) === 'number' ? (
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{(preview?.[0]?.value ?? 0).toLocaleString()}</div>
                ) : (
                  <BarList rows={preview ?? []} />
                )}
              </div>
            )}

            {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
            <Button disabled={saving} onClick={saveWidget}>{saving ? 'Saving…' : 'Save widget'}</Button>
          </SectionCard>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : widgets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No widgets saved yet — add one above.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {widgets.map(w => <WidgetCard key={w.id} widget={w} onDelete={deleteWidget} />)}
          </div>
        )}
      </div>
    </div>
  );
}
