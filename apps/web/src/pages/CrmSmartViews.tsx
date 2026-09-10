import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

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

function fmtRule(r: Rule): string {
  const opl = OP_LABEL[r.op] ?? r.op;
  if (NO_VALUE_OPS.has(r.op)) return `${r.field} ${opl}`;
  if (r.op === 'within_days' || r.op === 'before_days') return `${r.field} ${opl.replace('…', String(r.value ?? '?'))}`;
  return `${r.field} ${opl} ${r.value ?? ''}`;
}

function RuleEditor({ entity, catalog, rules, onChange }: {
  entity: EntityType; catalog: Catalog; rules: Rule[]; onChange: (r: Rule[]) => void;
}) {
  const fields = Object.keys(catalog[entity] || {});
  function patch(i: number, p: Partial<Rule>) { onChange(rules.map((r, j) => j === i ? { ...r, ...p } : r)); }
  function changeField(i: number, field: string) {
    const ops = catalog[entity][field]?.ops || [];
    patch(i, { field, op: ops[0] || 'eq', value: NO_VALUE_OPS.has(ops[0]) ? null : '' });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules.map((r, i) => {
        const spec = catalog[entity][r.field];
        return (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={r.field} onValueChange={v => changeField(i, v)}>
              <SelectTrigger style={{ width: 160 }}><SelectValue /></SelectTrigger>
              <SelectContent>{fields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={r.op} onValueChange={v => patch(i, { op: v, value: NO_VALUE_OPS.has(v) ? null : (r.value ?? '') })}>
              <SelectTrigger style={{ width: 150 }}><SelectValue /></SelectTrigger>
              <SelectContent>{(spec?.ops || []).map(o => <SelectItem key={o} value={o}>{OP_LABEL[o] ?? o}</SelectItem>)}</SelectContent>
            </Select>
            {!NO_VALUE_OPS.has(r.op) && (
              <input
                className="input-field" style={{ width: 160, height: 34 }}
                type={spec?.kind === 'num' || r.op === 'within_days' || r.op === 'before_days' ? 'number' : 'text'}
                value={String(r.value ?? '')}
                onChange={e => patch(i, { value: e.target.value })}
                placeholder="value"
              />
            )}
            <button type="button" onClick={() => onChange(rules.filter((_, j) => j !== i))} disabled={rules.length === 1}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', width: 28, height: 28, cursor: 'pointer', color: 'var(--ink3)' }}>
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...rules, { field: Object.keys(catalog[entity])[0], op: 'eq', value: '' }])}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px dashed var(--border)', borderRadius: 'var(--r-sm)', background: 'none', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600, padding: '6px 10px', cursor: 'pointer' }}>
        <Icon name="plus" size={12} /> Add rule
      </button>
    </div>
  );
}

export function CrmSmartViews() {
  const [entity, setEntity] = useState<EntityType>('lead');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [views, setViews] = useState<SmartView[] | null>(null);
  const [selected, setSelected] = useState<SmartView | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; match_type: 'all' | 'any'; rules: Rule[] } | null>(null);

  useEffect(() => { apiFetch('/v1/crm/smart-views/catalog').then(setCatalog).catch(() => {}); }, []);

  const load = useCallback(() => {
    apiFetch(`/v1/crm/smart-views?entity_type=${entity}`).then(setViews).catch(() => setViews([]));
  }, [entity]);
  useEffect(() => { setSelected(null); setResults(null); load(); }, [load]);

  useEffect(() => {
    if (!selected) { setResults(null); return; }
    apiFetch(`/v1/crm/smart-views/${selected.id}/results`).then(setResults).catch(() => setResults([]));
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
    <div style={{ padding: '20px 0 40px' }}>
      <PageHeader crumbs={['CRM']} titlePlain="Saved" titleEm="views" subtitle="A filter you name once and reopen forever — membership recomputed every time." />

      <div style={{ display: 'flex', gap: 8, margin: '18px 0 20px' }}>
        {ENTITIES.map(e => (
          <button key={e} type="button" onClick={() => setEntity(e)}
            className={e === entity ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} style={{ textTransform: 'capitalize' }}>
            {e}s
          </button>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => setEditing({ name: '', match_type: 'all', rules: [{ field: catalog ? Object.keys(catalog[entity])[0] : 'stage', op: 'eq', value: '' }] })}>
          <Icon name="plus" size={13} /> New view
        </button>
      </div>

      {editing && catalog && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{editing.id ? 'Edit view' : `New ${entity} view`}</div>
          <input className="input-field" placeholder="e.g. Nairobi leads over 10M" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink2)' }}>
            Match
            <Select value={editing.match_type} onValueChange={v => setEditing({ ...editing, match_type: v as 'all' | 'any' })}>
              <SelectTrigger style={{ width: 80, height: 32 }}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">all</SelectItem><SelectItem value="any">any</SelectItem></SelectContent>
            </Select>
            of these rules
          </div>
          <RuleEditor entity={entity} catalog={catalog} rules={editing.rules} onChange={r => setEditing({ ...editing, rules: r })} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!editing.name.trim()} onClick={save}>{editing.id ? 'Save' : 'Create'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {views === null ? <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
            : views.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>No saved {entity} views yet.</div>
            : views.map(v => (
              <div key={v.id} onClick={() => setSelected(v)}
                style={{ background: selected?.id === v.id ? 'var(--teal-l)' : 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v.name}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>{v.count}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{v.rules.map(fmtRule).join(v.match_type === 'any' ? '  ·  or  ·  ' : '  ·  and  ·  ')}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button type="button" onClick={e => { e.stopPropagation(); setEditing({ id: v.id, name: v.name, match_type: v.match_type, rules: v.rules }); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal-deep)', fontSize: 11, fontWeight: 600, padding: 0 }}>Edit</button>
                  <button type="button" onClick={e => { e.stopPropagation(); remove(v); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: 0 }}>Delete</button>
                </div>
              </div>
            ))}
        </div>

        <div>
          {!selected ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13, padding: 40, textAlign: 'center' }}>Pick a view to see who's in it right now.</div>
          ) : results === null ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13, padding: 20 }}>Loading results…</div>
          ) : results.length === 0 ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13, padding: 20, fontStyle: 'italic' }}>Nothing matches this view right now.</div>
          ) : (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
                {results.length} {entity}{results.length === 1 ? '' : 's'}
              </div>
              {results.slice(0, 200).map((row: any) => (
                <div key={row.id} style={{ padding: '9px 14px', borderBottom: '1px solid var(--border-soft)', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{row.company || row.name}</span>
                  <span className="mono" style={{ color: 'var(--ink3)' }}>{row.stage || row.account_status || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
