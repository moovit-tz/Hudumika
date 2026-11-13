import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { Switch } from './ui/switch.js';
import { Dialog, DialogContent } from './ui/dialog.js';
import { Button } from './ui/button.js';

/* ── Types ── */
interface Task {
  id: string;
  name: string;
  category: string;
  is_billable: boolean;
  color: string;
}

interface Entry {
  id: string;
  task_name: string | null;
  is_billable: boolean;
  started_at: string;
  is_full_day: boolean;
  last_ack_at: string | null;
  notes?: string | null;
  work_item_app_id?: string | null;
  work_item_type?: string | null;
  work_item_id?: string | null;
  work_item_ref?: string | null;
  work_item_label?: string | null;
}

export interface UnifiedWorkItem {
  app_id: string;
  app_name?: string;
  type: string;
  id: string;
  ref: string | null;
  label: string;
  subtitle?: string | null;
  status?: string | null;
  is_billable: boolean;
}

const APP_META: Record<string, { label: string; icon: IconName }> = {
  clearos:     { label: 'ClearOS',   icon: 'package' },
  tasks:       { label: 'Tasks',     icon: 'tasks' },
  crm:         { label: 'CRM',       icon: 'users' },
  support:     { label: 'Support',   icon: 'helpCircle' },
  tuma:        { label: 'Tuma',      icon: 'send' },
  seal:        { label: 'Seal',      icon: 'shield' },
  hudufreight: { label: 'Freight',   icon: 'truck' },
  finops:      { label: 'FinOps',    icon: 'dollarSign' },
  complyos:    { label: 'ComplyOS',  icon: 'fileText' },
  gereji:      { label: 'Gereji',    icon: 'tool' },
  nexushr:     { label: 'NexusHR',   icon: 'userCheck' },
  projects:    { label: 'Projects',  icon: 'folder' },
};

