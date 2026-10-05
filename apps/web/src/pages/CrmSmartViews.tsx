import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader } from '../components/ui/card.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { MetricsRow } from '../components/MetricCard.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Input } from '../components/ui/input.js';
import { Banner } from '../components/ui/alert.js';

type EntityType = 'lead' | 'deal' | 'customer';
type FieldSpec = { kind: 'text' | 'uuid' | 'bool' | 'date' | 'num' | 'label'; col?: string; ops: string[] };
type Catalog = Record<EntityType, Record<string, FieldSpec>>;

interface Rule { field: string; op: string; value?: string | number | boolean | null }
interface SmartView { id: string; entity_type: EntityType; name: string; match_type: 'all' | 'any'; rules: Rule[]; count: number }

const OP_LABEL: Record<string, string> = {
  eq: 'is', neq: 'is not', contains: 'contains', is_set: 'is set', is_empty: 'is empty',
  gt: '>', gte: '≥', lt: '<', lte: '≤', is_true: 'yes', is_false: 'no',
  has: 'has label', not_has: "doesn't have label", within_days: 'in last … days', before_days: 'more than … days ago',
};
const NO_VALUE_OPS = new Set(['is_set', 'is_empty', 'is_true', 'is_false']);

function fmtRule(r: Rule, resolveLabel: (id?: string | number | boolean | null) => string): string {
  const opl = OP_LABEL[r.op] ?? r.op;
  if (NO_VALUE_OPS.has(r.op)) return `${r.field} ${opl}`;
  if (r.op === 'within_days' || r.op === 'before_days') return `${r.field} ${opl.replace('…', String(r.value ?? '?'))}`;
  // A label rule's value is a label id — shown by name, not the raw UUID a
  // human reading their own saved view would have no way to recognize.
  if (r.field === 'label') return `${r.field} ${opl} "${resolveLabel(r.value)}"`;
  return `${r.field} ${opl} ${r.value ?? ''}`;
}

