import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

type EntityType = 'lead' | 'deal' | 'customer';
type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';
interface FieldDef { id: string; entity_type: EntityType; field_key: string; label: string; type: FieldType; options: string[] }

const TYPE_LABEL: Record<FieldType, string> = { text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Yes / No' };

export function CrmCustomFields() {
  const [entity, setEntity] = useState<EntityType>('lead');
  const [defs, setDefs] = useState<FieldDef[] | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/v1/crm/custom-fields/defs?entity_type=${entity}`).then(setDefs).catch(() => setDefs([]));
  }, [entity]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!label.trim()) return;
    setAdding(true);
    try {
      await apiFetch('/v1/crm/custom-fields/defs', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: entity, label: label.trim(), type,
          options: type === 'select' ? options.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        }),
      });
      setLabel(''); setOptions(''); setType('text');
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to add field'); }
    finally { setAdding(false); }
  }

  async function remove(f: FieldDef) {
    if (!(await showConfirm(`Delete the "${f.label}" field? Its values on every ${f.entity_type} are removed too.`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/crm/custom-fields/defs/${f.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) { showAlert(err.message || 'Failed to delete'); }
  }

  const ENTITIES: EntityType[] = ['lead', 'deal', 'customer'];

  return (
    <div style={{ padding: '20px 0 40px', maxWidth: 720 }}>
      <PageHeader crumbs={['CRM', 'Settings']} titlePlain="Custom" titleEm="fields" subtitle="Add your own attributes to leads, deals and customers — no migration, no code." />

      <div style={{ display: 'flex', gap: 8, margin: '18px 0 20px' }}>
        {ENTITIES.map(e => (
          <button key={e} type="button" onClick={() => setEntity(e)}
            className={e === entity ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} style={{ textTransform: 'capitalize' }}>
            {e}s
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Add a field to {entity}s</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input className="input-field" style={{ width: 200, height: 34 }} placeholder="Field label" value={label} onChange={e => setLabel(e.target.value)} />
          <Select value={type} onValueChange={v => setType(v as FieldType)}>
            <SelectTrigger style={{ width: 140, height: 34 }}><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(TYPE_LABEL) as FieldType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
          {type === 'select' && (
            <input className="input-field" style={{ width: 220, height: 34 }} placeholder="Options, comma-separated" value={options} onChange={e => setOptions(e.target.value)} />
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={adding || !label.trim()} onClick={add}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {defs === null ? <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
          : defs.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>No custom fields on {entity}s yet.</div>
          : defs.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                  {TYPE_LABEL[f.type]}{f.type === 'select' && f.options.length ? ` · ${f.options.join(', ')}` : ''} · key <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{f.field_key}</code>
                </div>
              </div>
              <button type="button" onClick={() => remove(f)} title="Delete field"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
