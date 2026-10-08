import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from '../components/ui/dialog.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { showAlert } from '../lib/alert.js';
import { showPrompt } from '../lib/prompt.js';
import { showConfirm } from '../lib/confirm.js';
import { ActivityTimeline } from '../components/crm/ActivityTimeline.js';
import { LabelChips } from '../components/crm/LabelChips.js';
import { ComposeEmailButton } from '../components/crm/ComposeEmailButton.js';
import { StartCallButton } from '../components/crm/StartCallButton.js';
import { CustomFieldsPanel } from '../components/crm/CustomFieldsPanel.js';
import { STAGE_COLORS, type PipelineStage } from './CrmPipelineStages.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Tip } from '../components/ui/tooltip.js';
import { Checkbox } from '../components/ui/checkbox.js';

/* ── Types — mirror deals.routes.ts's mapDeal() shape ── */
interface Deal {
  id: string;
  name: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  lead_company?: string;
  // A per-tenant configurable key (crm_pipeline_stages.key), not a fixed
  // literal set — see migration 459 / CrmPipelineStages.tsx.
  stage: string;
  value: number;
  currency: string;
  probability: number;
  owner_id?: string;
  owner_name?: string;
  source?: string;
  expected_close?: string;
  closed_at?: string;
  lost_reason?: string;
  notes?: string;
  quotation_id?: string;
  territory_id?: string;
  territory_name?: string;
  stage_changed_at: string;
  days_in_stage: number;
  created_at: string;
}

interface Metrics {
  by_stage: Record<string, { count: number; value: number }>;
  open_count: number;
  open_value: number;
  win_rate_30d: number | null;
  closed_30d: number;
  leaderboard: { owner_id: string; owner_name: string; won: number; value: number }[];
}