function formatFriendlyStage(stage: unknown): string | null {
  if (!stage || typeof stage !== 'string') return null;
  const s = stage.trim();
  // Filter out machine-generated raw UUIDs
  if (/^[0-9a-fA-F-]{20,}$/.test(s)) return null;
  const lower = s.toLowerCase();
  const map: Record<string, string> = {
    docs_received: 'Docs Received',
    validation: 'Validation',
    permit_applications: 'Permits',
    entry_preparation: 'Entry Prep',
    tancis_registration: 'TANCIS Reg',
    assessment_payment: 'Assessment',
    tax_payment: 'Tax Payment',
    do_application: 'Delivery Order',
    inspection_booking: 'Inspection',
    transport_delivery: 'Transport',
    completed: 'Completed',
    in_progress: 'In Progress',
    pending: 'Pending',
    open: 'Open',
    active: 'Active',
  };
  if (map[lower]) return map[lower];
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const LS_KEY = 'hudumika_checkin';

function saveLS(data: Partial<Entry> | null) {
  if (data) localStorage.setItem(LS_KEY, JSON.stringify(data));
  else localStorage.removeItem(LS_KEY);
}

function readLS(): Partial<Entry> | null {
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function elapsed(from: string): string {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ─────────────────────────────────────────── */

export const CheckInWidget: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { openTrigger, openContext, setCheckedIn: ctxSetCheckedIn } = useClockIn();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksErr, setTasksErr] = useState(false);
  const [shipments, setShipments] = useState<any[]>([]);
  const [workItems, setWorkItems] = useState<UnifiedWorkItem[]>([]);
  const [enabledAppIds, setEnabledAppIds] = useState<string[]>([]);

  // Selected item state
  const [selShipment, setSelShipment] = useState<any | null>(null);
  const [selTask, setSelTask] = useState<Task | null>(null);
  const [selWorkItem, setSelWorkItem] = useState<UnifiedWorkItem | null>(null);

  // Filter & Search
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [billable, setBillable] = useState(true);
  const [activityNotes, setActivityNotes] = useState('');
  const [startErr, setStartErr] = useState('');

  // Quick Task Creation state
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskApp, setNewTaskApp] = useState('tasks');
  const [newTaskBillable, setNewTaskBillable] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);

  // Widget state
  const [entry, setEntry] = useState<Partial<Entry> | null>(readLS);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lockedMode, setLockedMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enabledApps = useEnabledApps();
  const nexushrEnabled = isAppEnabled('nexushr', enabledApps);
  const isStaff = nexushrEnabled && user && user.role !== 'CUSTOMER' && !user.profile?.timesheet_exempt;

  // ── Load tasks, shipments and cross-app work items ──
  const refreshWorkData = useCallback(() => {
    if (!isStaff) return;
    // 1. General tasks
    apiFetch('/v1/hr/tasks')
      .then(d => { if (Array.isArray(d)) setTasks(d); })
      .catch(() => setTasksErr(true))
      .finally(() => setTasksLoaded(true));

    // 2. ClearOS shipments
    apiFetch('/v1/hr/my-shipments')
      .then(d => { if (Array.isArray(d)) setShipments(d); })
      .catch(() => {});

    // 3. Cross-app work items (Tasks, CRM, Support, Tuma, Seal, Freight, FinOps, ComplyOS, Gereji)
    apiFetch('/v1/hr/time/work-items')
      .then(d => {
        if (Array.isArray(d?.items)) setWorkItems(d.items);
        if (Array.isArray(d?.apps)) setEnabledAppIds(d.apps);
      })
      .catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    refreshWorkData();
  }, [refreshWorkData]);

  // ── Sync with API today's open entry on mount ──
  useEffect(() => {
    if (!isStaff) return;
    apiFetch('/v1/hr/time/today')
      .then((rows: any[]) => {
        const active = rows?.find((r: any) => !r.ended_at);
        if (active) {
          setEntry(active);
          saveLS(active);
          ctxSetCheckedIn(true, active);
          if (active.notes) setActivityNotes(active.notes);
        } else {
          setEntry(null);
          saveLS(null);
          ctxSetCheckedIn(false);
        }
      })
      .catch(() => {});
  }, [isStaff, ctxSetCheckedIn]);

  // ── Open when TopBar clock button triggers ──
  useEffect(() => {
    if (openTrigger > 0 && isStaff) {
      setOpen(true);
      setShowCreateTask(false);
    }
  }, [openTrigger, isStaff]);

  // ── Auto-detect context trigger ──
  useEffect(() => {
    if (openTrigger === 0) return;
    setSearch('');
    if (openContext?.shipmentId) {
      setCategoryFilter('clearos');
      setLockedMode(true);
      const match = shipments.find(s => s.id === openContext.shipmentId);
      setSelShipment(match || { id: openContext.shipmentId, ref_number: openContext.shipmentRef || openContext.shipmentId, goods_desc: '' });
      setSelTask(null);
      setSelWorkItem(null);
    } else if (openContext?.taskId) {
      setCategoryFilter('tasks');
      setLockedMode(true);
      const match = tasks.find(t => t.id === openContext.taskId);
      if (match) {
        setSelTask(match);
        setSelShipment(null);
        setSelWorkItem(null);
      }
    } else {
      setLockedMode(false);
      setSelShipment(null);
      setSelTask(null);
      setSelWorkItem(null);
    }
  }, [openTrigger, openContext, shipments, tasks]);

  // ── Timer tick ──
  useEffect(() => {
    timerRef.current = setInterval(() => {}, 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Check In / Start Work ──
  const startTask = useCallback(async () => {
    setStartErr('');
    setSaving(true);
    try {
      let body: any;

      if (selShipment) {
        body = {
          task_name: `Shipment: ${selShipment.ref_number}`,
          is_billable: false,
          entry_type: 'CHECK_IN',
          project_id: selShipment.id,
          project_ref: selShipment.ref_number,
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: 'clearos', type: 'shipment', id: selShipment.id },
        };
      } else if (selTask) {
        body = {
          task_id: selTask.id,
          task_name: selTask.name,
          is_billable: selTask.is_billable && billable,
          entry_type: 'CHECK_IN',
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: 'nexushr', type: 'task', id: selTask.id },
        };
      } else if (selWorkItem) {
        body = {
          task_name: selWorkItem.ref ? `${selWorkItem.ref} — ${selWorkItem.label}` : selWorkItem.label,
          is_billable: selWorkItem.is_billable && billable,
          entry_type: 'CHECK_IN',
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: selWorkItem.app_id, type: selWorkItem.type, id: selWorkItem.id },
        };
      } else {
        // General check-in without work item
        body = {
          task_name: 'General Session',
          is_billable: false,
          entry_type: 'CHECK_IN',
          notes: activityNotes.trim() || undefined,
        };
      }

      const newEntry = await apiFetch('/v1/hr/time/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setEntry(newEntry);
      saveLS(newEntry);
      ctxSetCheckedIn(true, newEntry);
      setOpen(false);
    } catch (err: any) {
      setStartErr(err?.message || 'Failed to start session. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [selShipment, selTask, selWorkItem, activityNotes, billable, ctxSetCheckedIn]);

  // ── Switch Work Item ──
  const switchTask = useCallback(async () => {
    const hasSelection = Boolean(selShipment || selTask || selWorkItem);
    if (!hasSelection) return;
    setSaving(true);
    try {
      let body: any;

      if (selShipment) {
        body = {
          task_name: `Shipment: ${selShipment.ref_number}`,
          is_billable: false,
          entry_type: 'TASK',
          project_id: selShipment.id,
          project_ref: selShipment.ref_number,
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: 'clearos', type: 'shipment', id: selShipment.id },
        };
      } else if (selTask) {
        body = {
          task_id: selTask.id,
          task_name: selTask.name,
          is_billable: selTask.is_billable && billable,
          entry_type: 'TASK',
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: 'nexushr', type: 'task', id: selTask.id },
        };
      } else if (selWorkItem) {
        body = {
          task_name: selWorkItem.ref ? `${selWorkItem.ref} — ${selWorkItem.label}` : selWorkItem.label,
          is_billable: selWorkItem.is_billable && billable,
          entry_type: 'TASK',
          notes: activityNotes.trim() || undefined,
          work_item: { app_id: selWorkItem.app_id, type: selWorkItem.type, id: selWorkItem.id },
        };
      }

      const newEntry = await apiFetch('/v1/hr/time/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setEntry(newEntry);
      saveLS(newEntry);
      ctxSetCheckedIn(true, newEntry);
      setOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Could not switch work item. Your current timer is still active.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [selShipment, selTask, selWorkItem, activityNotes, billable, ctxSetCheckedIn]);

  // ── Check Out / Stop Timer (Records activity done) ──
  const checkout = useCallback(async () => {
    if (!entry?.id) {
      setEntry(null);
      saveLS(null);
      ctxSetCheckedIn(false);
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/time/${entry.id}/stop`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: activityNotes.trim() || undefined }),
      });
      setEntry(null);
      saveLS(null);
      ctxSetCheckedIn(false);
      setOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Could not clock out. Please try again.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [entry, activityNotes, ctxSetCheckedIn]);

  // ── Quick Task Creation ──
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const created = await apiFetch('/v1/tasks/items', {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          notes: activityNotes.trim() || undefined,
          is_billable: newTaskBillable,
          priority: 'medium',
        }),
      });

      const newItem: UnifiedWorkItem = {
        id: created.id,
        app_id: 'tasks',
        app_name: 'Tasks',
        type: 'task',
        ref: null,
        label: created.title,
        subtitle: created.notes || 'Newly created task',
        status: 'Open',
        is_billable: created.is_billable,
      };

      setWorkItems(prev => [newItem, ...prev]);
      setSelWorkItem(newItem);
      setSelShipment(null);
      setSelTask(null);
      setShowCreateTask(false);
      setNewTaskTitle('');
    } catch (err: any) {
      showAlert(err.message || 'Failed to create task.', { variant: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  if (!isStaff) return null;
  const checkedIn = Boolean(entry?.started_at);

  // Search filtering
  const q = search.trim().toLowerCase();
  const matchesSearch = (...fields: unknown[]) => fields.some(f => String(f ?? '').toLowerCase().includes(q));

  const filteredShipments = !q ? shipments : shipments.filter((s: any) =>
    matchesSearch(s.ref_number, s.goods_desc, s.customer_name, s.bl_number, s.awb_number, s.tansad_number));

  const filteredTasks = !q ? tasks : tasks.filter(t => matchesSearch(t.name, t.category));

  const filteredWorkItems = !q ? workItems : workItems.filter(item =>
    matchesSearch(item.ref, item.label, item.subtitle, item.app_name));

  // Determine available tabs
  const categoryCounts: Record<string, number> = {
    all: filteredShipments.length + filteredTasks.length + filteredWorkItems.length,
    clearos: filteredShipments.length + filteredWorkItems.filter(i => i.app_id === 'clearos').length,
    tasks: filteredTasks.length + filteredWorkItems.filter(i => i.app_id === 'tasks').length,
  };

  for (const item of filteredWorkItems) {
    if (item.app_id !== 'clearos' && item.app_id !== 'tasks') {
      categoryCounts[item.app_id] = (categoryCounts[item.app_id] || 0) + 1;
    }
  }

  const categoryTabs: Array<{ id: string; label: string; icon: IconName; count: number }> = [
    { id: 'all', label: 'All Work', icon: 'layers', count: categoryCounts.all || 0 },
    { id: 'clearos', label: 'ClearOS', icon: 'package', count: categoryCounts.clearos || 0 },
    { id: 'tasks', label: 'Workspace Tasks', icon: 'tasks', count: categoryCounts.tasks || 0 },
  ];

  // Append other apps that have active items
  for (const [appId, meta] of Object.entries(APP_META)) {
    if (appId !== 'clearos' && appId !== 'tasks' && (categoryCounts[appId] || 0) > 0) {
      categoryTabs.push({
        id: appId,
        label: meta.label,
        icon: meta.icon,
        count: categoryCounts[appId] || 0,
      });
    }
  }

  const hasSelection = Boolean(selShipment || selTask || selWorkItem);
  const selectedItemLabel = selShipment
    ? selShipment.ref_number
    : selTask
      ? selTask.name
      : selWorkItem
        ? (selWorkItem.ref ? `${selWorkItem.ref} — ${selWorkItem.label}` : selWorkItem.label)
        : '';

  /* ── Dialog View ── */
  if (open) {
    return (
      <Dialog open onOpenChange={o => { if (!o) setOpen(false); }}>
        <DialogContent
          hideClose
          className={isMobile
            ? 'inset-x-0 bottom-0 top-auto left-0 translate-x-0 translate-y-0 w-full max-w-full rounded-t-2xl rounded-b-none p-0 gap-0'
            : 'rounded-2xl p-0 gap-0'}
          style={{
            border: '1px solid var(--border)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            width: isMobile ? '100%' : '560px',
            maxWidth: isMobile ? '100%' : 'calc(100vw - 32px)',
            height: isMobile ? '86vh' : '580px',
            maxHeight: isMobile ? '92vh' : 'calc(100vh - 48px)',
            background: 'var(--white)',
          }}
        >
          {/* Header */}
          <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--r-sm)',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink2)',
                flexShrink: 0,
              }}>
                <Icon name="clock" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                  {checkedIn ? 'Switch Work Item' : 'Start Work Session'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                  {lockedMode
                    ? `Checking in on ${selShipment?.ref_number || selTask?.name || 'this work item'}`
                    : checkedIn
                      ? `Active: ${entry?.task_name || 'General session'} (${entry?.started_at ? elapsed(entry.started_at) : 'running'})`
                      : 'Select pending work across any app or create a new task'}
                </div>
              </div>
            </div>
            <button
              type="button"
              title="Close"
              onClick={() => setOpen(false)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--r-sm)',
                border: 'none',
                background: 'transparent',
                color: 'var(--ink3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          {/* Quick Task Creation Panel (Collapsible) */}
          {showCreateTask ? (
            <form onSubmit={handleCreateTask} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="plus" size={14} />
                  Create New Work Task
                </span>
                <button type="button" onClick={() => setShowCreateTask(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12 }}>
                  Cancel
                </button>
              </div>

              <div>
                <input
                  type="text"
                  autoFocus
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Task title (e.g. Draft customs valuation schedule…)"
                  required
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--white)',
                    fontSize: 13,
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Billable</span>
                  <Switch checked={newTaskBillable} onCheckedChange={setNewTaskBillable} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateTask(false)}>
                    Close
                  </Button>
                  <Button type="submit" variant="default" size="sm" disabled={creatingTask || !newTaskTitle.trim()}>
                    {creatingTask ? 'Creating…' : 'Create & Select'}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            /* App Category Segmented Tabs Bar */
            !lockedMode && (
              <div style={{ padding: '12px 20px 6px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '3px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}>
                  {categoryTabs.map(tab => {
                    const isActive = categoryFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(tab.id);
                          setSelShipment(null);
                          setSelTask(null);
                          setSelWorkItem(null);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px',
                          borderRadius: 'var(--r-sm)',
                          border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                          cursor: 'pointer',
                          background: isActive ? 'var(--white)' : 'transparent',
                          color: isActive ? 'var(--ink)' : 'var(--ink3)',
                          fontSize: 12,
                          fontWeight: isActive ? 600 : 500,
                          whiteSpace: 'nowrap',
                          transition: 'all 0.12s ease',
                          boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                          outline: 'none',
                          flex: isMobile ? '1 0 auto' : undefined,
                        }}
                      >
                        <Icon name={tab.icon} size={13} color={isActive ? 'var(--ink)' : 'var(--ink3)'} />
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: '0 5px',
                            borderRadius: 99,
                            background: isActive ? 'var(--bg)' : 'transparent',
                            color: isActive ? 'var(--ink2)' : 'var(--ink3)',
                            border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                          }}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* Search Bar & Quick Create Task Button */}
          {!showCreateTask && (
            <div style={{ padding: '6px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Icon name="search" size={13} color="var(--ink3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search across all apps by reference, client or title…"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '7px 28px 7px 30px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontSize: 12,
                    fontFamily: 'var(--font)',
                    outline: 'none',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'var(--ink2)';
                    e.currentTarget.style.background = 'var(--white)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'var(--bg)';
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateTask(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap', height: 32 }}
              >
                <Icon name="plus" size={13} color="var(--ink2)" />
                New Task
              </Button>
            </div>
          )}

          {/* Work Items List */}
          <div style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', paddingBottom: 6 }}>
            {/* 1. ClearOS Shipments */}
            {(categoryFilter === 'all' || categoryFilter === 'clearos') && filteredShipments.map((s: any) => {
              const isSelected = selShipment?.id === s.id;
              const stageLabel = formatFriendlyStage(s.stage);
              return (
                <div
                  key={`shipment:${s.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelShipment(isSelected ? null : s);
                    setSelTask(null);
                    setSelWorkItem(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setSelShipment(isSelected ? null : s);
                      setSelTask(null);
                      setSelWorkItem(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '8px 12px',
                    margin: '0 20px 6px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--bg)' : 'var(--white)',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    outline: 'none',
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--r-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--white)' : 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: isSelected ? 'var(--ink)' : 'var(--ink2)',
                    flexShrink: 0,
                  }}>
                    <Icon name="package" size={15} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {s.ref_number}
                      </span>
                      {stageLabel && (
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 500,
                          padding: '0 5px',
                          borderRadius: 4,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--ink2)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 130,
                        }}>
                          {stageLabel}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ClearOS · {s.customer_name ? `${s.customer_name} · ` : ''}{s.goods_desc || 'Cargo Consignment'}
                    </div>
                  </div>

                  <div style={{
                    width: 17,
                    height: 17,
                    borderRadius: '50%',
                    border: `1.5px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--ink)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.12s ease',
                  }}>
                    {isSelected && <Icon name="check" size={10} color="var(--white)" />}
                  </div>
                </div>
              );
            })}

            {/* 2. Tasks OS & Internal Tasks */}
            {(categoryFilter === 'all' || categoryFilter === 'tasks') && filteredTasks.map(t => {
              const isSelected = selTask?.id === t.id;
              return (
                <div
                  key={`task:${t.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelTask(isSelected ? null : t);
                    setSelShipment(null);
                    setSelWorkItem(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setSelTask(isSelected ? null : t);
                      setSelShipment(null);
                      setSelWorkItem(null);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '8px 12px',
                    margin: '0 20px 6px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--bg)' : 'var(--white)',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    outline: 'none',
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--r-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--white)' : 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: isSelected ? 'var(--ink)' : 'var(--ink2)',
                    flexShrink: 0,
                  }}>
                    <Icon name="tasks" size={15} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name}
                      </span>
                      {t.is_billable && (
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 500,
                          padding: '0 5px',
                          borderRadius: 4,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--ink2)',
                          flexShrink: 0,
                        }}>
                          Billable
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Workspace Tasks · {t.category || 'General task'}
                    </div>
                  </div>

                  <div style={{
                    width: 17,
                    height: 17,
                    borderRadius: '50%',
                    border: `1.5px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--ink)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.12s ease',
                  }}>
                    {isSelected && <Icon name="check" size={10} color="var(--white)" />}
                  </div>
                </div>
              );
            })}

            {/* 3. Cross-App Work Items (CRM, Support, Tuma, Seal, Freight, FinOps, ComplyOS, Gereji, etc.) */}
            {filteredWorkItems
              .filter(item => categoryFilter === 'all' || categoryFilter === item.app_id)
              .map(item => {
                const isSelected = selWorkItem?.id === item.id && selWorkItem.app_id === item.app_id;
                const meta = APP_META[item.app_id] || { label: item.app_name || item.app_id, icon: 'layers' as IconName };
                return (
                  <div
                    key={`${item.app_id}:${item.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelWorkItem(isSelected ? null : item);
                      setSelShipment(null);
                      setSelTask(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setSelWorkItem(isSelected ? null : item);
                        setSelShipment(null);
                        setSelTask(null);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '8px 12px',
                      margin: '0 20px 6px',
                      borderRadius: 'var(--r-sm)',
                      border: `1px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--bg)' : 'var(--white)',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                      boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                      outline: 'none',
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--r-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected ? 'var(--white)' : 'var(--bg)',
                      border: '1px solid var(--border)',
                      color: isSelected ? 'var(--ink)' : 'var(--ink2)',
                      flexShrink: 0,
                    }}>
                      <Icon name={meta.icon} size={15} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {item.ref && (
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {item.ref}
                          </span>
                        )}
                        <span style={{ fontSize: item.ref ? 12 : 12.5, fontWeight: item.ref ? 500 : 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </span>
                        {item.status && (
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 500,
                            padding: '0 5px',
                            borderRadius: 4,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--ink2)',
                            flexShrink: 0,
                          }}>
                            {item.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {meta.label}{item.subtitle ? ` · ${item.subtitle}` : ''}
                      </div>
                    </div>

                    <div style={{
                      width: 17,
                      height: 17,
                      borderRadius: '50%',
                      border: `1.5px solid ${isSelected ? 'var(--ink)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--ink)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.12s ease',
                    }}>
                      {isSelected && <Icon name="check" size={10} color="var(--white)" />}
                    </div>
                  </div>
                );
              })}

            {/* Empty state */}
            {((categoryCounts[categoryFilter] || 0) === 0 || (categoryFilter === 'all' && categoryCounts.all === 0)) && (
              <div style={{
                height: '100%',
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '36px 20px',
                fontSize: 13,
                color: 'var(--ink3)',
                textAlign: 'center',
              }}>
                <Icon name="layers" size={26} color="var(--ink3)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <div>{q ? 'No work items match your search filter.' : 'No active or pending tasks in this category.'}</div>
                <Button variant="outline" size="sm" onClick={() => setShowCreateTask(true)} style={{ marginTop: 12 }}>
                  <Icon name="plus" size={13} /> Create a new task
                </Button>
              </div>
            )}
          </div>

          {/* Timesheet Activity Input (Records Activity Done) */}
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Activity Done / Session Focus <strong style={{ fontWeight: 400, color: 'var(--ink3)' }}>(Recorded to Timesheet)</strong></span>
              {(selTask?.is_billable || selWorkItem?.is_billable) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11 }}>Billable</span>
                  <Switch checked={billable} onCheckedChange={setBillable} />
                </span>
              )}
            </label>
            <input
              type="text"
              value={activityNotes}
              onChange={e => setActivityNotes(e.target.value)}
              placeholder="e.g. Prepared manifest, drafted customs declaration, verified charges…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 10px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                fontSize: 12,
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
          </div>

          {startErr && <div style={{ margin: '0 20px 8px', fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>{startErr}</div>}

          {/* Footer Actions */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'var(--white)',
          }}>
            {/* Selected item status preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: hasSelection ? 'var(--ink)' : 'var(--ink3)', minWidth: 0 }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: hasSelection ? 'var(--ink)' : 'var(--border)',
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hasSelection ? (
                  <>Selected: <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{selectedItemLabel}</strong></>
                ) : (
                  'Select an item or click Check In'
                )}
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {checkedIn ? (
                <>
                  <Button variant="destructive" size="sm" onClick={checkout} disabled={saving}>
                    Check Out
                  </Button>
                  <Button variant="default" size="sm" disabled={!hasSelection || saving} onClick={switchTask}>
                    {saving ? 'Switching…' : 'Switch Work Item'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="default" size="sm" disabled={saving} onClick={startTask}>
                    {saving ? 'Starting…' : (hasSelection ? 'Check In' : 'General Check In')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
};
