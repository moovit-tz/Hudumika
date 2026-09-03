import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';

/**
 * Onboarding/offboarding checklists — confirmed absent in the audit ("just
 * an invite email and a deactivation queue, no day-1 tasks workflow").
 * A tenant edits ONE template per type here; a real per-person checklist
 * is generated automatically the moment someone actually joins or is
 * deactivated (subscribers/hr-checklists.subscribers.ts), not by hand.
 */

type ChecklistType = 'onboarding' | 'offboarding';

export function HrChecklists() {
  const [tab, setTab] = useState<'active' | 'templates'>('active');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        crumbs={['NexusHR', 'Checklists']}
        titlePlain="Onboarding &"
        titleEm="offboarding"
        subtitle="A checklist a person actually gets, generated automatically the moment they join or leave."
      />
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
        {(['active', 'templates'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--teal)' : 'var(--ink3)', borderBottom: tab === t ? '2px solid var(--teal)' : '2px solid transparent',
            }}>
            {t === 'active' ? 'Active checklists' : 'Templates'}
          </button>
        ))}
      </div>
      {tab === 'active' ? <ActiveChecklists /> : <Templates />}
    </div>
  );
}

const TYPE_BADGE: Record<ChecklistType, 'success' | 'warning'> = { onboarding: 'success', offboarding: 'warning' };

function ActiveChecklists() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = typeFilter ? `?type=${typeFilter}` : '';
    apiFetch(`/v1/hr/checklists${qs}`).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [typeFilter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SingleSelectFilter label="Type" value={typeFilter} onChange={setTypeFilter}
        options={[{ value: 'onboarding', label: 'Onboarding' }, { value: 'offboarding', label: 'Offboarding' }]} />

      <SectionCard padded={false}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>
            No checklists yet — one is created automatically the next time someone joins or is deactivated, as long as a template exists for that type.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  {['Person', 'Type', 'Progress', 'Status', 'Started', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PersonAvatar userId={r.employee_id} name={r.employee_name} size={26} />
                        {r.employee_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}><Badge variant={TYPE_BADGE[r.type as ChecklistType]}>{r.type}</Badge></td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink2)' }}>{r.done_items} / {r.total_items}</td>
                    <td style={{ padding: '12px 14px' }}><Badge variant={r.status === 'completed' ? 'success' : 'gray'}>{r.status.replace('_', ' ')}</Badge></td>
                    <td style={{ padding: '12px 14px', color: 'var(--ink3)' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ink3)' }}><Icon name="chevronRight" size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {openId && <ChecklistDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle: React.CSSProperties = { background: 'var(--white)', borderRadius: 12, padding: 24, width: 480, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: 'var(--elev-lg)' };

function ChecklistDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [item, setItem] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { apiFetch(`/v1/hr/checklists/${id}`).then(setItem).catch(() => setItem(null)); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function toggle(itemId: string, done: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/v1/hr/checklists/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ done }) });
      load();
      onChanged();
    } catch (err: any) {
      showAlert(err.message || 'Could not update that item.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {!item ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{item.employee_name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{item.type === 'onboarding' ? 'Onboarding' : 'Offboarding'} checklist</div>
              </div>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {item.items.map((i: any) => (
                <label key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: busy ? 'default' : 'pointer', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  <input type="checkbox" checked={i.done} disabled={busy} onChange={e => toggle(i.id, e.target.checked)} style={{ marginTop: 2, cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', textDecoration: i.done ? 'line-through' : 'none' }}>{i.label}</div>
                    {i.done && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Done by {i.done_by_name ?? '—'} · {new Date(i.done_at).toLocaleString()}</div>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Templates() {
  const [type, setType] = useState<ChecklistType>('onboarding');
  const [items, setItems] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/v1/hr/checklists/templates/${type}`).then(r => setItems((r.items ?? []).map((i: any) => i.label))).catch(() => setItems([])).finally(() => setLoading(false));
  }, [type]);
  useEffect(() => { load(); }, [load]);

  async function save(nextItems: string[]) {
    setItems(nextItems);
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/checklists/templates/${type}`, { method: 'PUT', body: JSON.stringify({ items: nextItems }) });
    } catch (err: any) {
      showAlert(err.message || 'Could not save the template.', { variant: 'error' });
      load();
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    if (!newLabel.trim()) return;
    save([...items, newLabel.trim()]);
    setNewLabel('');
  }
  function removeItem(i: number) {
    save(items.filter((_, idx) => idx !== i));
  }
  function moveItem(i: number, dir: -1 | 1) {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['onboarding', 'offboarding'] as ChecklistType[]).map(t => (
          <button key={t} type="button" onClick={() => setType(t)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              background: type === t ? 'hsl(var(--primary))' : 'var(--white)', color: type === t ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
            }}>
            {t === 'onboarding' ? 'Onboarding' : 'Offboarding'}
          </button>
        ))}
      </div>

      <SectionCard>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>
            Every real person's checklist is a copy of this list at the moment they {type === 'onboarding' ? 'join' : 'leave'} — editing it later doesn't change checklists already in progress.
          </div>
          {loading ? (
            <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No tasks yet — add the first one below.</div>
                ) : items.map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{label}</span>
                    <button type="button" disabled={saving || i === 0} onClick={() => moveItem(i, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', opacity: i === 0 ? 0.3 : 1 }}><Icon name="chevronUp" size={14} /></button>
                    <button type="button" disabled={saving || i === items.length - 1} onClick={() => moveItem(i, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', opacity: i === items.length - 1 ? 0.3 : 1 }}><Icon name="chevronDown" size={14} /></button>
                    <button type="button" disabled={saving} onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())} placeholder={type === 'onboarding' ? 'Set up laptop and accounts' : 'Revoke building access'} style={{ flex: 1 }} />
                <Button size="sm" onClick={addItem} disabled={saving || !newLabel.trim()}>Add task</Button>
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export default HrChecklists;
