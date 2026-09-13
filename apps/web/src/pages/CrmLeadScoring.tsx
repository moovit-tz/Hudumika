import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionLoading } from '../components/ui/spinner.js';

type FieldSpec = { kind: 'text' | 'num' | 'date'; ops: string[] };
interface Rule { id: string; label: string; field: string; op: string; value: string | null; points: number; active: boolean }

const OP_LABEL: Record<string, string> = {
  eq: 'is', neq: 'is not', contains: 'contains', gt: '>', gte: '≥', lt: '<', lte: '≤',
};

export function CrmLeadScoring() {
  const [fields, setFields] = useState<Record<string, FieldSpec>>({});
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [draft, setDraft] = useState({ label: '', field: 'stage', op: 'eq', value: '', points: 10 });

  useEffect(() => { apiFetch('/v1/crm/lead-scoring/fields').then(setFields).catch(() => {}); }, []);
  const load = useCallback(() => { apiFetch('/v1/crm/lead-scoring/rules').then(setRules).catch(() => setRules([])); }, []);
  useEffect(() => { load(); }, [load]);

  const fieldNames = Object.keys(fields);
  const draftOps = fields[draft.field]?.ops ?? [];

  async function add() {
    if (!draft.label.trim()) return;
    try {
      await apiFetch('/v1/crm/lead-scoring/rules', {
        method: 'POST',
        body: JSON.stringify({ ...draft, label: draft.label.trim(), value: draft.value || null, points: Number(draft.points) || 0 }),
      });
      setDraft({ label: '', field: 'stage', op: 'eq', value: '', points: 10 });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to add rule'); }
  }
  async function toggle(r: Rule) {
    try { await apiFetch(`/v1/crm/lead-scoring/rules/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: !r.active }) }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed'); }
  }
  async function remove(r: Rule) {
    if (!(await showConfirm(`Delete the "${r.label}" scoring rule?`, { confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/crm/lead-scoring/rules/${r.id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed'); }
  }

  return (
    <div style={{ padding: '20px 0 40px', maxWidth: 760 }}>
      <PageHeader crumbs={['CRM', 'Settings']} titlePlain="Lead" titleEm="scoring" subtitle="Rule-based, transparent: a lead's score is the sum of the rules it matches, clamped 0–100." />

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, margin: '20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Add a rule</div>
        <input className="input-field" style={{ height: 34 }} placeholder="Rule name — e.g. Qualified stage" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select value={draft.field} onValueChange={v => setDraft({ ...draft, field: v, op: fields[v]?.ops[0] ?? 'eq' })}>
            <SelectTrigger style={{ width: 150, height: 34 }}><SelectValue /></SelectTrigger>
            <SelectContent>{fieldNames.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={draft.op} onValueChange={v => setDraft({ ...draft, op: v })}>
            <SelectTrigger style={{ width: 100, height: 34 }}><SelectValue /></SelectTrigger>
            <SelectContent>{draftOps.map(o => <SelectItem key={o} value={o}>{OP_LABEL[o] ?? o}</SelectItem>)}</SelectContent>
          </Select>
          <input className="input-field" style={{ width: 140, height: 34 }}
            type={fields[draft.field]?.kind === 'num' ? 'number' : 'text'}
            placeholder="value" value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} />
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>→</span>
          <input className="input-field" style={{ width: 80, height: 34 }} type="number" value={draft.points} onChange={e => setDraft({ ...draft, points: Number(e.target.value) })} />
          <span style={{ fontSize: 13, color: 'var(--ink3)' }}>points</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={!draft.label.trim()} onClick={add}><Icon name="plus" size={13} /> Add</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules === null ? <SectionLoading />
          : rules.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>No scoring rules yet — every lead scores 0 until you add some.</div>
          : rules.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px', opacity: r.active ? 1 : 0.5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{r.field} {OP_LABEL[r.op] ?? r.op} {r.value ?? ''} → <b style={{ color: r.points >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.points > 0 ? '+' : ''}{r.points}</b></div>
              </div>
              <button type="button" onClick={() => toggle(r)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--ink2)' }}>
                {r.active ? 'Active' : 'Off'}
              </button>
              <button type="button" onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}><Icon name="trash" size={14} /></button>
            </div>
          ))}
      </div>
    </div>
  );
}
