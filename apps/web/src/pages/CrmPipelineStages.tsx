import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { SectionLoading } from '../components/ui/spinner.js';

export interface PipelineStage {
  id: string; key: string; label: string; color: string; position: number;
  is_won: boolean; is_lost: boolean; active: boolean; deal_count: number;
}

// Same fixed palette Pipeline.tsx's kanban columns already draw from — a
// stage's `color` field is one of these names, never a raw hex, so a
// SuperAdmin theme/preset switch still reaches this page (see CLAUDE.md's
// "soft-tint backgrounds" rule).
export const STAGE_COLORS: Record<string, { fg: string; bg: string }> = {
  gold:   { fg: 'var(--gold)',   bg: 'var(--gold-l)' },
  blue:   { fg: 'var(--blue)',   bg: 'var(--blue-l)' },
  teal:   { fg: 'var(--teal)',   bg: 'var(--teal-l)' },
  green:  { fg: 'var(--green)',  bg: 'var(--green-l)' },
  red:    { fg: 'var(--red)',    bg: 'var(--red-l)' },
  purple: { fg: 'var(--purple)', bg: 'var(--purple-l)' },
};
const COLOR_NAMES = Object.keys(STAGE_COLORS);

export function CrmPipelineStages() {
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch('/v1/crm/pipeline-stages').then(setStages).catch(() => setStages([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/v1/crm/pipeline-stages', { method: 'POST', body: JSON.stringify({ label: newLabel.trim(), color: newColor }) });
      setNewLabel('');
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to add stage'); }
    finally { setBusy(false); }
  }

  async function patch(s: PipelineStage, body: Record<string, unknown>) {
    try { await apiFetch(`/v1/crm/pipeline-stages/${s.id}`, { method: 'PATCH', body: JSON.stringify(body) }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to update stage'); }
  }

  async function move(s: PipelineStage, dir: -1 | 1) {
    if (!stages) return;
    const idx = stages.findIndex(x => x.id === s.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    const ids = stages.map(x => x.id);
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    try { await apiFetch('/v1/crm/pipeline-stages/reorder', { method: 'POST', body: JSON.stringify({ ids }) }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to reorder'); }
  }

  async function remove(s: PipelineStage) {
    if (s.deal_count > 0) {
      showAlert(`${s.deal_count} deal${s.deal_count === 1 ? ' is' : 's are'} in "${s.label}" — move them to another stage first.`);
      return;
    }
    if (!(await showConfirm(`Delete the "${s.label}" stage?`, { confirmLabel: 'Delete' }))) return;
    try { await apiFetch(`/v1/crm/pipeline-stages/${s.id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { showAlert(err.message || 'Failed to delete stage'); }
  }

  return (
    <div style={{ padding: '20px 0 40px', maxWidth: 760 }}>
      <PageHeader crumbs={['CRM', 'Settings']} titlePlain="Pipeline" titleEm="stages"
        subtitle="What Pipeline's kanban board shows as columns. Reorder, rename, recolor, or mark a stage Won/Lost to close reporting correctly." />

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, margin: '20px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input-field" style={{ height: 34, flex: 1, minWidth: 180 }} placeholder="New stage name — e.g. Contract sent"
          value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <Select value={newColor} onValueChange={setNewColor}>
          <SelectTrigger style={{ width: 130, height: 34 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: STAGE_COLORS[newColor].fg }} />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {COLOR_NAMES.map(c => (
              <SelectItem key={c} value={c}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: STAGE_COLORS[c].fg }} />
                  {c[0].toUpperCase() + c.slice(1)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!newLabel.trim() || busy} onClick={add}>
          <Icon name="plus" size={13} /> Add stage
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stages === null ? (
          <SectionLoading />
        ) : stages.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>No stages yet.</div>
        ) : stages.map((s, i) => {
          const c = STAGE_COLORS[s.color] ?? STAGE_COLORS.blue;
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'var(--white)',
              border: '1px solid var(--border)', borderLeft: `3px solid ${c.fg}`, borderRadius: 'var(--r-sm)',
              padding: '10px 14px', opacity: s.active ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button type="button" disabled={i === 0} onClick={() => move(s, -1)}
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--border)' : 'var(--ink3)', padding: 0, lineHeight: 0 }}>
                  <Icon name="chevronUp" size={13} />
                </button>
                <button type="button" disabled={i === stages.length - 1} onClick={() => move(s, 1)}
                  style={{ background: 'none', border: 'none', cursor: i === stages.length - 1 ? 'default' : 'pointer', color: i === stages.length - 1 ? 'var(--border)' : 'var(--ink3)', padding: 0, lineHeight: 0 }}>
                  <Icon name="chevronDown" size={13} />
                </button>
              </div>

              <span style={{ width: 12, height: 12, borderRadius: 999, background: c.fg, flexShrink: 0 }} />

              <input
                defaultValue={s.label} key={s.id + s.label}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) patch(s, { label: v }); }}
                className="input-field" style={{ flex: 1, height: 30, fontSize: 13, minWidth: 120 }}
              />

              <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 70, textAlign: 'right' }}>
                {s.deal_count} deal{s.deal_count === 1 ? '' : 's'}
              </span>

              <button type="button" onClick={() => patch(s, { is_won: !s.is_won, is_lost: s.is_won ? s.is_lost : false })}
                style={{
                  background: s.is_won ? 'var(--green-l)' : 'transparent', color: s.is_won ? 'var(--green)' : 'var(--ink3)',
                  border: `1px solid ${s.is_won ? 'var(--green)' : 'var(--border)'}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                Won
              </button>
              <button type="button" onClick={() => patch(s, { is_lost: !s.is_lost, is_won: s.is_lost ? s.is_won : false })}
                style={{
                  background: s.is_lost ? 'var(--red-l)' : 'transparent', color: s.is_lost ? 'var(--red)' : 'var(--ink3)',
                  border: `1px solid ${s.is_lost ? 'var(--red)' : 'var(--border)'}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                Lost
              </button>

              <button type="button" onClick={() => patch(s, { active: !s.active })}
                title={s.active ? 'Hide from the kanban board' : 'Show on the kanban board'}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--ink2)' }}>
                {s.active ? 'Active' : 'Hidden'}
              </button>
              <button type="button" onClick={() => remove(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
