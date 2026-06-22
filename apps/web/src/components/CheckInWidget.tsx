import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useClockIn } from '../contexts/ClockInContext.jsx';

/* ── Types ── */
interface Task  { id: string; name: string; category: string; is_billable: boolean; color: string }
interface Entry { id: string; task_name: string | null; is_billable: boolean; started_at: string; is_full_day: boolean; last_ack_at: string | null }

const LS_KEY = 'clearos_checkin';

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
  const { openTrigger, setCheckedIn: ctxSetCheckedIn } = useClockIn();
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [tasksErr,     setTasksErr]     = useState(false);
  const [shipments,    setShipments]    = useState<any[]>([]);
  const [checkInMode,  setCheckInMode]  = useState<'task' | 'shipment'>('shipment');
  const [selShipment,  setSelShipment]  = useState<any | null>(null);
  const [startErr,     setStartErr]     = useState('');
  const [entry,        setEntry]        = useState<Partial<Entry> | null>(readLS);
  const [open,         setOpen]         = useState(false);
  const [reminder,     setReminder]     = useState(false);
  const [selTask,      setSelTask]       = useState<Task | null>(null);
  const [billable,     setBillable]     = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [tick,         setTick]         = useState(0);
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

  // ── Open when TopBar clock button triggers ──
  useEffect(() => {
    if (openTrigger > 0 && isStaff) setOpen(true);
  }, [openTrigger, isStaff]);

  // ── Tick every minute ──
  useEffect(() => {
    timerRef.current = setInterval(() => setTick(t => t + 1), 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── 30-min reminder ──
  useEffect(() => {
    if (!entry?.started_at || !entry.id) return;
    const lastAck = entry.last_ack_at ? new Date(entry.last_ack_at) : new Date(entry.started_at);
    const minSince = (Date.now() - lastAck.getTime()) / 60000;
    if (minSince >= 30 && !entry.is_full_day) setReminder(true);
  }, [tick, entry]);

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
      setReminder(false);
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
      setReminder(false);
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
      setReminder(false);
      setSaving(false);
    }
  }, [entry, ctxSetCheckedIn]);

  const acknowledge = useCallback(async () => {
    if (!entry?.id) return;
    try {
      const updated = await apiFetch(`/v1/hr/time/${entry.id}/ack`, { method: 'PATCH' });
      setEntry(updated);
      saveLS(updated);
    } catch { }
    setReminder(false);
  }, [entry]);

  const extendFullDay = useCallback(async () => {
    if (!entry?.id) return;
    try {
      const updated = await apiFetch(`/v1/hr/time/${entry.id}/extend`, { method: 'PATCH' });
      setEntry(updated);
      saveLS(updated);
    } catch { }
    setReminder(false);
  }, [entry]);

  if (!isStaff) return null;

  const checkedIn = !!entry?.started_at;

  /* ── 30-min reminder modal ── */
  if (reminder && entry) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--white)', borderRadius: 12, padding: 28, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clock" size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Task Check-In</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>30-minute reminder</div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 6 }}>
            You've been working on <strong>"{entry.task_name || 'your current task'}"</strong> for 30+ minutes.
          </p>
          <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 20 }}>
            Elapsed: <strong>{elapsed(entry.started_at!)}</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={acknowledge}
              style={{ width: '100%', fontSize: 13 }}>
              Still on this — snooze 30 min
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setReminder(false); setOpen(true); }}
              style={{ width: '100%', fontSize: 13 }}>
              Switch task
            </button>
            <button type="button" className="btn btn-primary" onClick={extendFullDay}
              style={{ width: '100%', fontSize: 13, background: 'var(--teal)', borderColor: 'var(--teal)' }}>
              Extend — covering full day
            </button>
            <button type="button" onClick={checkout} disabled={saving}
              style={{ width: '100%', padding: '8px', border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12 }}>
              Check out & end session
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Task selector panel ── */
  if (open) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 360 }}>
        <div style={{ background: 'var(--white)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 48px rgba(0,0,0,0.16)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 18px', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {checkedIn ? 'Switch Task' : 'Start Work'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                {checkedIn ? `Currently: ${entry?.task_name || 'No task'}` : 'Select a task to begin your session'}
              </div>
            </div>
            <button type="button" title="Close" onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Mode toggle */}
          <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setCheckInMode('shipment')}
              style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                background: checkInMode === 'shipment' ? 'var(--navy)' : 'var(--bg)', color: checkInMode === 'shipment' ? '#fff' : 'var(--ink3)' }}>
              By Shipment
            </button>
            <button type="button" onClick={() => setCheckInMode('task')}
              style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                background: checkInMode === 'task' ? 'var(--navy)' : 'var(--bg)', color: checkInMode === 'task' ? '#fff' : 'var(--ink3)' }}>
              By Task
            </button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '8px 0' }}>
            {checkInMode === 'shipment' ? (
              shipments.length === 0 ? (
                <div style={{ padding: '16px 18px', fontSize: 12, color: 'var(--ink3)' }}>
                  No active shipments assigned to you.
                </div>
              ) : shipments.map((s: any) => (
                <button key={s.id} type="button" onClick={() => setSelShipment(selShipment?.id === s.id ? null : s)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
                    background: selShipment?.id === s.id ? 'var(--bg)' : 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font)', textAlign: 'left',
                    borderLeft: selShipment?.id === s.id ? '3px solid var(--teal)' : '3px solid transparent' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{s.ref_number}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{s.goods_desc || s.ref_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{s.customer_name}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: 'var(--bg)', color: 'var(--ink3)' }}>
                    {s.type || 'SEA'}
                  </span>
                </button>
              ))
            ) : (
              <>
                {tasksErr && (
                  <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--red)', background: 'var(--red-l)', margin: '8px 10px', borderRadius: 7 }}>
                    Could not load tasks. You can still check in without a task.
                  </div>
                )}
                {!tasksErr && tasks.length === 0 && (
                  <div style={{ padding: '16px 18px', fontSize: 12, color: 'var(--ink3)' }}>Loading tasks…</div>
                )}
                {tasks.map(t => (
                  <button key={t.id} type="button" onClick={() => setSelTask(selTask?.id === t.id ? null : t)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
                      background: selTask?.id === t.id ? 'var(--bg)' : 'none',
                      border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                      borderLeft: selTask?.id === t.id ? `3px solid ${t.color}` : '3px solid transparent',
                    }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: selTask?.id === t.id ? 700 : 500, color: 'var(--ink)' }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{t.category}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                      background: t.is_billable ? 'rgba(8,145,178,0.1)' : 'var(--bg)',
                      color: t.is_billable ? 'var(--teal)' : 'var(--ink3)' }}>
                      {t.is_billable ? 'Billable' : 'Non-bill'}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Billable toggle — only shown in task mode */}
          {checkInMode === 'task' && selTask && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)', flex: 1 }}>Mark as billable</span>
              <button type="button" onClick={() => setBillable(b => !b)}
                style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', transition: 'background 0.2s',
                  background: billable ? 'var(--teal)' : 'var(--border)', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 2, left: billable ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          )}

          {/* Error feedback */}
          {startErr && (
            <div style={{ margin: '0 18px 10px', padding: '8px 12px', borderRadius: 7, background: 'var(--red-l)', fontSize: 12, color: 'var(--red)' }}>
              {startErr}
            </div>
          )}

          {/* Actions */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            {checkedIn ? (
              <>
                <button type="button" className="btn btn-primary" onClick={switchTask}
                  disabled={!selTask || saving}
                  style={{ flex: 1, fontSize: 12, background: 'var(--teal)', borderColor: 'var(--teal)' }}>
                  {saving ? 'Switching…' : 'Switch Task'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={checkout}
                  disabled={saving} style={{ fontSize: 12 }}>
                  Check Out
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={startTask}
                disabled={saving || (checkInMode === 'shipment' && !selShipment && shipments.length > 0)}
                style={{ flex: 1, fontSize: 12, background: 'var(--teal)', borderColor: 'var(--teal)' }}>
                {saving ? 'Starting…' : (checkInMode === 'shipment' && selShipment) ? `Check In — ${selShipment.ref_number}` : selTask ? 'Check In & Start' : 'Check In'}
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    );
  }

  return null;
};
