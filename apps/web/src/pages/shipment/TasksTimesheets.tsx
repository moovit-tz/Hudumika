import './TasksTimesheets.css';
import { Card as UICard } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
﻿import React, { useState, useEffect, useRef } from 'react';
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
const FILTER_LABELS: Record<TaskStatus | 'all', string> = { all: 'All', not_started: 'Not Started', in_progress: 'In Progress', testing: 'Testing', awaiting_feedback: 'Feedback', complete: 'Complete' };

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
    <UICard className="shipment-tasks-card">
      <div className="shipment-task-controls">
        <div className="shipment-task-filters" role="group" aria-label="Filter tasks by status">
          {(['all', ...statuses] as const).map(status => {
            const active = filterStatus === status;
            return (
              <button
                data-ui-native-button=""
                key={status}
                type="button"
                className={`stf-pill${active ? ' stf-active' : ''}`}
                aria-pressed={active}
                onClick={() => setFilterStatus(status)}
              >
                <span className="stf-label">{FILTER_LABELS[status]}</span>
                <span className="stf-count">{counts[status]}</span>
              </button>
            );
          })}
        </div>
        <SearchToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search tasks…"
          actions={
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Icon name="plus" size={14} /> Add Task
            </Button>
          }
        />
      </div>

      {/* Add-task form */}
      {showAdd && (
        <div style={{ padding: '0 16px 16px' }}>
          <Card title="New Task">
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Task Title</label>
                  {newTitleCustom ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input data-ui-field="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" placeholder="New task name…" required autoFocus style={{ flex: 1 }} />
                      <Button variant="outline" size="sm" type="button" onClick={() => { setNewTitleCustom(false); setNewTitle(''); }} title="Choose from list instead">
                        <Icon name="x" size={13} />
                      </Button>
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
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Assignee</label>
                  <Combobox
                    options={[{ value: '', label: 'Unassigned' }, ...staff.map(s => ({ value: s.id, label: s.name }))]}
                    value={newAssignee} onChange={setNewAssignee} placeholder="Unassigned"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Due Date</label>
                  <DatePicker date={parseDateOnly(newDue)} onChange={d => setNewDue(toDateOnlyString(d))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Priority</label>
                  <Select value={newPriority} onValueChange={v => setNewPriority(v as 'medium')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['low','medium','high','urgent'] as const).map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>Billable Service (optional)</label>
                <Combobox
                  options={[{ value: '', label: 'No service (unbilled)' }, ...services.map(s => ({ value: s.id, label: s.name, sublabel: `${fmtServiceRate(s.sale_price, s.currency)}/${s.unit}` }))]}
                  value={newProductId} onChange={setNewProductId} placeholder="No service (unbilled)"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" type="submit" loading={addSaving} loadingText="Saving…">Add Task</Button>
                <Button variant="outline" size="sm" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Task Content */}
      {visible.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
          No tasks match this filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="shipment-task-table-wrap">
            <table className="shipment-task-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: 200 }}>Task</th>
                  <th style={{ minWidth: 140 }}>Service</th>
                  <th style={{ minWidth: 110, whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ minWidth: 95, whiteSpace: 'nowrap' }}>Start</th>
                  <th style={{ minWidth: 95, whiteSpace: 'nowrap' }}>Due</th>
                  <th style={{ minWidth: 90 }}>Assignees</th>
                  <th style={{ minWidth: 90, whiteSpace: 'nowrap' }}>Priority</th>
                  <th style={{ minWidth: 80 }}>Tags</th>
                  <th style={{ minWidth: 190, textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task, i) => {
                  const sCfg = TASK_STATUS_CFG[task.status];
                  const pCfg = PRIORITY_CFG[task.priority];
                  const overdue = task.dueDate && new Date() > task.dueDate && task.status !== 'complete';
                  return (
                    <tr key={task.id}>
                      <td style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 11 }}>{i + 1}</td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.35 }}>{task.title}</div>
                        {task.description && (
                          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td>
                        {task.serviceName ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{task.serviceName}</div>
                            <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 600 }}>{fmtServiceRate(task.serviceRate || 0, task.serviceCurrency || 'USD')}/{task.serviceUnit}</div>
                          </div>
                        ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Badge variant={task.status === 'complete' ? 'success' : task.status === 'in_progress' ? 'info' : task.status === 'testing' ? 'info' : task.status === 'awaiting_feedback' ? 'warning' : 'gray'} className="whitespace-nowrap font-medium text-xs">
                          {sCfg.label}
                        </Badge>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fdate(task.startDate)}</td>
                      <td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--ink3)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>{fdate(task.dueDate)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          {task.assignees.slice(0, 3).map(a => (
                            <Av key={a} name={a} size={24} />
                          ))}
                          {task.assignees.length > 3 && (
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border)', color: 'var(--ink3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                              +{task.assignees.length - 3}
                            </div>
                          )}
                          {task.assignees.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Badge variant={task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'gray'} className="whitespace-nowrap font-medium text-xs">
                          {pCfg.label}
                        </Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {task.tags.length > 0 ? task.tags.map(tag => (
                            <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', color: 'var(--ink3)', border: '1px solid var(--border)' }}>{tag}</span>
                          )) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {task.closedAt ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                            <span title={`Closed ${fdate(task.closedAt)}${task.closedById ? ` by ${nameFor(task.closedById)}` : ''}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                              <Icon name="lock" size={12} /> Closed{task.closedById ? ` · ${nameFor(task.closedById)}` : ''}
                            </span>
                            {canEditStatus(task) && (
                              <Button variant="outline" size="xs" onClick={() => closeTask(task, 'reopen')} disabled={savingStatus === task.id} title="Reopen this task">Reopen</Button>
                            )}
                          </div>
                        ) : canEditStatus(task) ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 120 }}>
                              <Select value={task.status} onValueChange={v => setTaskStatus(task, v as TaskStatus)} disabled={savingStatus === task.id}>
                                <SelectTrigger className="h-7 text-xs bg-background"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'] as TaskStatus[]).map(s => (
                                    <SelectItem key={s} value={s}>{TASK_STATUS_CFG[s].label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {task.status !== 'complete' && (
                              <Button variant="outline" size="xs" className="h-7 w-7 p-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={() => setTaskStatus(task, 'complete')} disabled={savingStatus === task.id} title="Mark complete">
                                <Icon name="check" size={12} />
                              </Button>
                            )}
                            <Button variant="outline" size="xs" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => closeTask(task, 'close')} disabled={savingStatus === task.id} title="Close & sign off this task">
                              <Icon name="lock" size={11} className="mr-1" /> Close
                            </Button>
                          </div>
                        ) : <span style={{ fontSize: 12, color: 'var(--ink3)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="shipment-task-mobile-list">
            {visible.map((task, i) => {
              const sCfg = TASK_STATUS_CFG[task.status];
              const pCfg = PRIORITY_CFG[task.priority];
              const overdue = task.dueDate && new Date() > task.dueDate && task.status !== 'complete';
              return (
                <div key={task.id} className="shipment-task-mobile-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>#{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{task.title}</span>
                      </div>
                      {task.description && (
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{task.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <Badge variant={task.status === 'complete' ? 'success' : task.status === 'in_progress' ? 'info' : task.status === 'testing' ? 'info' : task.status === 'awaiting_feedback' ? 'warning' : 'gray'} className="whitespace-nowrap font-medium text-xs">
                        {sCfg.label}
                      </Badge>
                      <Badge variant={task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'gray'} className="whitespace-nowrap font-medium text-xs">
                        {pCfg.label}
                      </Badge>
                    </div>
                  </div>

                  {task.serviceName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, background: 'var(--bg)', padding: '6px 10px', borderRadius: 'var(--r-sm)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{task.serviceName}</span>
                      <span style={{ color: 'var(--teal)', fontWeight: 600, marginLeft: 'auto' }}>
                        {fmtServiceRate(task.serviceRate || 0, task.serviceCurrency || 'USD')}/{task.serviceUnit}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 11, color: 'var(--ink3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {task.assignees.slice(0, 3).map(a => (
                          <Av key={a} name={a} size={20} />
                        ))}
                      </div>
                      <span>{task.assignees.length > 0 ? task.assignees.map(friendlyAssignee).join(', ') : 'Unassigned'}</span>
                    </div>
                    {task.dueDate && (
                      <div style={{ color: overdue ? 'var(--red)' : 'var(--ink3)', fontWeight: overdue ? 700 : 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="calendar" size={11} />
                        <span>{overdue ? 'Overdue: ' : 'Due '}{fdate(task.dueDate)}</span>
                      </div>
                    )}
                  </div>

                  {task.closedAt ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                        <Icon name="lock" size={11} /> Closed{task.closedById ? ` · ${nameFor(task.closedById)}` : ''}
                      </span>
                      {canEditStatus(task) && (
                        <Button variant="outline" size="xs" onClick={() => closeTask(task, 'reopen')} disabled={savingStatus === task.id}>Reopen</Button>
                      )}
                    </div>
                  ) : canEditStatus(task) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Select value={task.status} onValueChange={v => setTaskStatus(task, v as TaskStatus)} disabled={savingStatus === task.id}>
                          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['not_started', 'in_progress', 'testing', 'awaiting_feedback', 'complete'] as TaskStatus[]).map(s => (
                              <SelectItem key={s} value={s}>{TASK_STATUS_CFG[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {task.status !== 'complete' && (
                        <Button variant="outline" size="xs" className="h-8 px-2.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => setTaskStatus(task, 'complete')} disabled={savingStatus === task.id}>
                          <Icon name="check" size={12} className="mr-1" /> Done
                        </Button>
                      )}
                      <Button variant="outline" size="xs" className="h-8 px-2.5 text-xs text-muted-foreground" onClick={() => closeTask(task, 'close')} disabled={savingStatus === task.id}>
                        <Icon name="lock" size={11} className="mr-1" /> Close
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </UICard>
  );
}

// ─── Timesheets Tab ───────────────────────────────────────────────────────────

export function TimesheetsTab({ job, isMobile, shipmentId, isLive, onRefresh }: { job: ClearanceJob; isMobile: boolean; shipmentId: string; isLive: boolean; onRefresh: () => void }) {
  const { user } = useAuth();
  const canLogOthers = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'].includes(user.role);
  const [showLog,   setShowLog]   = useState(false);
  const [logMember, setLogMember] = useState(user?.id || '');
  const [logTask,   setLogTask]   = useState(job.tasks[0]?.id || '');
  const [logHours,  setLogHours]  = useState('');
  const [logNote,   setLogNote]   = useState('');
  const [logDate,   setLogDate]   = useState(new Date().toISOString().slice(0, 10));
  const [logProductId, setLogProductId] = useState(job.tasks[0]?.productId || '');
  const [logSaving, setLogSaving] = useState(false);
  const [staff,     setStaff]     = useState<{ id: string; name: string }[]>([]);
  const [services,  setServices]  = useState<{ id: string; name: string; sale_price: number; currency: string; unit: string }[]>([]);
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
          body: JSON.stringify({ user_id: logMember || user?.id, member: memberName, task_ref: job.tasks.find(t => t.id === logTask)?.title || undefined, hours: h, note: logNote || undefined, log_date: logDate, product_id: logProductId || undefined }),
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
        <Button size="sm" onClick={() => setShowLog(true)}>
          <Icon name="clock" size={14} /> Log Time
        </Button>
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
                options={staff.filter(s => canLogOthers || s.id === user?.id).map(s => ({ value: s.id, label: s.name }))}
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
              <input data-ui-field="input" type="number" step="0.25" min="0.25" value={logHours} onChange={e => setLogHours(e.target.value)} className="input-field" placeholder="1.5" required style={{ width: '100%', fontFamily: 'var(--font)' }} />
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
            <input data-ui-field="input" value={logNote} onChange={e => setLogNote(e.target.value)} className="input-field" placeholder="What was worked on…" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" type="submit" loading={logSaving} loadingText="Saving…">Save Entry</Button>
            <Button variant="outline" size="sm" type="button" onClick={() => setShowLog(false)}>Cancel</Button>
          </div>
        </form>
        </Card>
        </div>
      )}

      {/* Table */}
      <div className="rtbl-wrap" style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
      <Card padded={false}>
        <table className="rtbl" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
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
