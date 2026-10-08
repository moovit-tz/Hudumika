import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { MGMT_ROLES } from '../lib/permissions.js';

// Mirrors metrics-registry.service.ts's own METRICS_MGMT_ROLES exactly —
// MGMT_ROLES plus FINANCE, since a finance officer manages the AR/AP and
// trial-balance alerts even though they aren't in the platform's general
// management-roles set.
const ALERT_MGMT_ROLES = [...MGMT_ROLES, 'FINANCE'];

interface AlertRule {
  id: string;
  metric_key: string;
  name: string;
  comparator: 'below' | 'above';
  threshold: number;
  window_days: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  last_state: 'ok' | 'breach';
  last_fired_at: string | null;
}

interface MetricDef {
  id: string;
  metric_key: string;
  name: string;
  description: string;
  app: string;
  module: string | null;
  domain: string;
  kind: 'declarative' | 'special';
  config: { table?: string; sumColumn?: string; dimension?: string; sourceTables?: string[]; formula?: string };
  unit: string;
  format: string;
  owner: string | null;
  visibility: 'standard' | 'restricted';
}

const DOMAIN_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  operational: 'info', business: 'brand', financial: 'warning', customer: 'success', employee: 'error', technical: 'gray',
};

function formatValue(v: number, format: string, unit: string): string {
  if (format === 'percent') return `${v}%`;
  if (format === 'duration') return `${v}h`;
  if (format === 'currency') return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : Math.round(v).toLocaleString();
  return v.toLocaleString();
}

const SEVERITY_VARIANT: Record<string, 'info' | 'warning' | 'error'> = { info: 'info', warning: 'warning', critical: 'error' };

/** Existing alert rules for this one metric, plus (for a management role)
 *  an inline form to add one. Real CRUD against /v1/metrics/alerts — no
 *  local-only state pretending to be a saved rule. */