function RuleEditor({ entity, catalog, rules, onChange, labels }: {
  entity: EntityType; catalog: Catalog; rules: Rule[]; onChange: (r: Rule[]) => void; labels: { id: string; name: string }[];
}) {
  const fields = Object.keys(catalog[entity] || {});
  function patch(i: number, p: Partial<Rule>) { onChange(rules.map((r, j) => j === i ? { ...r, ...p } : r)); }
  function changeField(i: number, field: string) {
    const ops = catalog[entity][field]?.ops || [];
    patch(i, { field, op: ops[0] || 'eq', value: NO_VALUE_OPS.has(ops[0]) ? null : '' });
  }
  return (
    <div className="flex flex-col gap-2">
      {rules.map((r, i) => {
        const spec = catalog[entity][r.field];
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <Select value={r.field} onValueChange={v => changeField(i, v)}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{fields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={r.op} onValueChange={v => patch(i, { op: v, value: NO_VALUE_OPS.has(v) ? null : (r.value ?? '') })}>
              <SelectTrigger className="w-full sm:w-38"><SelectValue /></SelectTrigger>
              <SelectContent>{(spec?.ops || []).map(o => <SelectItem key={o} value={o}>{OP_LABEL[o] ?? o}</SelectItem>)}</SelectContent>
            </Select>
            {!NO_VALUE_OPS.has(r.op) && spec?.kind === 'label' ? (
              // A label rule's value is a label id, not free text — the caller
              // has no way to know a label's UUID by heart, so this needs a
              // real picker over the tenant's own labels (GET /v1/crm/labels),
              // not the plain text box every other field kind uses.
              <Select value={String(r.value ?? '')} onValueChange={v => patch(i, { value: v })}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={labels.length ? 'Pick a label…' : 'No labels yet'} /></SelectTrigger>
                <SelectContent>{labels.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : !NO_VALUE_OPS.has(r.op) && (
              <Input
                className="w-full sm:w-40"
                type={spec?.kind === 'num' || r.op === 'within_days' || r.op === 'before_days' ? 'number' : 'text'}
                value={String(r.value ?? '')}
                onChange={e => patch(i, { value: e.target.value })}
                placeholder="value"
              />
            )}
            <Button type="button" variant="outline" size="icon" onClick={() => onChange(rules.filter((_, j) => j !== i))} disabled={rules.length === 1} aria-label="Remove rule">
              <Icon name="x" size={12} />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...rules, { field: Object.keys(catalog[entity])[0], op: 'eq', value: '' }])}>
        <Icon name="plus" size={12} /> Add rule
      </Button>
    </div>
  );
}

export function CrmSmartViews() {
  const navigate = useNavigate();
  const [entity, setEntity] = useState<EntityType>('lead');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const [views, setViews] = useState<SmartView[] | null>(null);
  const [selected, setSelected] = useState<SmartView | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; match_type: 'all' | 'any'; rules: Rule[] } | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  useEffect(() => { apiFetch('/v1/crm/smart-views/catalog').then(data => { setCatalog(data); setLoadErrors(e => e.filter(x => x !== 'filter catalog')); }).catch(() => setLoadErrors(e => e.includes('filter catalog') ? e : [...e, 'filter catalog'])); }, []);
  useEffect(() => { apiFetch('/v1/crm/labels').then(data => { setLabels(data); setLoadErrors(e => e.filter(x => x !== 'labels')); }).catch(() => { setLabels([]); setLoadErrors(e => e.includes('labels') ? e : [...e, 'labels']); }); }, []);
  const labelName = useCallback((id?: string | number | boolean | null) => labels.find(l => l.id === id)?.name ?? String(id ?? ''), [labels]);

  const load = useCallback(() => {
    apiFetch(`/v1/crm/smart-views?entity_type=${entity}`).then(data => { setViews(data); setLoadErrors(e => e.filter(x => x !== 'saved views')); }).catch(() => { setViews([]); setLoadErrors(e => e.includes('saved views') ? e : [...e, 'saved views']); });
  }, [entity]);
  useEffect(() => { setSelected(null); setResults(null); load(); }, [load]);

  useEffect(() => {
    if (!selected) { setResults(null); return; }
    apiFetch(`/v1/crm/smart-views/${selected.id}/results`).then(data => { setResults(data); setLoadErrors(e => e.filter(x => x !== 'view results')); }).catch(() => { setResults([]); setLoadErrors(e => e.includes('view results') ? e : [...e, 'view results']); });
  }, [selected]);

  async function save() {
    if (!editing || !editing.name.trim()) return;
    try {
      if (editing.id) {
        await apiFetch(`/v1/crm/smart-views/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name.trim(), match_type: editing.match_type, rules: editing.rules }) });
      } else {
        await apiFetch('/v1/crm/smart-views', { method: 'POST', body: JSON.stringify({ entity_type: entity, name: editing.name.trim(), match_type: editing.match_type, rules: editing.rules }) });
      }
      setEditing(null);
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to save'); }
  }

  async function remove(v: SmartView) {
    if (!(await showConfirm(`Delete the "${v.name}" view? The ${v.entity_type}s it matched aren't affected.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/crm/smart-views/${v.id}`, { method: 'DELETE' });
      if (selected?.id === v.id) setSelected(null);
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to delete'); }
  }

  const ENTITIES: EntityType[] = ['lead', 'deal', 'customer'];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader crumbs={['CRM', 'Saved Views']} titlePlain="Saved" titleEm="views" subtitle="A filter you name once and reopen forever — membership recomputed every time." />

      {loadErrors.length > 0 && <Banner variant="error" title="Some saved-view data could not be loaded">Unavailable: {loadErrors.join(', ')}. Refresh and try again.</Banner>}

      <MetricsRow cards={ENTITIES.map(e => ({
        title: (e + 's').toUpperCase(),
        value: e === entity && views !== null ? String(views.length) : '—',
        loading: e === entity && views === null,
        emphasis: e === entity ? 'primary' as const : 'default' as const,
        onClick: () => { setEntity(e); setSelected(null); },
        icon: 'layers' as const,
      }))} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm"
          onClick={() => setEditing({ name: '', match_type: 'all', rules: [{ field: catalog ? Object.keys(catalog[entity])[0] : 'stage', op: 'eq', value: '' }] })}>
          <Icon name="plus" size={13} /> New view
        </Button>
      </div>

      {editing && catalog && (
        <Card>
          <CardHeader className="border-b border-border p-5">
            <p className="text-sm font-bold text-foreground">{editing.id ? 'Edit view' : `New ${entity} view`}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5">
            <Input placeholder="e.g. Nairobi leads over 10M" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Match
              <Select value={editing.match_type} onValueChange={v => setEditing({ ...editing, match_type: v as 'all' | 'any' })}>
                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">all</SelectItem><SelectItem value="any">any</SelectItem></SelectContent>
              </Select>
              of these rules
            </div>
            <RuleEditor entity={entity} catalog={catalog} rules={editing.rules} onChange={r => setEditing({ ...editing, rules: r })} labels={labels} />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={!editing.name.trim()} onClick={save}>{editing.id ? 'Save' : 'Create'}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {views === null ? <SectionLoading />
            : views.length === 0 ? <p className="text-sm italic text-muted-foreground">No saved {entity} views yet.</p>
            : views.map(v => (
              <button key={v.id} type="button" onClick={() => setSelected(v)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selected?.id === v.id ? 'border-(--teal) bg-(--teal-l)' : 'border-border bg-card hover:bg-muted/20'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{v.name}</span>
                  <span className="mono text-xs text-muted-foreground">{v.count}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{v.rules.map(r => fmtRule(r, labelName)).join(v.match_type === 'any' ? '  ·  or  ·  ' : '  ·  and  ·  ')}</p>
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={e => { e.stopPropagation(); setEditing({ id: v.id, name: v.name, match_type: v.match_type, rules: v.rules }); }}
                    className="text-[11px] font-semibold text-(--teal) hover:underline">Edit</button>
                  <button type="button" onClick={e => { e.stopPropagation(); remove(v); }}
                    className="text-[11px] font-semibold text-(--red) hover:underline">Delete</button>
                </div>
              </button>
            ))}
        </div>

        <div>
          {!selected ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
              Pick a view to see who's in it right now.
            </div>
          ) : results === null ? (
            <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground"><SectionLoading /></div>
          ) : results.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center text-sm italic text-muted-foreground">Nothing matches this view right now.</div>
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 text-xs font-bold text-muted-foreground">
                {results.length} {entity}{results.length === 1 ? '' : 's'}{results.length > 200 ? ' · showing first 200' : ''}
              </div>
              <div className="divide-y divide-border">
                {results.slice(0, 200).map((row: any) => (
                  <button type="button" key={row.id} onClick={() => navigate(entity === 'lead' ? `/crm/leads?lead=${row.id}` : entity === 'deal' ? `/crm/pipeline?deal=${row.id}` : `/crm/customers?id=${row.id}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/20">
                    <span className="font-semibold text-foreground">{row.company || row.name}</span>
                    <span className="mono text-xs text-muted-foreground">{row.stage || row.account_status || ''}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
