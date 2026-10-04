import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { SectionCard } from '../components/SectionCard.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { DataTable, type TableColumn } from '../components/ui/DataTable.js';

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
        titlePlain="Onboarding"
        titleEm="checklists"
        subtitle="A checklist a person actually gets, generated automatically the moment they join or leave."
      />
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)}>
        <TabsList>
          <TabsTrigger value="active">Active checklists</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'active' ? <ActiveChecklists /> : <Templates />}
    </div>
  );
}

const TYPE_BADGE: Record<ChecklistType, 'success' | 'warning'> = { onboarding: 'success', offboarding: 'warning' };

function ActiveChecklists() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const qs = typeFilter ? `?type=${typeFilter}` : '';
    apiFetch(`/v1/hr/checklists${qs}`).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => {
      setRows([]);
      setLoadError('Could not load HR checklists.');
    }).finally(() => setLoading(false));
  }, [typeFilter]);
  useEffect(() => { load(); }, [load]);

  const columns: TableColumn<any>[] = [
    { key: 'person', header: 'Person', sortable: true, render: row => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PersonAvatar userId={row.employee_id} name={row.employee_name} size={26} />{row.employee_name}</span> },
    { key: 'type', header: 'Type', sortable: true, render: row => <Badge variant={TYPE_BADGE[row.type as ChecklistType]}>{row.type}</Badge> },
    { key: 'progress', header: 'Progress', render: row => `${row.done_items} / ${row.total_items}` },
    { key: 'status', header: 'Status', sortable: true, render: row => <Badge variant={row.status === 'completed' ? 'success' : 'gray'}>{row.status.replace('_', ' ')}</Badge> },
    { key: 'started', header: 'Started', sortable: true, render: row => new Date(row.created_at).toLocaleDateString() },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SingleSelectFilter label="Type" value={typeFilter} onChange={setTypeFilter}
        options={[{ value: 'onboarding', label: 'Onboarding' }, { value: 'offboarding', label: 'Offboarding' }]} />

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={loadError ?? undefined}
        onRetry={load}
        empty={!loading && !loadError && !typeFilter && rows.length === 0}
        emptyIcon="clipboardList"
        emptyTitle="No checklists yet"
        emptyMessage="A checklist is created automatically when someone joins or is deactivated and a template exists."
        filteredEmpty={!loading && !loadError && !!typeFilter && rows.length === 0}
        filteredEmptyMessage="No checklists match this type."
        onRowClick={row => setOpenId(row.id)}
        defaultSortKey="started"
        defaultSortDir="desc"
      />

      {openId && <ChecklistDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

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
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md" className="overflow-y-auto">
        {!item ? (
          <SectionLoading />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{item.employee_name}</DialogTitle>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{item.type === 'onboarding' ? 'Onboarding' : 'Offboarding'} checklist</div>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              {item.items.map((i: any) => (
                <label key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: busy ? 'default' : 'pointer', padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r)'}}>
                  <Checkbox checked={i.done} disabled={busy} onCheckedChange={c => toggle(i.id, c === true)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', textDecoration: i.done ? 'line-through' : 'none' }}>{i.label}</div>
                    {i.done && <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Done by {i.done_by_name ?? '—'} · {new Date(i.done_at).toLocaleString()}</div>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
            <SectionLoading />
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No tasks yet — add the first one below.</div>
                ) : items.map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 'var(--r)'}}>
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