function AlertsMiniSection({ metricKey, canManage }: { metricKey: string; canManage: boolean }) {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [comparator, setComparator] = useState<'below' | 'above'>('below');
  const [threshold, setThreshold] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch('/v1/metrics/alerts')
      .then((r: any) => setRules((r.data ?? []).filter((x: AlertRule) => x.metric_key === metricKey)))
      .catch(() => setRules([]));
  }, [metricKey]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    const t = Number(threshold);
    if (!Number.isFinite(t)) return;
    setSaving(true);
    try {
      await apiFetch('/v1/metrics/alerts', {
        method: 'POST',
        body: JSON.stringify({ metricKey, name: `${metricKey} ${comparator} ${t}`, comparator, threshold: t, severity }),
      });
      setCreating(false);
      setThreshold('');
      load();
    } catch { /* surfaced by apiFetch's own toast */ }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    await apiFetch(`/v1/metrics/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  async function toggle(id: string, enabled: boolean) {
    await apiFetch(`/v1/metrics/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }).catch(() => {});
    load();
  }

  if (rules === null) return null;

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 6 }}><b style={{ color: 'var(--ink2)' }}>Alerts</b></div>
      {rules.length === 0 && !creating && <div style={{ fontSize: 12, color: 'var(--ink3)' }}>No alert rules on this metric yet.</div>}
      {rules.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span aria-label={`Alert state: ${r.last_state}`} style={{ width: 7, height: 7, borderRadius: '50%', background: r.last_state === 'breach' ? 'var(--red)' : 'var(--green)', flexShrink: 0 }} />
          <span style={{ color: 'var(--ink)' }}>{r.comparator} {r.threshold}</span>
          <Badge variant={SEVERITY_VARIANT[r.severity]}>{r.severity}</Badge>
          {!r.enabled && <Badge variant="gray">Disabled</Badge>}
          {canManage && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => toggle(r.id, !r.enabled)} style={{ fontSize: 11, color: 'var(--teal-d)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-ui-native-button="">
                {r.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" onClick={() => remove(r.id)} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-ui-native-button="">
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
      {canManage && (
        creating ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Select value={comparator} onValueChange={value => setComparator(value as typeof comparator)}>
              <SelectTrigger className="w-[100px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="below">Below</SelectItem><SelectItem value="above">Above</SelectItem></SelectContent>
            </Select>
            <Input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Threshold" className="w-[110px] text-xs" />
            <Select value={severity} onValueChange={value => setSeverity(value as typeof severity)}>
              <SelectTrigger className="w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="info">Info</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={saving || !threshold} onClick={submit}>Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)} style={{ fontSize: 11.5, color: 'var(--teal-d)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }} data-ui-native-button="">
            + Add alert
          </button>
        )
      )}
    </div>
  );
}

/** One registry row: name/description, source-app + domain badges, a live
 *  value fetched from this tenant's own data, and an expandable lineage
 *  panel — "where did this number come from?" answered from the registry's
 *  own config, not a separate doc. */
function MetricRow({ def }: { def: MetricDef }) {
  const { user } = useAuth();
  const canManageAlerts = ALERT_MGMT_ROLES.includes(user?.role as any);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState<{ value: number; asOf: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/v1/metrics/${encodeURIComponent(def.metric_key)}/value?days=30`)
      .then((r: any) => { if (!cancelled) setValue(r); })
      .catch(() => { if (!cancelled) setError('—'); });
    return () => { cancelled = true; };
  }, [def.metric_key]);

  const lineage = def.kind === 'declarative'
    ? `${def.config.sumColumn ? `SUM(${def.config.sumColumn})` : 'COUNT(*)'} FROM ${def.config.table}${def.config.dimension ? ` GROUP BY ${def.config.dimension}` : ''} — last 30 days`
    : def.config.formula || 'Computed by a dedicated service function.';
  const sourceTables = def.kind === 'declarative' ? [def.config.table].filter(Boolean) as string[] : (def.config.sourceTables || []);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 4px', cursor: 'pointer' }}
      >
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} style={{ color: 'var(--ink3)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{def.name}</span>
            <code style={{ fontSize: 10.5, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>{def.metric_key}</code>
            {def.visibility === 'restricted' && <Badge variant="warning">Restricted</Badge>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{def.description}</div>
        </div>
        <Badge variant="gray">{def.app}</Badge>
        <Badge variant={DOMAIN_VARIANT[def.domain] || 'gray'}>{def.domain}</Badge>
        <div style={{ width: 90, textAlign: 'right', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
          {error ? <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>{error}</span>
            : value ? formatValue(value.value, def.format, def.unit)
            : <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>…</span>}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '4px 4px 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
            <b style={{ color: 'var(--ink2)' }}>How this is calculated</b> — {lineage}
          </div>
          {sourceTables.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sourceTables.map(t => <code key={t} style={{ fontSize: 10.5, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink2)' }}>{t}</code>)}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 16 }}>
            {def.module && <span><b style={{ color: 'var(--ink2)' }}>Module</b> — {def.module}</span>}
            {def.owner && <span><b style={{ color: 'var(--ink2)' }}>Owner</b> — {def.owner}</span>}
            {value && <span><b style={{ color: 'var(--ink2)' }}>As of</b> — {new Date(value.asOf).toLocaleTimeString()}</span>}
          </div>
          <AlertsMiniSection metricKey={def.metric_key} canManage={canManageAlerts} />
        </div>
      )}
    </div>
  );
}

export function HuduBIMetricExplorer() {
  const [searchParams] = useSearchParams();
  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState<string>(searchParams.get('app') || 'all');

  useEffect(() => {
    apiFetch('/v1/metrics/definitions')
      .then((r: any) => setDefs(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const apps = useMemo(() => Array.from(new Set(defs.map(d => d.app))).sort(), [defs]);
  const filtered = useMemo(() => defs.filter(d => {
    if (appFilter !== 'all' && d.app !== appFilter) return false;
    if (search && !(`${d.name} ${d.description} ${d.metric_key}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [defs, appFilter, search]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['HuduBI', 'Metric Explorer']}
        titlePlain="Metric"
        titleEm="explorer"
        subtitle="Every metric registered on the platform, its live value for your workspace, and where the number actually comes from."
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input-field"
          placeholder="Search metrics…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <button
          type="button"
          onClick={() => setAppFilter('all')}
          className="btn-sm"
          style={{
            padding: '6px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: '1px solid var(--border)',
            background: appFilter === 'all' ? 'var(--teal)' : 'transparent',
            color: appFilter === 'all' ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
          }}
         data-ui-native-button="">
          All apps
        </button>
        {apps.map(a => (
          <button
            key={a}
            type="button"
            onClick={() => setAppFilter(a)}
            style={{
              padding: '6px 12px', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: appFilter === a ? 'var(--teal)' : 'transparent',
              color: appFilter === a ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
              textTransform: 'capitalize',
            }}
           data-ui-native-button="">
            {a}
          </button>
        ))}
      </div>

      {loading && <SectionCard><SectionLoading /></SectionCard>}

      {!loading && (
        <SectionCard title={`${filtered.length} registered metric${filtered.length === 1 ? '' : 's'}`}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '12px 4px' }}>No metrics match this filter.</div>
          ) : (
            <div>{filtered.map(d => <MetricRow key={d.metric_key} def={d} />)}</div>
          )}
        </SectionCard>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
        This catalog is the platform's Metric Registry (migration 411) — the same declarative-metric engine HuduBI's Dashboard Builder widgets already run on, plus real Bliss support metrics (SLA compliance, CSAT, first-response time) shared with the Support Center's own dashboard rather than computed twice. <code style={{ fontFamily: 'var(--font)' }}>domain_events</code> and <code style={{ fontFamily: 'var(--font)' }}>metric_definitions</code> are also queryable from the platform Query Builder.
      </div>
    </div>
  );
}
