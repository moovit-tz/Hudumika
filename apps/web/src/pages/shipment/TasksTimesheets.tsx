import React, { useState, useEffect, useRef } from 'react';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { ExaminationsQueue } from '../../components/ExaminationsQueue.js';
import { DangerousGoodsPanel } from '../../components/DangerousGoodsPanel.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { Icon } from '../../components/Icon.js';
import { Spinner, PageLoading } from '../../components/ui/spinner.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { RelatedRecordsPanel } from '../../components/RelatedRecordsPanel.js';
import { Tip } from '../../components/ui/tooltip.js';
import type { IconName } from '../../components/Icon.js';
import { apiFetch, apiDownload, apiViewBlob, apiFetchBlob } from '../../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../../lib/watermark.js';
import { useCompany, getCompany } from '../../data/companyStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { MGMT_ROLES } from '../../lib/permissions.js';
import { useClockIn } from '../../contexts/ClockInContext.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import {
  getJob, updateJob, subscribe,
  STAGES, FLAG_CFG, CH_CFG, stageIdx, STAGE_API_MAP, API_STAGE_MAP, apiToJob,
  jobUiSteps, jobCurrentIdx, jobStageLabel, jobBackendStage,
  type ClearanceJob, type Stage, type Channel, type Flag,
  type ThreadMsg, type TimelineEvent, type ShipDoc, type LedgerEntry, type DocType,
  type InternalTask, type TimeEntry, type ActivityEvent, type TaskStatus, type Listener,
  type JobChargeLine,
} from '../clearanceData.js';
import { ChBadge } from '../../components/ClearanceChips.js';
import { VesselLiveStatus } from '../../components/VesselLiveStatus.js';
import { EMPLOYEES, empInitials, empAvatarColor } from '../../data/staffData.js';
import type { Employee } from '../../data/staffData.js';
import { CUSTOMER_MILESTONES, MILESTONE_LABELS, STAGE_TO_MILESTONE } from '@hudumika/types';
import type { CustomerMilestone, ClearanceStage } from '@hudumika/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Badge } from '../../components/ui/badge.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../../components/ui/hover-card.js';
import { SwitchRow } from '../../components/ui/list-item-row.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.js';
import { clockGate, entryAmount, fdate, ftime, fdatetime, fmtTZS, fmtServiceRate, avatarBg, initials, isUUID, friendlyAssignee, Av, Card } from './utils.js';
import { TASK_STATUS_CFG, PRIORITY_CFG } from './OverviewUpdates.js';
export function TasksTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTitle,     setNewTitle]     = useState('');
  const [newTitleCustom, setNewTitleCustom] = useState(false);
  const [newAssignee,  setNewAssignee]  = useState(job.assignees[0] || '');
  const [newDue,       setNewDue]       = useState('');
  const [newPriority,  setNewPriority]  = useState<'medium' | 'low' | 'high' | 'urgent'>('medium');
  const [newProductId, setNewProductId] = useState('');
  const [addSaving,    setAddSaving]    = useState(false);
  const [taskTypes,    setTaskTypes]    = useState<{ id: string; name: string }[]>([]);
  const [staff,        setStaff]        = useState<{ id: string; name: string }[]>([]);
  const [services,     setServices]     = useState<{ id: string; name: string; sale_price: number; currency: string; unit: string }[]>([]);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');
  // A task's status is changed by whoever owns it — the assignee — or by a team
  // lead: a senior/manager who oversees them.
  const TEAM_LEAD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'];
  const isLead = !!(user && TEAM_LEAD_ROLES.includes(user.role));
  const canEditStatus = (task: InternalTask) => isLead || (!!task.assignedToId && task.assignedToId === user?.id);
  const TO_BACKEND: Record<TaskStatus, string> = { not_started: 'open', in_progress: 'in_progress', testing: 'testing', awaiting_feedback: 'blocked', complete: 'complete' };
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  async function setTaskStatus(task: InternalTask, next: TaskStatus) {
    if (!canEditStatus(task) || savingStatus || next === task.status) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSavingStatus(task.id);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: TO_BACKEND[next] }) });
        onRefresh();
      } else {
        updateJob(job.id, j => ({ ...j, tasks: j.tasks.map(t => t.id === task.id ? { ...t, status: next } : t) }));
      }
    } catch (err: any) { showAlert(err.message || 'Could not update task'); }
    finally { setSavingStatus(null); }
  }

  // Formal sign-off: close (or reopen) a task. Same permission as status —
  // assignee or team lead — enforced again on the server.
  async function closeTask(task: InternalTask, action: 'close' | 'reopen') {
    if (!canEditStatus(task) || savingStatus) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setSavingStatus(task.id);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks/${task.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
        onRefresh();
      }
    } catch (err: any) { showAlert(err.message || `Could not ${action} task`); }
    finally { setSavingStatus(null); }
  }
  const nameFor = (id?: string) => (id ? (staff.find(s => s.id === id)?.name || friendlyAssignee(id)) : '');

  useEffect(() => {
    apiFetch('/v1/hr/tasks').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setTaskTypes(list.map(t => ({ id: t.id, name: t.name })));
    }).catch(() => {});
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE').map(u => ({ id: u.id, name: u.name })));
    }).catch(() => {});
    // Products & Services catalog (ClearOS → Tools → Products & Services) —
    // lets a task be tagged with which billable clearing/freight service it's
    // for, so the rate carries through to Timesheets and can be recalled when
    // writing the invoice in FinOps.
    apiFetch('/v1/products?status=active').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setServices(list.map(p => ({ id: p.id, name: p.name, sale_price: Number(p.sale_price) || 0, currency: p.currency, unit: p.unit })));
    }).catch(() => {});
  }, []);

  async function handleAddTaskType() {
    if (!newTitle.trim()) return;
    try {
      const created: any = await apiFetch('/v1/hr/tasks', { method: 'POST', body: JSON.stringify({ name: newTitle.trim() }) });
      setTaskTypes(prev => [...prev, { id: created.id, name: created.name }]);
    } catch { /* still usable as a free-text title even if the catalog write fails */ }
  }

  const statuses: TaskStatus[] = ['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'];
  const counts = { all: job.tasks.length } as Record<TaskStatus | 'all', number>;
  for (const s of statuses) counts[s] = job.tasks.filter(t => t.status === s).length;

  const visible = job.tasks.filter(t =>
    (filterStatus === 'all' || t.status === filterStatus) &&
    (!search || t.title.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    setAddSaving(true);
    try {
      // A custom-typed title that isn't already in the catalog gets persisted
      // as a new task type first, so it shows up in the dropdown from now on.
      if (newTitleCustom && !taskTypes.some(t => t.name.toLowerCase() === newTitle.trim().toLowerCase())) {
        await handleAddTaskType();
      }
      const assigneeName = staff.find(s => s.id === newAssignee)?.name;
      const service = services.find(s => s.id === newProductId);
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title: newTitle, priority: newPriority, assigned_to: newAssignee || undefined, due_date: newDue || undefined, product_id: newProductId || undefined }),
        });
        if (newProductId && service) {
          await apiFetch(`/v1/shipments/${shipmentId}/ledger`, {
            method: 'POST',
            body: JSON.stringify({
              description: `[CLEARANCE] Task: ${newTitle} (${service.name})`,
              amount: service.sale_price,
              type: 'charge',
              category: 'CLEARANCE'
            }),
          });
        }
        onRefresh();
      } else {
        const task: InternalTask = {
          id: 'task-' + Date.now(), title: newTitle, status: 'not_started', priority: newPriority,
          assignees: newAssignee ? [assigneeName || newAssignee] : [], startDate: new Date(),
          dueDate: newDue ? new Date(newDue) : new Date(Date.now() + 7 * 86400000), tags: [],
          productId: service?.id, serviceName: service?.name, serviceRate: service?.sale_price,
          serviceCurrency: service?.currency, serviceUnit: service?.unit,
        };
        const ledgerEntries = [...job.ledger];
        if (service) {
          ledgerEntries.push({
            id: 'led-' + Date.now(),
            description: `[CLEARANCE] Task: ${newTitle} (${service.name})`,
            amount: service.sale_price,
            currency: service.currency || 'TZS',
            type: 'charge',
            date: new Date(),
            status: 'pending'
          });
        }
        updateJob(job.id, j => ({ ...j, tasks: [...j.tasks, task], ledger: ledgerEntries }));
      }
      setNewTitle(''); setNewDue(''); setNewTitleCustom(false); setNewProductId(''); setShowAdd(false);
    } catch (err: any) { showAlert(err.message || 'Failed to create task'); } finally { setAddSaving(false); }
  }

  return (
    <div>
      {/* Status filter strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setFilterStatus('all')} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterStatus === 'all' ? 'var(--teal)' : 'var(--border)'}`, background: filterStatus === 'all' ? 'var(--teal-l)' : 'var(--white)', color: filterStatus === 'all' ? 'var(--teal)' : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">All <span style={{ fontWeight: 700 }}>{counts.all}</span></button>
        {statuses.map(s => { const cfg = TASK_STATUS_CFG[s]; const on = filterStatus === s; return (
          <button key={s} type="button" onClick={() => setFilterStatus(s)} style={{ padding: 'var(--ds-btn-py-sm) 12px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? cfg.color : 'var(--border)'}`, background: on ? cfg.bg : 'var(--white)', color: on ? cfg.color : 'var(--ink3)', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
            {cfg.label} <span style={{ fontWeight: 700 }}>{counts[s]}</span>
          </button>
        ); })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" className="input-field" style={{ flex: 1, fontSize: 13 }} />
        <button type="button" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
          <Icon name="plus" size={14} /> Add Task
        </button>
      </div>

      {/* Add-task form */}
      {showAdd && (
        <div style={{ marginBottom: 14 }}>
        <Card title="New Task">
        <form onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task Title</label>
              {newTitleCustom ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" placeholder="New task name…" required autoFocus style={{ flex: 1 }} />
                  <button type="button" onClick={() => { setNewTitleCustom(false); setNewTitle(''); }} title="Choose from list instead" className="btn btn-secondary btn-sm" data-ui-native-button="">
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ) : (
                <Select
                  value={newTitle}
                  onValueChange={v => { if (v === '__new__') { setNewTitleCustom(true); setNewTitle(''); } else { setNewTitle(v); } }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a task…" /></SelectTrigger>
                  <SelectContent>
                    {taskTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                    <SelectItem value="__new__">+ Add new task…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Assignee</label>
              <Combobox
                options={[{ value: '', label: 'Unassigned' }, ...staff.map(s => ({ value: s.id, label: s.name }))]}
                value={newAssignee} onChange={setNewAssignee} placeholder="Unassigned"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Due Date</label>
              <DatePicker date={parseDateOnly(newDue)} onChange={d => setNewDue(toDateOnlyString(d))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Priority</label>
              <Select value={newPriority} onValueChange={v => setNewPriority(v as 'medium')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low','medium','high','urgent'] as const).map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Billable Service (optional)</label>
            <Combobox
              options={[{ value: '', label: 'No service (unbilled)' }, ...services.map(s => ({ value: s.id, label: s.name, sublabel: `${fmtServiceRate(s.sale_price, s.currency)}/${s.unit}` }))]}
              value={newProductId} onChange={setNewProductId} placeholder="No service (unbilled)"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={addSaving} data-ui-native-button="">{addSaving ? 'Saving…' : 'Add Task'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm" data-ui-native-button="">Cancel</button>
          </div>
        </form>
        </Card>
        </div>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <Card padded={false}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['#','Task','Service','Status','Start','Due','Assignees','Priority','Tags','Actions'].map(h => (
              <th key={h} style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No tasks match this filter.</td></tr>}
            {visible.map((task, i) => {
              const sCfg = TASK_STATUS_CFG[task.status];
              const pCfg = PRIORITY_CFG[task.priority];
              const overdue = task.dueDate && new Date() > task.dueDate && task.status !== 'complete';
              return (
                <tr key={task.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                    {task.description && <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                    {task.serviceName ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.serviceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>{fmtServiceRate(task.serviceRate || 0, task.serviceCurrency || 'USD')}/{task.serviceUnit}</div>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: sCfg.bg, color: sCfg.color, whiteSpace: 'nowrap' }}>{sCfg.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(task.startDate)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: overdue ? 'var(--red)' : 'var(--ink3)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>{fdate(task.dueDate)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {task.assignees.slice(0, 3).map(a => (
                        <Av key={a} name={a} size={24} />
                      ))}
                      {task.assignees.length > 3 && <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>+{task.assignees.length - 3}</div>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pCfg.color }}>{task.priority.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {task.tags.map(tag => <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)' }}>{tag}</span>)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {task.closedAt ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span title={`Closed ${fdate(task.closedAt)}${task.closedById ? ` by ${nameFor(task.closedById)}` : ''}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                          <Icon name="lock" size={12} /> Closed{task.closedById ? ` · ${nameFor(task.closedById)}` : ''}
                        </span>
                        {canEditStatus(task) && (
                          <button type="button" onClick={() => closeTask(task, 'reopen')} disabled={savingStatus === task.id} title="Reopen this task"
                            style={{ fontSize: 11, fontWeight: 600, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
                            Reopen
                          </button>
                        )}
                      </div>
                    ) : canEditStatus(task) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 150 }}>
                          <Select value={task.status} onValueChange={v => setTaskStatus(task, v as TaskStatus)} disabled={savingStatus === task.id}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'] as TaskStatus[]).map(s => (
                                <SelectItem key={s} value={s}>{TASK_STATUS_CFG[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {task.status !== 'complete' && (
                          <button type="button" onClick={() => setTaskStatus(task, 'complete')} disabled={savingStatus === task.id} title="Mark complete"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--green)', background: 'var(--white)', color: 'var(--green)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
                            <Icon name="check" size={12} />
                          </button>
                        )}
                        <button type="button" onClick={() => closeTask(task, 'close')} disabled={savingStatus === task.id} title="Close & sign off this task"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: 'var(--ds-btn-py-xs) 9px', borderRadius: 'var(--r)', border: '1px solid var(--teal)', background: 'var(--teal-l)', color: 'var(--teal-d)', cursor: savingStatus === task.id ? 'default' : 'pointer', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25 }} data-ui-native-button="">
                          <Icon name="lock" size={11} /> Close
                        </button>
                      </div>
                    ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      </div>
    </div>
  );
}

// ─── Timesheets Tab ───────────────────────────────────────────────────────────

export function TimesheetsTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const [showLog,   setShowLog]   = useState(false);
  const [logMember, setLogMember] = useState(job.assignees[0] || '');
  const [logTask,   setLogTask]   = useState(job.tasks[0]?.id || '');
  const [logHours,  setLogHours]  = useState('');
  const [logNote,   setLogNote]   = useState('');
  const [logDate,   setLogDate]   = useState(new Date().toISOString().slice(0, 10));
  const [logProductId, setLogProductId] = useState(job.tasks[0]?.productId || '');
  const [logSaving, setLogSaving] = useState(false);
  const [staff,     setStaff]     = useState<{ id: string; name: string }[]>([]);
  const [services,  setServices]  = useState<{ id: string; name: string; sale_price: number; currency: string; unit: string }[]>([]);
  const { user } = useAuth();
  const { isCheckedIn, triggerOpen: triggerOpenRaw } = useClockIn();
  const triggerOpen = () => triggerOpenRaw({ shipmentId: job.id, shipmentRef: job.sysRef || job.id });
  const isStaff = !!(user && user.role !== 'CUSTOMER');

  useEffect(() => {
    apiFetch('/v1/hr/staff').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setStaff(list.filter(u => u.status !== 'INACTIVE').map(u => ({ id: u.id, name: u.name })));
    }).catch(() => {});
    apiFetch('/v1/products?status=active').then((res: any) => {
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setServices(list.map(p => ({ id: p.id, name: p.name, sale_price: Number(p.sale_price) || 0, currency: p.currency, unit: p.unit })));
    }).catch(() => {});
  }, []);

  const billableByCurrency = job.timeEntries.reduce<Record<string, number>>((acc, e) => {
    const amt = entryAmount(e);
    if (amt != null && e.serviceCurrency) acc[e.serviceCurrency] = (acc[e.serviceCurrency] || 0) + amt;
    return acc;
  }, {});

  const totalHours = job.timeEntries.reduce((s, e) => s + e.hours, 0);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logHours) return;
    if (!clockGate(isStaff, isCheckedIn, triggerOpen)) return;
    const h = parseFloat(logHours);
    const memberName = staff.find(s => s.id === logMember)?.name || logMember;
    const service = services.find(s => s.id === logProductId);
    setLogSaving(true);
    try {
      if (isLive) {
        await apiFetch(`/v1/shipments/${shipmentId}/time-entries`, {
          method: 'POST',
          body: JSON.stringify({ member: memberName, task_ref: job.tasks.find(t => t.id === logTask)?.title || undefined, hours: h, note: logNote || undefined, log_date: logDate, product_id: logProductId || undefined }),
        });
        onRefresh();
      } else {
        const task = job.tasks.find(t => t.id === logTask);
        const entry: TimeEntry = {
          id: 'te-' + Date.now(), memberId: logMember, memberName: memberName,
          taskId: logTask, taskTitle: task?.title || 'General',
          duration: `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}:00`,
          hours: h, date: new Date(logDate), billable: true, note: logNote || undefined,
          productId: service?.id, serviceName: service?.name, serviceRate: service?.sale_price,
          serviceCurrency: service?.currency, serviceUnit: service?.unit,
        };
        updateJob(job.id, j => ({ ...j, timeEntries: [...j.timeEntries, entry] }));
      }
      setLogHours(''); setLogNote(''); setShowLog(false);
    } catch (err: any) { showAlert(err.message || 'Log failed'); } finally { setLogSaving(false); }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
          Total: <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{totalHours.toFixed(1)} hrs</span> across {job.timeEntries.length} entries
          {Object.entries(billableByCurrency).length > 0 && (
            <span> · Billable: <span style={{ fontWeight: 700, color: 'var(--teal)' }}>{Object.entries(billableByCurrency).map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ')}</span></span>
          )}
        </div>
        <button type="button" onClick={() => setShowLog(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--ds-btn-py) 16px', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
          <Icon name="clock" size={14} /> Log Time
        </button>
      </div>

      {/* Log time form */}
      {showLog && (
        <div style={{ marginBottom: 14 }}>
        <Card title="Log Time Entry">
        <form onSubmit={handleLog}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Member</label>
              <Combobox
                options={staff.map(s => ({ value: s.id, label: s.name }))}
                value={logMember} onChange={setLogMember} placeholder="Select staff…"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Task</label>
              <Select value={logTask || '__general__'} onValueChange={v => {
                const taskId = v === '__general__' ? '' : v;
                setLogTask(taskId);
                setLogProductId(job.tasks.find(t => t.id === taskId)?.productId || '');
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general__">General</SelectItem>
                  {job.tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Hours</label>
              <input type="number" step="0.25" min="0.25" value={logHours} onChange={e => setLogHours(e.target.value)} className="input-field" placeholder="1.5" required style={{ width: '100%', fontFamily: 'var(--font)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Date</label>
              <DatePicker date={parseDateOnly(logDate)} onChange={d => setLogDate(toDateOnlyString(d))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Billable Service (optional)</label>
            <Combobox
              options={[{ value: '', label: 'No service (unbilled)' }, ...services.map(s => ({ value: s.id, label: s.name, sublabel: `${fmtServiceRate(s.sale_price, s.currency)}/${s.unit}` }))]}
              value={logProductId} onChange={setLogProductId} placeholder="No service (unbilled)"
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 3 }}>Note (optional)</label>
            <input value={logNote} onChange={e => setLogNote(e.target.value)} className="input-field" placeholder="What was worked on…" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={logSaving} data-ui-native-button="">{logSaving ? 'Saving…' : 'Save Entry'}</button>
            <button type="button" onClick={() => setShowLog(false)} className="btn btn-secondary btn-sm" data-ui-native-button="">Cancel</button>
          </div>
        </form>
        </Card>
        </div>
      )}

      {/* Table */}
      <div className="rtbl-wrap">
      <Card padded={false}>
        <table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Member','Task','Service','Date','Duration','Hours','Amount','Note'].map(h => (
              <th key={h} style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {job.timeEntries.length === 0 && <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No time logged yet. Click "Log Time" to start tracking.</td></tr>}
            {[...job.timeEntries].reverse().map((entry, i) => {
              const amt = entryAmount(entry);
              return (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--white)' : 'var(--bg)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Av name={entry.memberName} userId={entry.memberId} size={26} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{entry.memberName}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--ink2)', maxWidth: 200 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.taskTitle}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', maxWidth: 160 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.serviceName || '—'}</span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(entry.date)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)' }}>{entry.duration}</td>
                <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{entry.hours.toFixed(2)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: 'var(--teal)', whiteSpace: 'nowrap' }}>{amt != null ? fmtServiceRate(amt, entry.serviceCurrency || 'USD') : '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink3)', maxWidth: 180 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{entry.note || '—'}</span>
                </td>
              </tr>
              );
            })}
          </tbody>
          {job.timeEntries.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>TOTAL</td>
                <td style={{ padding: '10px 16px', fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>{totalHours.toFixed(2)}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: 'var(--teal)', whiteSpace: 'nowrap' }}>
                  {Object.entries(billableByCurrency).map(([cur, amt]) => fmtServiceRate(amt, cur)).join(' + ') || '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
      </div>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────