function fmtMoney(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

/* ── Metrics strip ── */
function MetricTile({ icon, label, value, color, bg }: { icon: IconName; label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, minWidth: 160, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/* ── Deal card ── */
function DealCard({ deal, closed, onOpen, onDragStart, dragging }: {
  deal: Deal; closed: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void; dragging: boolean;
}) {
  const aging = !closed && deal.days_in_stage >= 14;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      style={{
        background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
        padding: '11px 12px', cursor: 'grab', opacity: dragging ? 0.4 : 1, display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{deal.name}</div>
      {(deal.customer_name || deal.lead_company) && (
        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{deal.customer_name || deal.lead_company}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(deal.value, deal.currency)}</span>
        {deal.owner_id ? <PersonAvatar userId={deal.owner_id} name={deal.owner_name || ''} size={22} /> : <span style={{ width: 22 }} />}
      </div>
      {aging && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--gold)', fontWeight: 700 }}>
          <Icon name="clock" size={11} /> {deal.days_in_stage}d in stage
        </div>
      )}
    </div>
  );
}

/* ── Create / edit modal ── */
function DealModal({ deal, onClose, onSaved }: { deal: Deal | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(deal?.name ?? '');
  const [customer, setCustomer] = useState<PickerItem | null>(deal?.customer_id ? { id: deal.customer_id, label: deal.customer_name || '' } : null);
  const [value, setValue] = useState(String(deal?.value ?? 0));
  const [currency, setCurrency] = useState(deal?.currency ?? 'TZS');
  const [ownerId, setOwnerId] = useState<string>(deal?.owner_id ?? '');
  const [staff, setStaff] = useState<{ value: string; label: string }[]>([]);
  const [expectedClose, setExpectedClose] = useState<string | undefined>(deal?.expected_close);
  const [saving, setSaving] = useState(false);
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [linkedQuotation, setLinkedQuotation] = useState<any | null>(undefined as any);
  const [quotationId, setQuotationId] = useState<string | null>(deal?.quotation_id ?? null);
  const [territoryId, setTerritoryId] = useState<string>(deal?.territory_id ?? '');
  const [territories, setTerritories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/hr/staff?search=').then((rows: any[]) => { if (alive) setStaff((rows || []).map(u => ({ value: u.id, label: u.name }))); }).catch(() => {});
    apiFetch('/v1/crm/territories').then((res: any) => { if (alive) setTerritories((Array.isArray(res) ? res : []).filter((t: any) => t.active !== false)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!deal?.id) return;
    let alive = true;
    apiFetch(`/v1/crm/tasks?subject_type=deal&subject_id=${deal.id}&done=all`)
      .then((res: any) => { if (alive) setTasks(Array.isArray(res) ? res : []); })
      .catch(() => {});
    if (deal.quotation_id) {
      apiFetch(`/v1/deals/${deal.id}/quotation`)
        .then((res: any) => { if (alive) setLinkedQuotation(res ?? null); })
        .catch(() => { if (alive) setLinkedQuotation(null); });
    } else {
      setLinkedQuotation(null);
    }
    return () => { alive = false; };
  }, [deal?.id, deal?.quotation_id]);

  async function searchCustomers(q: string): Promise<PickerItem[]> {
    const res: any = await apiFetch('/v1/customers');
    const list = (res?.data ?? res ?? []) as any[];
    return list
      .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 20)
      .map(c => ({ id: c.id, label: c.name }));
  }

  async function searchQuotations(q: string): Promise<PickerItem[]> {
    const cid = customer?.id ? `?customer_id=${customer.id}` : '';
    const res: any = await apiFetch(`/v1/quotations${cid}`).catch(() => []);
    const list = (res?.data ?? res ?? []) as any[];
    return list
      .filter((r: any) => !q || `${r.quote_number} ${r.title || ''}`.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 20)
      .map((r: any) => ({ id: r.id, label: `${r.quote_number}${r.title ? ' — ' + r.title : ''}` }));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        customer_id: customer?.id || null,
        value: Number(value) || 0,
        currency,
        owner_id: ownerId || null,
        expected_close: expectedClose || null,
        quotation_id: quotationId || null,
        territory_id: territoryId || null,
      };
      if (deal) {
        await apiFetch(`/v1/deals/${deal.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/v1/deals', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save deal');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deal) return;
    if (!(await showConfirm(`Delete "${deal.name}"? This cannot be undone.`, { confirmLabel: 'Delete' }))) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/deals/${deal.id}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete deal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{deal ? 'Edit deal' : 'New deal'}</DialogTitle>
        </DialogHeader>

        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {deal && <LabelChips subjectType="deal" subjectId={deal.id} />}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Deal name</span>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Msomi Logistics — annual clearing contract" autoFocus />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Customer (optional)</span>
            <EntityPicker value={customer} onChange={setCustomer} search={searchCustomers} placeholder="Search customers…" />
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Value</span>
              <input className="input-field" type="number" min={0} value={value} onChange={e => setValue(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Currency</span>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="input-field" style={{ height: 36, padding: '0 8px' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['TZS', 'USD', 'KES', 'UGX'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Owner</span>
            <Combobox
              options={staff}
              value={ownerId}
              onChange={setOwnerId}
              placeholder={staff.length ? 'Assign to…' : 'Loading people…'}
              searchPlaceholder="Search people…"
            />
          </label>

          {territories.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Territory</span>
              <Select value={territoryId || '__none__'} onValueChange={v => setTerritoryId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="input-field"><SelectValue placeholder="No territory" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No territory —</SelectItem>
                  {territories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Expected close</span>
            <DatePicker date={parseDateOnly(expectedClose)} onChange={d => setExpectedClose(d ? toDateOnlyString(d) : undefined)} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Linked quotation (optional)</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <EntityPicker
                  value={quotationId ? { id: quotationId, label: linkedQuotation?.quote_number ? `${linkedQuotation.quote_number}${linkedQuotation.title ? ' — ' + linkedQuotation.title : ''}` : '…' } : null}
                  onChange={item => { setQuotationId(item?.id ?? null); if (!item) setLinkedQuotation(null); }}
                  search={searchQuotations}
                  placeholder="Search quotations…"
                />
              </div>
              {quotationId && (
                <button type="button" onClick={() => { setQuotationId(null); setLinkedQuotation(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                  title="Unlink quotation" data-ui-native-button="">×</button>
              )}
            </div>
            {linkedQuotation && quotationId && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                {linkedQuotation.lines?.length ?? 0} line{linkedQuotation.lines?.length !== 1 ? 's' : ''} · Total: {Number(linkedQuotation.grand_total || linkedQuotation.total || 0).toLocaleString()} {linkedQuotation.currency || ''}
              </div>
            )}
          </label>

          {deal && <CustomFieldsPanel entityType="deal" subjectId={deal.id} heading="Custom Fields" />}

          {deal && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                  Tasks <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>({tasks.filter(t => !t.done).length} open)</span>
                </div>
              </div>
              {tasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {tasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                      <Checkbox checked={t.done} className="mt-0.5"
                        onCheckedChange={async () => {
                          const updated = { ...t, done: !t.done };
                          setTasks(prev => prev.map(x => x.id === t.id ? updated : x));
                          await apiFetch(`/v1/crm/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }).catch(() => {});
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: t.done ? 'var(--ink3)' : 'var(--ink)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                        {t.due_at && (
                          <span style={{ fontSize: 11, color: new Date(t.due_at) < new Date() && !t.done ? 'var(--red)' : 'var(--ink3)', marginLeft: 6 }}>
                            {new Date(t.due_at) < new Date() && !t.done ? '⚠ ' : ''}Due {new Date(t.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: '0 2px', lineHeight: 1 }}
                        onClick={async () => {
                          setTasks(prev => prev.filter(x => x.id !== t.id));
                          await apiFetch(`/v1/crm/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
                        }} data-ui-native-button="">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input-field" placeholder="Add a task…" value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && newTaskTitle.trim()) {
                      setAddingTask(true);
                      try {
                        const t = await apiFetch('/v1/crm/tasks', { method: 'POST', body: JSON.stringify({ subject_type: 'deal', subject_id: deal.id, title: newTaskTitle.trim(), due_at: newTaskDue || null }) });
                        setTasks(prev => [...prev, t]);
                        setNewTaskTitle(''); setNewTaskDue('');
                      } catch (err: any) { showAlert(err.message || 'Failed to add task'); }
                      finally { setAddingTask(false); }
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <input type="date" className="input-field" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ width: 130 }} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={!newTaskTitle.trim() || addingTask}
                  onClick={async () => {
                    if (!newTaskTitle.trim()) return;
                    setAddingTask(true);
                    try {
                      const t = await apiFetch('/v1/crm/tasks', { method: 'POST', body: JSON.stringify({ subject_type: 'deal', subject_id: deal.id, title: newTaskTitle.trim(), due_at: newTaskDue || null }) });
                      setTasks(prev => [...prev, t]);
                      setNewTaskTitle(''); setNewTaskDue('');
                    } catch (err: any) { showAlert(err.message || 'Failed to add task'); }
                    finally { setAddingTask(false); }
                  }} data-ui-native-button="">
                  {addingTask ? '…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {deal && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Activity</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ComposeEmailButton subjectType="deal" subjectId={deal.id} onSent={() => setActivityRefresh(n => n + 1)}>
                    <button type="button" className="btn btn-secondary btn-xs" data-ui-native-button="">
                      <Icon name="mail" size={11} /> Email
                    </button>
                  </ComposeEmailButton>
                  <StartCallButton subjectType="deal" subjectId={deal.id} onLogged={() => setActivityRefresh(n => n + 1)}>
                    <button type="button" className="btn btn-secondary btn-xs" data-ui-native-button="">
                      <Icon name="phone" size={11} /> Call
                    </button>
                  </StartCallButton>
                </div>
              </div>
              <ActivityTimeline key={activityRefresh} subjectType="deal" subjectId={deal.id} />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {deal && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', marginRight: 'auto' }} disabled={saving} onClick={remove} data-ui-native-button="">
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} data-ui-native-button="">Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving || !name.trim()} onClick={save} data-ui-native-button="">
            {saving ? 'Saving…' : deal ? 'Save changes' : 'Create deal'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Stage pill for list view ── */
function StagePill({ stageKey, stages }: { stageKey: string; stages: PipelineStage[] }) {
  const s = stages.find(x => x.key === stageKey);
  if (!s) return <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{stageKey}</span>;
  const tint = STAGE_COLORS[s.color] ?? STAGE_COLORS.blue;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--badge-radius)', fontSize: 11, fontWeight: 700, background: tint.bg, color: tint.fg, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: tint.fg, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

type SortKey = 'name' | 'stage' | 'value' | 'probability' | 'expected_close' | 'days_in_stage' | 'created_at';
type SortDir = 'asc' | 'desc';

/* ── Deal list/table view ── */
function DealTable({ deals, stages, onOpen, onMoveStage }: {
  deals: Deal[];
  stages: PipelineStage[];
  onOpen: (d: Deal) => void;
  onMoveStage: (dealId: string, stage: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    const copy = [...deals];
    copy.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'name':          av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'stage':         av = a.stage; bv = b.stage; break;
        case 'value':         av = a.value; bv = b.value; break;
        case 'probability':   av = a.probability; bv = b.probability; break;
        case 'expected_close': av = a.expected_close ?? ''; bv = b.expected_close ?? ''; break;
        case 'days_in_stage': av = a.days_in_stage; bv = b.days_in_stage; break;
        case 'created_at':    av = a.created_at; bv = b.created_at; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [deals, sortKey, sortDir]);

  const allChecked = sorted.length > 0 && sorted.every(d => selected.has(d.id));
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(sorted.map(d => d.id)));
  }

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th onClick={() => toggleSort(col)} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: active ? 'var(--teal)' : 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{selected.size} selected</span>
          <Select value="" onValueChange={stage => { selected.forEach(id => onMoveStage(id, stage)); setSelected(new Set()); }}>
            <SelectTrigger style={{ width: 180, height: 'var(--ctl-h-sm)' }}>
              <SelectValue placeholder="Move to stage…" />
            </SelectTrigger>
            <SelectContent>
              {stages.map(s => <SelectItem key={s.key} value={s.key}>→ {s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => setSelected(new Set())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink3)', fontFamily: 'var(--font)' }} data-ui-native-button="">
            Clear
          </button>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '9px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: 44 }}>
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all deals" />
              </th>
              <SortTh label="Deal" col="name" />
              <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Company</th>
              <SortTh label="Stage" col="stage" />
              <SortTh label="Value" col="value" />
              <SortTh label="Prob." col="probability" />
              <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 600, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Owner</th>
              <SortTh label="Close" col="expected_close" />
              <SortTh label="In stage" col="days_in_stage" />
              <SortTh label="Created" col="created_at" />
              <th style={{ padding: '9px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No deals match the current filters.</td></tr>
            )}
            {sorted.map(d => {
              const aging = d.days_in_stage >= 14 && !stages.find(s => s.key === d.stage)?.is_won && !stages.find(s => s.key === d.stage)?.is_lost;
              return (
                <tr
                  key={d.id}
                  onClick={() => onOpen(d)}
                  style={{ cursor: 'pointer', background: selected.has(d.id) ? 'var(--teal-l)' : undefined, transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!selected.has(d.id)) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.has(d.id) ? 'var(--teal-l)' : ''; }}
                >
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(d.id)} aria-label={`Select ${d.name}`}
                      onCheckedChange={() => setSelected(p => { const n = new Set(p); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} />
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{d.name}</span>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink3)' }}>
                    {d.customer_name || d.lead_company || '—'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <StagePill stageKey={d.stage} stages={stages} />
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtMoney(d.value, d.currency)}</span>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: d.probability >= 70 ? 'var(--green)' : d.probability >= 40 ? 'var(--gold)' : 'var(--ink3)' }}>
                    {d.probability}%
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    {d.owner_id
                      ? <PersonAvatar userId={d.owner_id} name={d.owner_name || ''} size={24} />
                      : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                    {d.expected_close ? new Date(d.expected_close).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                    <Tip label={`${d.days_in_stage} days in this stage`}>
                      <span className="mono" style={{ fontSize: 12.5, color: aging ? 'var(--gold)' : 'var(--ink3)', fontWeight: aging ? 700 : 400 }}>
                        {aging && <Icon name="clock" size={11} style={{ marginRight: 3 }} />}
                        {d.days_in_stage}d
                      </span>
                    </Tip>
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                    {new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <Tip label="Open deal">
                      <button type="button" onClick={() => onOpen(d)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 'var(--r-sm)', color: 'var(--ink3)', lineHeight: 1 }} data-ui-native-button="">
                        <Icon name="externalLink" size={13} />
                      </button>
                    </Tip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Page ── */
export function Pipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalDeal, setModalDeal] = useState<Deal | null | undefined>(undefined); // undefined = closed
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const boardView = (searchParams.get('view') ?? 'kanban') as 'kanban' | 'list';
  function setBoardView(v: 'kanban' | 'list') {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('view', v); return n; }, { replace: true });
  }
  // The tenant's real, configurable stages (CrmPipelineStages.tsx manages
  // these) — replaces the fixed 5-column board every prior version hardcoded.
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [savedViews,  setSavedViews]  = useState<{ id: string; name: string; count: number }[]>([]);
  const [activeView,  setActiveView]  = useState<string | null>(null);
  const [viewMatchIds, setViewMatchIds] = useState<Set<string> | null>(null);
  const [quotaAttainment, setQuotaAttainment] = useState<any[]>([]);
  const [quotaPeriod, setQuotaPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [showQuotaEdit, setShowQuotaEdit] = useState(false);
  const [filterTerritory, setFilterTerritory] = useState('');
  const [boardTerritories, setBoardTerritories] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m, s] = await Promise.all([apiFetch('/v1/deals'), apiFetch('/v1/deals/metrics'), apiFetch('/v1/crm/pipeline-stages')]);
      setDeals(Array.isArray(d) ? d : []);
      setMetrics(m);
      setStages(Array.isArray(s) ? s.filter((x: PipelineStage) => x.active) : []);
    } catch (err: any) {
      showAlert(err.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch('/v1/crm/smart-views?entity_type=deal')
      .then((res: any) => setSavedViews(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`/v1/crm/quotas/attainment?period=${quotaPeriod}`)
      .then((res: any) => setQuotaAttainment(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [quotaPeriod]);

  useEffect(() => {
    if (!activeView) { setViewMatchIds(null); return; }
    apiFetch(`/v1/crm/smart-views/${activeView}/results`)
      .then((res: any) => setViewMatchIds(new Set((Array.isArray(res) ? res : []).map((r: any) => r.id ?? r))))
      .catch(() => setViewMatchIds(null));
  }, [activeView]);

  useEffect(() => {
    const id = searchParams.get('deal');
    if (!id || loading || modalDeal?.id === id) return;
    const match = deals.find(deal => deal.id === id);
    if (match) setModalDeal(match);
  }, [deals, loading, modalDeal?.id, searchParams]);

  useEffect(() => {
    apiFetch('/v1/crm/territories')
      .then((res: any) => setBoardTerritories((Array.isArray(res) ? res : []).filter((t: any) => t.active !== false)))
      .catch(() => {});
  }, []);

  const stageByKey = useMemo(() => new Map(stages.map(s => [s.key, s])), [stages]);

  const visibleDeals = useMemo(() => {
    let list = viewMatchIds ? deals.filter(d => viewMatchIds.has(d.id)) : deals;
    if (filterTerritory) list = list.filter(d => d.territory_id === filterTerritory);
    return list;
  }, [deals, viewMatchIds, filterTerritory]);

  const byStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of stages) map[s.key] = [];
    for (const d of visibleDeals) (map[d.stage] ??= []).push(d);
    return map;
  }, [visibleDeals, stages]);

  async function moveStage(dealId: string, stage: string) {
    try {
      let lost_reason: string | null = null;
      if (stageByKey.get(stage)?.is_lost) {
        lost_reason = await showPrompt('Why was this deal lost?', { title: 'Mark as lost', confirmLabel: 'Mark lost', placeholder: 'e.g. Went with a competitor on price' });
        if (lost_reason === null) return; // cancelled
      }
      await apiFetch(`/v1/deals/${dealId}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, lost_reason }) });
      await load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to move deal');
    }
  }

  return (
    <div style={{ padding: '20px 0 40px' }}>
      <PageHeader
        crumbs={['CRM', 'Pipeline']}
        titlePlain="Sales"
        titleEm="pipeline"
        subtitle="Every deal, its stage, and who owns it — dragged or listed."
        actions={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)' }}>
              <Tip label="Kanban board">
                <button type="button" onClick={() => setBoardView('kanban')}
                  style={{ padding: '6px 10px', background: boardView === 'kanban' ? 'hsl(var(--primary))' : 'none', color: boardView === 'kanban' ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', border: 'none', cursor: 'pointer', lineHeight: 1, transition: 'background 0.12s' }} data-ui-native-button="">
                  <Icon name="columns" size={14} />
                </button>
              </Tip>
              <Tip label="List view">
                <button type="button" onClick={() => setBoardView('list')}
                  style={{ padding: '6px 10px', background: boardView === 'list' ? 'hsl(var(--primary))' : 'none', color: boardView === 'list' ? 'hsl(var(--primary-foreground))' : 'var(--ink3)', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', lineHeight: 1, transition: 'background 0.12s' }} data-ui-native-button="">
                  <Icon name="list" size={14} />
                </button>
              </Tip>
            </div>
            <Button size="sm" onClick={() => setModalDeal(null)}><Icon name="plus" size={14} /> New deal</Button>
          </div>
        }
      />

      {metrics && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '18px 0 24px' }}>
          <MetricTile icon="briefcase" label="Open pipeline value" value={fmtMoney(metrics.open_value, 'TZS')} color="var(--teal)" bg="var(--teal-l)" />
          <MetricTile icon="trendingUp" label="Open deals" value={String(metrics.open_count)} color="var(--blue)" bg="var(--blue-l)" />
          <MetricTile icon="target" label="Win rate (30d)" value={metrics.win_rate_30d === null ? '—' : `${metrics.win_rate_30d}%`} color="var(--green)" bg="var(--green-l)" />
          <MetricTile icon="checkCircle" label="Closed (30d)" value={String(metrics.closed_30d)} color="var(--gold)" bg="var(--gold-l)" />
        </div>
      )}

      {metrics && metrics.leaderboard.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Top performers — deals won</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {metrics.leaderboard.slice(0, 5).map((rep, i) => (
              <div key={rep.owner_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink3)', width: 14 }}>{i + 1}</span>
                <PersonAvatar userId={rep.owner_id} name={rep.owner_name} size={26} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{rep.owner_name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{rep.won} won · {fmtMoney(rep.value, 'TZS')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quotaAttainment.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Quota attainment — {quotaPeriod}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="month" value={quotaPeriod} onChange={e => setQuotaPeriod(e.target.value)}
                style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '3px 8px', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quotaAttainment.map(q => {
              const pct = Math.min(q.attainment_pct ?? 0, 100);
              const over = (q.attainment_pct ?? 0) > 100;
              return (
                <div key={q.user_id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <PersonAvatar userId={q.user_id} name={q.user_name} size={22} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{q.user_name}</span>
                    <span className="mono" style={{ fontSize: 12, color: over ? 'var(--green)' : 'var(--ink3)' }}>
                      {fmtMoney(q.won_value, 'TZS')} / {fmtMoney(q.target_value, 'TZS')}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: over ? 'var(--green)' : q.attainment_pct >= 75 ? 'var(--gold)' : 'var(--red)', minWidth: 36, textAlign: 'right' }}>
                      {q.attainment_pct ?? '—'}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--green)' : q.attainment_pct >= 75 ? 'var(--gold)' : 'hsl(var(--primary))', borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {savedViews.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 600 }}>Saved view:</span>
          {[null, ...savedViews].map(v => (
            <button key={v?.id ?? '__all__'} type="button"
              onClick={() => setActiveView(v?.id ?? null)}
              style={{ padding: '5px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: activeView === (v?.id ?? null) ? 'hsl(var(--primary))' : 'var(--white)', color: activeView === (v?.id ?? null) ? 'hsl(var(--primary-foreground))' : 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1.25 }} data-ui-native-button="">
              {v ? `${v.name} (${v.count})` : 'All deals'}
            </button>
          ))}
        </div>
      )}

      {boardTerritories.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <SingleSelectFilter
            label="Territory"
            value={filterTerritory || null}
            onChange={v => setFilterTerritory(v ?? '')}
            options={boardTerritories.map(t => ({ value: t.id, label: t.name }))}
          />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)' }}>Loading pipeline…</div>
      ) : stages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink3)' }}>No pipeline stages configured yet.</div>
      ) : boardView === 'list' ? (
        <DealTable
          deals={visibleDeals}
          stages={stages}
          onOpen={d => setModalDeal(d)}
          onMoveStage={(dealId, stage) => moveStage(dealId, stage)}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, minmax(260px, 1fr))`, gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
          {stages.map(col => {
            const list = byStage[col.key] || [];
            const total = list.reduce((s, d) => s + d.value, 0);
            const tint = STAGE_COLORS[col.color] ?? STAGE_COLORS.blue;
            const closed = col.is_won || col.is_lost;
            return (
              <div
                key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (draggingId) moveStage(draggingId, col.key); setDraggingId(null); }}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', minHeight: 420, overflow: 'hidden' }}
              >
                <div style={{ padding: '10px 12px', borderBottom: `2px solid ${tint.fg}`, background: tint.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: tint.fg }}>{col.label} <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>({list.length})</span></div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{fmtMoney(total, 'TZS')}</div>
                </div>
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
                  {list.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>No deals here</div>}
                  {list.map(d => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      closed={closed}
                      dragging={draggingId === d.id}
                      onOpen={() => setModalDeal(d)}
                      onDragStart={e => { e.dataTransfer.setData('text/deal-id', d.id); setDraggingId(d.id); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalDeal !== undefined && (
        <DealModal deal={modalDeal} onClose={() => setModalDeal(undefined)} onSaved={load} />
      )}
    </div>
  );
}
