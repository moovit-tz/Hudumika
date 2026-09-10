import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select.js';
import { showAlert } from '../../lib/alert.js';

type EntityType = 'lead' | 'deal' | 'customer';
interface FieldDef { id: string; field_key: string; label: string; type: 'text' | 'number' | 'date' | 'select' | 'checkbox'; options: string[] }

const NONE = '__none__';

/**
 * Renders whatever custom fields an admin has defined for this entity type
 * (migration 453) as editable inputs, loading and saving their values for
 * one record. Mounts on the Lead detail and the Pipeline deal editor —
 * customers can follow the same one-line pattern.
 */
export function CustomFieldsPanel({ entityType, subjectId, heading }: { entityType: EntityType; subjectId: string; heading?: string }) {
  const [defs, setDefs] = useState<FieldDef[] | null>(null);
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([
        apiFetch(`/v1/crm/custom-fields/defs?entity_type=${entityType}`),
        apiFetch(`/v1/crm/custom-fields/values?entity_type=${entityType}&subject_id=${subjectId}`),
      ]);
      setDefs(Array.isArray(d) ? d : []);
      setValues(v || {});
      setDirty(false);
    } catch { setDefs([]); }
  }, [entityType, subjectId]);

  useEffect(() => { setDefs(null); load(); }, [load]);

  function set(defId: string, value: string | null) {
    setValues(prev => ({ ...prev, [defId]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/crm/custom-fields/values', {
        method: 'PUT',
        body: JSON.stringify({ entity_type: entityType, subject_id: subjectId, values }),
      });
      setDirty(false);
    } catch (err: any) {
      showAlert(err.message || 'Failed to save custom fields');
    } finally {
      setSaving(false);
    }
  }

  if (defs === null || defs.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(heading ? { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 } : {}) }}>
      {heading && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{heading}</div>}
      {defs.map(f => {
        const v = values[f.id] ?? '';
        return (
          <label key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{f.label}</span>
            {f.type === 'checkbox' ? (
              <input type="checkbox" checked={v === 'true'} onChange={e => set(f.id, e.target.checked ? 'true' : 'false')} style={{ width: 16, height: 16 }} />
            ) : f.type === 'select' ? (
              <Select value={v || NONE} onValueChange={val => set(f.id, val === NONE ? null : val)}>
                <SelectTrigger className="input-field" style={{ height: 34 }}><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <input
                className="input-field" style={{ height: 34 }}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={v} onChange={e => set(f.id, e.target.value || null)}
              />
            )}
          </label>
        );
      })}
      {dirty && (
        <button type="button" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save custom fields'}
        </button>
      )}
    </div>
  );
}
