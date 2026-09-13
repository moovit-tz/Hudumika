import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../Icon.js';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover.js';
import { showAlert } from '../../lib/alert.js';

type SubjectType = 'lead' | 'deal' | 'customer';

interface CrmLabel { id: string; name: string; color: string; count?: number }

const COLOR_VAR: Record<string, string> = {
  teal: 'var(--teal)', red: 'var(--red)', gold: 'var(--gold)', green: 'var(--green)', blue: 'var(--blue)', purple: 'var(--purple)',
};
const COLOR_BG: Record<string, string> = {
  teal: 'var(--teal-l)', red: 'var(--red-l)', gold: 'var(--gold-l)', green: 'var(--green-l)', blue: 'var(--blue-l)', purple: 'var(--purple-l)',
};
const PALETTE = Object.keys(COLOR_VAR);

/**
 * Assigned-label chips for one lead/deal/customer, with a "+" popover to
 * attach an existing label or create a new one on the fly — the CRM
 * gap-analysis's tags/segments item, shared across all three subject types
 * via crm_labels/crm_label_mappings (migration 450).
 */
export function LabelChips({ subjectType, subjectId }: { subjectType: SubjectType; subjectId: string }) {
  const [assigned, setAssigned] = useState<CrmLabel[] | null>(null);
  const [all, setAll] = useState<CrmLabel[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAssigned = useCallback(() => {
    apiFetch(`/v1/crm/labels/for?subject_type=${subjectType}&subject_id=${subjectId}`)
      .then((rows: CrmLabel[]) => setAssigned(Array.isArray(rows) ? rows : []))
      .catch(() => setAssigned([]));
  }, [subjectType, subjectId]);

  useEffect(() => { setAssigned(null); loadAssigned(); }, [loadAssigned]);
  useEffect(() => {
    if (open) apiFetch('/v1/crm/labels').then((rows: CrmLabel[]) => setAll(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [open]);

  async function toggle(label: CrmLabel, on: boolean) {
    try {
      if (on) {
        await apiFetch(`/v1/crm/labels/${label.id}/assign`, { method: 'POST', body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId }) });
      } else {
        await apiFetch(`/v1/crm/labels/${label.id}/assign?subject_type=${subjectType}&subject_id=${subjectId}`, { method: 'DELETE' });
      }
      loadAssigned();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update label');
    }
  }

  async function createAndAssign() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const label = await apiFetch('/v1/crm/labels', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      await apiFetch(`/v1/crm/labels/${label.id}/assign`, { method: 'POST', body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId }) });
      setNewName('');
      setAll(prev => [...prev, label]);
      loadAssigned();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create label');
    } finally {
      setCreating(false);
    }
  }

  const assignedIds = new Set((assigned ?? []).map(l => l.id));

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {(assigned ?? []).map(l => (
        <span key={l.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          padding: '3px 9px', borderRadius: 999, background: COLOR_BG[l.color] ?? COLOR_BG.teal, color: COLOR_VAR[l.color] ?? COLOR_VAR.teal,
        }}>
          {l.name}
          <button type="button" onClick={() => toggle(l, false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}>
            <Icon name="x" size={9} />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" title="Add label" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%',
            border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', color: 'var(--ink3)',
          }}>
            <Icon name="plus" size={11} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" style={{ width: 220, padding: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
            {all.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '6px 4px' }}>No labels yet.</div>}
            {all.map(l => {
              const on = assignedIds.has(l.id);
              return (
                <button key={l.id} type="button" onClick={() => toggle(l, !on)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none',
                  background: on ? 'var(--bg)' : 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12.5, color: 'var(--ink)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_VAR[l.color] ?? COLOR_VAR.teal, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{l.name}</span>
                  {on && <Icon name="check" size={12} color="var(--teal)" />}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <input
              className="input-field" style={{ height: 30, fontSize: 12.5 }}
              placeholder="New label…" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createAndAssign(); }}
            />
            <button type="button" className="btn btn-primary btn-sm" style={{ height: 30, padding: '0 10px' }} disabled={creating || !newName.trim()} onClick={createAndAssign}>
              Add
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
