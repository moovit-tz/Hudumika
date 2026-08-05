import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { Switch } from './ui/switch.js';

/* ── Types ── */
interface Task  { id: string; name: string; category: string; is_billable: boolean; color: string }
interface Entry { id: string; task_name: string | null; is_billable: boolean; started_at: string; is_full_day: boolean; last_ack_at: string | null }

const LS_KEY = 'hudumika_checkin';

function saveLS(data: Partial<Entry> | null) {
  if (data) localStorage.setItem(LS_KEY, JSON.stringify(data));
  else localStorage.removeItem(LS_KEY);
}
function readLS(): Partial<Entry> | null {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
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
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [tasksErr,     setTasksErr]     = useState(false);
  const [shipments,    setShipments]    = useState<any[]>([]);
  const [checkInMode,  setCheckInMode]  = useState<'task' | 'shipment'>('shipment');
  const [selShipment,  setSelShipment]  = useState<any | null>(null);
  const [startErr,     setStartErr]     = useState('');
  const [entry,        setEntry]        = useState<Partial<Entry> | null>(readLS);
  const [open,         setOpen]         = useState(false);
  const [selTask,      setSelTask]       = useState<Task | null>(null);
  const [billable,     setBillable]     = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [tick,         setTick]         = useState(0);
  const [search,       setSearch]       = useState('');
  const [lockedMode,   setLockedMode]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Skip widget for CUSTOMER role
  const isStaff = user && user.role !== 'CUSTOMER';

  // ── Load tasks and shipments ──
  useEffect(() => {
    if (!isStaff) return;
    apiFetch('/v1/hr/tasks')
      .then(d => { if (Array.isArray(d)) setTasks(d); })
      .catch(() => setTasksErr(true));
    // Load user's active shipments
    apiFetch('/v1/hr/my-shipments')
      .then(d => { if (Array.isArray(d)) setShipments(d); })
      .catch(() => {});
  }, [isStaff]);

  // ── Sync with API today's open entry on mount ──
  useEffect(() => {
    if (!isStaff) return;
    apiFetch('/v1/hr/time/today').then((rows: any[]) => {
      const open = rows?.find((r: any) => !r.ended_at);
      if (open) { setEntry(open); saveLS(open); ctxSetCheckedIn(true, open); }
      else      { setEntry(null); saveLS(null); ctxSetCheckedIn(false); }
    }).catch(() => {});
  }, [isStaff]);

  // ── Open when TopBar clock button (or a page's clock-gate) triggers ──
  useEffect(() => {
    if (openTrigger > 0 && isStaff) setOpen(true);
  }, [openTrigger, isStaff]);

  // ── Auto-detect the shipment/task the trigger fired from, if any ──
  useEffect(() => {
    if (openTrigger === 0) return;
    setSearch('');
    if (openContext?.shipmentId) {
      setCheckInMode('shipment');
      setLockedMode(true);
      const match = shipments.find(s => s.id === openContext.shipmentId);
      setSelShipment(match || { id: openContext.shipmentId, ref_number: openContext.shipmentRef || openContext.shipmentId, goods_desc: '' });
    } else if (openContext?.taskId) {
      setCheckInMode('task');
      setLockedMode(true);
      const match = tasks.find(t => t.id === openContext.taskId);
      if (match) setSelTask(match);
    } else {
      setLockedMode(false);
      setSelShipment(null);
      setSelTask(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTrigger]);

  // ── Tick every minute ──
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Removed the 30-minute reminder popup logic.

  const startTask = useCallback(async () => {
    setStartErr('');
    setSaving(true);
    try {
      const body = checkInMode === 'shipment' && selShipment ? {
        task_name: `Shipment: ${selShipment.ref_number}`,
        is_billable: true,
        entry_type: 'CHECK_IN',
        project_id: selShipment.id,
        project_ref: selShipment.ref_number,
      } : {
        task_id: selTask?.id ?? null,
        task_name: selTask?.name ?? 'Check-in',
        is_billable: selTask ? (selTask.is_billable && billable) : false,
        entry_type: 'CHECK_IN',
      };
      const newEntry = await apiFetch('/v1/hr/time/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setEntry(newEntry);
      saveLS(newEntry);
      ctxSetCheckedIn(true, newEntry);
      setOpen(false);
    } catch (err: any) {
      setStartErr(err?.message || 'Failed to clock in. Please try again.');
    } finally { setSaving(false); }
  }, [selTask, selShipment, checkInMode, billable, ctxSetCheckedIn]);

  const switchTask = useCallback(async () => {
    if (!selTask) return;
    setSaving(true);
    try {
      const newEntry = await apiFetch('/v1/hr/time/start', {
        method: 'POST',
        body: JSON.stringify({
          task_id: selTask.id, task_name: selTask.name,
          is_billable: selTask.is_billable && billable, entry_type: 'TASK',
        }),
      });
      setEntry(newEntry);
      saveLS(newEntry);
      ctxSetCheckedIn(true, newEntry);
      setOpen(false);
    } catch { } finally { setSaving(false); }
  }, [selTask, billable, ctxSetCheckedIn]);

  const checkout = useCallback(async () => {
    if (!entry?.id) { setEntry(null); saveLS(null); ctxSetCheckedIn(false); return; }
    setSaving(true);
    try {
      await apiFetch(`/v1/hr/time/${entry.id}/stop`, { method: 'PATCH' });
    } catch {
      // Entry may not exist in DB (e.g. stale localStorage) — clear state anyway
    } finally {
      setEntry(null);
      saveLS(null);
      ctxSetCheckedIn(false);
      setOpen(false);
      setSaving(false);
    }
  }, [entry, ctxSetCheckedIn]);


  if (!isStaff) return null;
  const checkedIn = !!entry?.started_at;

  const q = search.trim().toLowerCase();
  const filteredShipments = !q ? shipments : shipments.filter((s: any) =>
    (s.ref_number || '').toLowerCase().includes(q) || (s.goods_desc || '').toLowerCase().includes(q));
  const filteredTasks = !q ? tasks : tasks.filter(t =>
    t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));

  /* ── Task selector panel ── */
  if (open) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}
        onClick={() => setOpen(false)}>
      <div style={{ width: isMobile ? '100%' : 460, maxWidth: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: 'var(--white)', borderRadius: isMobile ? '16px 16px 0 0' : 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '90vh' : '85vh' }}>

          {/* Header */}
          <div style={{ padding: '24px 24px 16px', position: 'relative' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              {checkedIn ? 'Switch Task' : 'Start Work'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
              {lockedMode
                ? `Checking in on ${checkInMode === 'shipment' ? (selShipment?.ref_number || 'this shipment') : (selTask?.name || 'this task')}`
                : checkedIn ? `Currently: ${entry?.task_name || 'No task'}` : 'Select a task to begin your session'}
            </div>
            <button type="button" title="Close" onClick={() => setOpen(false)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, borderRadius: '50%', transition: 'background 0.2s' }}>
              <Icon name="x" size={18} />
            </button>
          </div>

          {/* Mode toggle — hidden once auto-detected from a shipment/task page, so the type is locked but the specific item can still be changed below */}
          {!lockedMode && (
            <div style={{ padding: '0 24px 12px', display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', background: 'var(--bg)', padding: 4, borderRadius: 10, width: '100%' }}>
                <button type="button" onClick={() => setCheckInMode('shipment')}
                  style={{ flex: 1, padding: 'var(--ds-btn-py) 0', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', transition: 'all 0.2s',
                    background: checkInMode === 'shipment' ? 'var(--white)' : 'transparent', color: checkInMode === 'shipment' ? 'var(--ink)' : 'var(--ink2)', boxShadow: checkInMode === 'shipment' ? 'var(--shadow-sm)' : 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  By Shipment
                </button>
                <button type="button" onClick={() => setCheckInMode('task')}
                  style={{ flex: 1, padding: 'var(--ds-btn-py) 0', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', transition: 'all 0.2s',
                    background: checkInMode === 'task' ? 'var(--white)' : 'transparent', color: checkInMode === 'task' ? 'var(--ink)' : 'var(--ink2)', boxShadow: checkInMode === 'task' ? 'var(--shadow-sm)' : 'none', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  By Task
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ padding: '0 24px 12px' }}>
            <div style={{ position: 'relative' }}>
              <Icon name="search" size={14} color="var(--ink3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={checkInMode === 'shipment' ? 'Search shipments…' : 'Search tasks…'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
            {checkInMode === 'shipment' ? (
              filteredShipments.length === 0 ? (
                <div style={{ padding: '24px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>
                  {q ? 'No shipments match your search.' : 'No active shipments assigned to you.'}
                </div>
              ) : filteredShipments.map((s: any) => {
                const isSelected = selShipment?.id === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setSelShipment(isSelected ? null : s)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--ds-btn-py-lg) 24px',
                      background: isSelected ? 'var(--teal-l)' : 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.15s', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--teal)' : 'var(--ink)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{s.ref_number}</div>
                      <div style={{ fontSize: 12, color: isSelected ? 'var(--teal)' : 'var(--ink2)' }}>{s.goods_desc || 'Shipment'}</div>
                    </div>
                    {isSelected && <Icon name="check" size={16} color="var(--teal)" />}
                  </button>
                );
              })
            ) : (
              <>
                {tasksErr && (
                  <div style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--red)', background: 'var(--red-l)', margin: '0 24px 12px', borderRadius: 8 }}>
                    Could not load tasks. You can still check in without a task.
                  </div>
                )}
                {!tasksErr && tasks.length === 0 && (
                  <div style={{ padding: '24px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>Loading tasks…</div>
                )}
                {!tasksErr && tasks.length > 0 && filteredTasks.length === 0 && (
                  <div style={{ padding: '24px', fontSize: 13, color: 'var(--ink3)', textAlign: 'center' }}>No tasks match your search.</div>
                )}
                {filteredTasks.map(t => {
                  const isSelected = selTask?.id === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setSelTask(isSelected ? null : t)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--ds-btn-py-lg) 24px',
                        background: isSelected ? 'var(--teal-l)' : 'transparent',
                        border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.15s', minHeight: 'var(--ctl-h-lg)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--teal)' : 'var(--ink)' }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: isSelected ? 'var(--teal)' : 'var(--ink2)' }}>{t.category}</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                        background: isSelected ? 'var(--teal-m)' : 'var(--bg)',
                        color: isSelected ? 'var(--teal)' : 'var(--ink3)' }}>
                        {t.is_billable ? 'Billable' : 'Non-bill'}
                      </span>
                      {isSelected && <Icon name="check" size={16} color="var(--teal)" style={{ marginLeft: 6 }} />}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Billable toggle — only shown in task mode */}
          {checkInMode === 'task' && selTask && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink2)', flex: 1 }}>Mark as billable</span>
              <Switch checked={billable} onCheckedChange={setBillable} />
            </div>
          )}

          {startErr && <div style={{ margin: '0 24px 16px', fontSize: 12.5, color: 'var(--red)', fontWeight: 500 }}>{startErr}</div>}

          {/* Footer Actions */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg)' }}>
            {checkedIn ? (
              <>
                <button type="button" onClick={checkout} disabled={saving}
                  style={{ background: 'none', border: 'none', padding: 'var(--ds-btn-py) 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink2)', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  Check Out
                </button>
                <button type="button" disabled={!selTask || saving} onClick={switchTask}
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: (!selTask || saving) ? 'default' : 'pointer', opacity: (!selTask || saving) ? 0.6 : 1, transition: 'opacity 0.2s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {saving ? 'Switching…' : 'Switch Task'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setOpen(false)}
                  style={{ background: 'none', border: 'none', padding: 'var(--ds-btn-py) 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink2)', cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  Cancel
                </button>
                <button type="button" disabled={saving || (!selShipment && checkInMode === 'shipment') || (!selTask && checkInMode === 'task')} onClick={startTask}
                  style={{ background: 'var(--teal)', color: '#fff', border: 'none', padding: 'var(--ds-btn-py) 20px', borderRadius: 'var(--r)', fontSize: 13, fontWeight: 600, cursor: saving || (!selShipment && checkInMode === 'shipment') || (!selTask && checkInMode === 'task') ? 'default' : 'pointer', opacity: saving || (!selShipment && checkInMode === 'shipment') || (!selTask && checkInMode === 'task') ? 0.6 : 1, transition: 'opacity 0.2s', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                  {saving ? 'Starting…' : 'Check In'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    );
  }

  return null;
};
