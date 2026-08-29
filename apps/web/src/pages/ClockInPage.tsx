import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, apiDownload } from '../lib/api.js';
import { Icon, IconName } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { PageHeader as SharedPageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog.js';
import { Button } from '../components/ui/button.js';
import { useAuth } from '../hooks/useAuth.js';
import { showAlert } from '../lib/alert.js';
import { SectionCard } from '../components/SectionCard.js';

interface TimesheetApproval {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  total_worked_minutes: number;
  session_count: number;
  submitted_at: string;
  reviewed_at?: string | null;
  note?: string | null;
  employee_name?: string;
  employee_avatar?: string | null;
  reviewed_by_name?: string | null;
}

const MANAGER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR'];

interface ClockSession {
  id: string;
  tenant_id: string;
  user_id: string;
  date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  project_name: string | null;
  status: 'ACTIVE' | 'ON_BREAK' | 'COMPLETED' | 'CANCELLED';
  total_break_minutes: number;
  worked_minutes: number | null;
}

interface ClockBreak {
  id: string;
  session_id: string;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
}

interface DailyTimelineBlock {
  type: 'working' | 'break' | 'overtime' | 'late';
  label: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  durationMinutes: number;
  startPercent: number;
  widthPercent: number;
}

interface DayTimesheetRow {
  dateIso: string;
  dateLabel: string;
  dayOfWeek: string;
  clockInTime: string;
  clockOutTime: string;
  durationHours: string;
  blocks: DailyTimelineBlock[];
}

export function ClockInPage() {
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null);
  const [activeBreak, setActiveBreak] = useState<ClockBreak | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectInput, setProjectInput] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  
  // Timer calculation
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Weekly data
  const [weeklySessions, setWeeklySessions] = useState<ClockSession[]>([]);
  const [weeklyBreaks, setWeeklyBreaks] = useState<ClockBreak[]>([]);
  const [userProfile, setUserProfile] = useState<{ name: string; role?: string } | null>(null);
  const [dateRangeFilter, setDateRangeFilter] = useState('7days');
  const [workedMinutesTotal, setWorkedMinutesTotal] = useState(0);

  // Manual entry modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualClockIn, setManualClockIn] = useState('09:00');
  const [manualClockOut, setManualClockOut] = useState('17:00');
  const [manualBreakMins, setManualBreakMins] = useState('60');
  const [manualProject, setManualProject] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Timesheet approval
  const { user } = useAuth();
  const isManager = !!user && MANAGER_ROLES.includes(user.role);
  const [myApproval, setMyApproval] = useState<TimesheetApproval | null>(null);
  const [approvals, setApprovals] = useState<TimesheetApproval[]>([]);
  const [submittingSheet, setSubmittingSheet] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // The window the weekly view shows: last 7 days, inclusive of today.
  const periodEnd = new Date().toISOString().slice(0, 10);
  const periodStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  // Load Active Session
  const loadActiveState = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/clock-in/active');
      if (res && res.active && res.session) {
        setActiveSession(res.session);
        setActiveBreak(res.activeBreak || null);
        if (res.session.project_name) {
          setSelectedProject(res.session.project_name);
        }
      } else {
        setActiveSession(null);
        setActiveBreak(null);
      }
    } catch (err) {
      console.error('Failed to load active clock-in session', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Weekly Data
  const loadWeeklyData = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/clock-in/weekly');
      if (res) {
        setWeeklySessions(res.sessions || []);
        setWeeklyBreaks(res.breaks || []);
        setWorkedMinutesTotal(res.workedMinutesTotal || 0);
        if (res.user) {
          setUserProfile(res.user);
        }
      }
    } catch (err) {
      console.error('Failed to load weekly timesheets', err);
    }
  }, []);

  useEffect(() => {
    loadActiveState();
    loadWeeklyData();
  }, [loadActiveState, loadWeeklyData]);

  // Live Timer tick
  useEffect(() => {
    let interval: any = null;
    if (activeSession) {
      const calculateSeconds = () => {
        const startMs = new Date(activeSession.clock_in_at).getTime();
        const nowMs = Date.now();
        const grossSecs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
        
        let breakSecs = (activeSession.total_break_minutes || 0) * 60;
        if (activeSession.status === 'ON_BREAK' && activeBreak) {
          const breakStartMs = new Date(activeBreak.start_at).getTime();
          breakSecs += Math.max(0, Math.floor((nowMs - breakStartMs) / 1000));
        }
        setElapsedSeconds(Math.max(0, grossSecs - breakSecs));
      };

      calculateSeconds();
      interval = setInterval(calculateSeconds, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession, activeBreak]);

  // Clock Actions
  const handleStartClockIn = async () => {
    try {
      const res = await apiFetch('/v1/hr/clock-in/start', {
        method: 'POST',
        body: JSON.stringify({ project_name: selectedProject || projectInput || undefined }),
      });
      if (res && res.session) {
        setActiveSession(res.session);
        loadWeeklyData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to clock in', { variant: 'error' });
    }
  };

  const handleToggleBreak = async () => {
    try {
      const res = await apiFetch('/v1/hr/clock-in/break', {
        method: 'POST',
      });
      if (res && res.session) {
        setActiveSession(res.session);
        setActiveBreak(res.breakStatus === 'ON_BREAK' ? (res.activeBreak || null) : null);
        loadActiveState();
        loadWeeklyData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to toggle break', { variant: 'error' });
    }
  };

  const handleStopClockOut = async () => {
    try {
      const res = await apiFetch('/v1/hr/clock-in/stop', {
        method: 'POST',
      });
      if (res) {
        setActiveSession(null);
        setActiveBreak(null);
        setElapsedSeconds(0);
        loadWeeklyData();
      }
    } catch (err: any) {
      showAlert(err.message || 'Failed to clock out', { variant: 'error' });
    }
  };

  const handleAddProject = () => {
    if (projectInput.trim()) {
      setSelectedProject(projectInput.trim());
      setProjectInput('');
    }
  };

  const handleSaveManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingManual(true);
    try {
      await apiFetch('/v1/hr/clock-in/manual', {
        method: 'POST',
        body: JSON.stringify({
          date: manualDate,
          clock_in: manualClockIn,
          clock_out: manualClockOut,
          break_minutes: Number(manualBreakMins) || 0,
          project_name: manualProject || undefined,
        }),
      });
      setShowManualModal(false);
      loadWeeklyData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add manual entry', { variant: 'error' });
    } finally {
      setSubmittingManual(false);
    }
  };

  // ── Timesheet approval ──
  const loadApprovalState = useCallback(async () => {
    try {
      const res = await apiFetch(`/v1/hr/clock-in/timesheet/status?period_start=${periodStart}`);
      setMyApproval(res?.approval || null);
    } catch { /* no submission yet */ }
    if (isManager) {
      try {
        const res = await apiFetch('/v1/hr/clock-in/timesheet/approvals?status=SUBMITTED');
        if (Array.isArray(res)) setApprovals(res);
      } catch { /* not permitted / none */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, periodStart]);

  useEffect(() => { loadApprovalState(); }, [loadApprovalState]);

  const handleSubmitForApproval = async () => {
    setSubmittingSheet(true);
    try {
      const res = await apiFetch('/v1/hr/clock-in/timesheet/submit', {
        method: 'POST',
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      });
      setMyApproval(res?.approval || null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to submit timesheet', { variant: 'error' });
    } finally {
      setSubmittingSheet(false);
    }
  };

  const submitReview = async (id: string, action: 'approve' | 'reject', note?: string) => {
    setReviewingId(id);
    try {
      await apiFetch(`/v1/hr/clock-in/timesheet/approvals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, note: note || undefined }),
      });
      // Drop the reviewed row from the pending queue.
      setApprovals(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      showAlert(err.message || `Failed to ${action} timesheet`, { variant: 'error' });
    } finally {
      setReviewingId(null);
    }
  };

  const handleReview = (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      setRejectTarget(id);
      setRejectNote('');
      return;
    }
    submitReview(id, 'approve');
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await apiDownload(
        `/v1/hr/clock-in/timesheet/export?from=${periodStart}&to=${periodEnd}`,
        `timesheet_${periodStart}_${periodEnd}.csv`,
      );
    } catch (err: any) {
      showAlert(err.message || 'Failed to export timesheet', { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Format stopwatch string (HH:MM:SS)
  const formatTimer = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Convert worked total minutes to "Xhrs Ymins"
  const formatHoursMins = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}hrs ${String(m).padStart(2, '0')}mins`;
  };

  // Generate days of current week (last 7 days)
  const generateWeeklyRows = (): DayTimesheetRow[] => {
    const rows: DayTimesheetRow[] = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      
      const daySessions = weeklySessions.filter(s => s.date === iso);
      const isToday = i === 0;

      let dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' });
      if (isToday) dateLabel = 'Today';

      if (daySessions.length === 0) {
        // No sessions recorded for this day — a genuine empty row. (There used
        // to be hardcoded Tue/Wed sample timelines here; a rest day must read
        // as a rest day, never as fabricated hours.)
        rows.push({
          dateIso: iso,
          dateLabel,
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
          clockInTime: '—',
          clockOutTime: '—',
          durationHours: '0h',
          blocks: [],
        });
      } else {
        const firstIn = daySessions[daySessions.length - 1];
        const lastOut = daySessions[0];
        
        let inTimeStr = '—';
        if (firstIn.clock_in_at) {
          const inD = new Date(firstIn.clock_in_at);
          inTimeStr = inD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        
        let outTimeStr = '—';
        if (lastOut.clock_out_at) {
          const outD = new Date(lastOut.clock_out_at);
          outTimeStr = outD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } else if (lastOut.status === 'ACTIVE' || lastOut.status === 'ON_BREAK') {
          outTimeStr = 'ETC';
        }

        let dayWorkedMins = 0;
        daySessions.forEach(s => { dayWorkedMins += (s.worked_minutes || 0); });
        const hrs = (dayWorkedMins / 60).toFixed(0);

        // Generate scale blocks
        const blocks: DailyTimelineBlock[] = [];
        const DAY_START_MINS = 9 * 60; // 09:00 AM
        const DAY_END_MINS = 18 * 60;  // 06:00 PM
        const RANGE_MINS = DAY_END_MINS - DAY_START_MINS;

        daySessions.forEach(sess => {
          const inDate = new Date(sess.clock_in_at);
          const inMins = inDate.getHours() * 60 + inDate.getMinutes();
          
          let outMins = DAY_END_MINS;
          if (sess.clock_out_at) {
            const outDate = new Date(sess.clock_out_at);
            outMins = outDate.getHours() * 60 + outDate.getMinutes();
          }

          const startRel = Math.max(0, inMins - DAY_START_MINS);
          const durRel = Math.max(15, outMins - inMins);

          const startPercent = Math.min(95, Math.max(0, (startRel / RANGE_MINS) * 100));
          const widthPercent = Math.min(100 - startPercent, Math.max(5, (durRel / RANGE_MINS) * 100));

          blocks.push({
            type: 'working',
            label: sess.project_name ? `Working (${sess.project_name})` : 'Working time',
            startTime: `${String(inDate.getHours()).padStart(2, '0')}:${String(inDate.getMinutes()).padStart(2, '0')}`,
            endTime: sess.clock_out_at ? `${String(new Date(sess.clock_out_at).getHours()).padStart(2, '0')}:${String(new Date(sess.clock_out_at).getMinutes()).padStart(2, '0')}` : 'Now',
            durationMinutes: sess.worked_minutes || durRel,
            startPercent,
            widthPercent,
          });

          if (sess.total_break_minutes > 0) {
            blocks.push({
              type: 'break',
              label: 'Break',
              startTime: '13:00',
              endTime: '14:00',
              durationMinutes: sess.total_break_minutes,
              startPercent: Math.min(90, startPercent + Math.floor(widthPercent / 2)),
              widthPercent: Math.min(20, Math.max(8, (sess.total_break_minutes / RANGE_MINS) * 100)),
            });
          }
        });

        rows.push({
          dateIso: iso,
          dateLabel,
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
          clockInTime: inTimeStr,
          clockOutTime: outTimeStr,
          durationHours: `${hrs}h`,
          blocks,
        });
      }
    }

    return rows;
  };

  const dayRows = generateWeeklyRows();

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* Shared Standard Page Header */}
      <SharedPageHeader
        crumbs={['NexusHR', 'Clock-in']}
        titlePlain="Clock-in & Weekly"
        titleEm="timesheets"
        subtitle="Live attendance tracking, stopwatch timer, and weekly hours visualizer"
        actions={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: 'var(--ink2)' }}>
              <Icon name="clock" size={14} color="var(--teal)" />
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--navy)' }}>
                {formatTimer(elapsedSeconds)}
              </span>
            </div>

            {/* Weekly timesheet approval status — reflects only what the API returns. */}
            {myApproval && (() => {
              const map = {
                SUBMITTED: { bg: 'var(--gold-l)', fg: 'var(--gold)', icon: 'clock' as IconName, label: 'Awaiting approval' },
                APPROVED:  { bg: 'var(--green-l)', fg: 'var(--green)', icon: 'checkCircle' as IconName, label: 'Timesheet approved' },
                REJECTED:  { bg: 'var(--red-l)', fg: 'var(--red)', icon: 'alertCircle' as IconName, label: 'Rejected' },
              }[myApproval.status];
              return (
                <span title={myApproval.note || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: map.bg, color: map.fg, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 600 }}>
                  <Icon name={map.icon} size={13} /> {map.label}
                </span>
              );
            })()}

            <button type="button" className="btn btn-secondary" onClick={handleExportCsv} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="download" size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>

            {(!myApproval || myApproval.status === 'REJECTED') && (
              <button type="button" className="btn btn-primary" onClick={handleSubmitForApproval} disabled={submittingSheet} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="send" size={14} /> {submittingSheet ? 'Submitting…' : (myApproval?.status === 'REJECTED' ? 'Resubmit' : 'Submit for approval')}
              </button>
            )}

            <button type="button" className="btn btn-secondary" onClick={() => setShowManualModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={14} /> Entry log
            </button>
          </div>
        }
      />

      {/* User Welcome & Date Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PersonAvatar userId={user?.id} name={userProfile?.name || user?.name || 'User'} size={44} style={{ boxShadow: 'var(--elev-sm)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Welcome, {userProfile?.name || user?.name || 'there'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {userProfile?.role || user?.role || 'Team member'} · {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
            <SelectTrigger style={{ minHeight: 32, fontSize: 13, width: 'auto' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="14days">Last 14 days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--white)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
            <Icon name="calendar" size={14} color="var(--ink3)" />
            <span>
              {new Date(periodStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} – {new Date(periodEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Manager: timesheets awaiting approval (real submissions only) */}
      {isManager && approvals.length > 0 && (
        <SectionCard title={`Timesheets awaiting your approval (${approvals.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {approvals.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-sunken)', flexWrap: 'wrap' }}>
                <PersonAvatar userId={a.user_id} name={a.employee_name || 'Employee'} size={34} />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{a.employee_name || 'Employee'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    {new Date(a.period_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} – {new Date(a.period_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                    {' · '}{(a.total_worked_minutes / 60).toFixed(1)}h · {a.session_count} session{a.session_count === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => handleReview(a.id, 'reject')} disabled={reviewingId === a.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--red)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="x" size={13} /> Reject
                  </button>
                  <button type="button" onClick={() => handleReview(a.id, 'approve')} disabled={reviewingId === a.id} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="check" size={13} /> {reviewingId === a.id ? '…' : 'Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Clock-in control, weekly target, and worked-hours summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(310px, 100%), 1fr))', gap: 16 }}>
        
        {/* Widget 1: Clock-in Control Widget */}
        <SectionCard
          title="Clock-in"
          action={activeSession ? (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: activeSession.status === 'ON_BREAK' ? 'var(--gold-l)' : 'var(--teal-l)', color: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {activeSession.status === 'ON_BREAK' ? 'ON BREAK' : 'ONGOING'}
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: 'var(--card-sunken)', color: 'var(--ink3)' }}>
                NOT CLOCKED IN
              </span>
            )}
        >
          {/* Large Live Stopwatch Counter */}
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
              {activeSession ? (activeSession.status === 'ON_BREAK' ? 'PAUSED' : 'ONGOING') : 'IDLE'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)', color: activeSession ? 'var(--navy)' : 'var(--ink3)', letterSpacing: '-1px' }}>
              {formatTimer(elapsedSeconds)}
            </div>

            {/* Break & Clock-out Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              {activeSession ? (
                <>
                  <button type="button" onClick={handleToggleBreak} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border)', background: activeSession.status === 'ON_BREAK' ? 'var(--gold-l)' : 'var(--card-sunken)', color: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : 'var(--ink2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : 'var(--ink3)' }}></span>
                    {activeSession.status === 'ON_BREAK' ? 'Resume Work' : 'Break'}
                  </button>
                  <button type="button" onClick={handleStopClockOut} style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}></span>
                    Clock-out
                  </button>
                </>
              ) : (
                <button type="button" onClick={handleStartClockIn} style={{ padding: '10px 28px', borderRadius: 20, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="check" size={16} />
                  Clock-in Now
                </button>
              )}
            </div>
          </div>

          {/* Project Tagging Selector */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Project (Optional)</span>
              <Icon name="info" size={12} color="var(--ink3)" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={selectedProject || projectInput}
                onChange={e => { setProjectInput(e.target.value); setSelectedProject(e.target.value); }}
                placeholder="Add projects you are working on..."
                style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--white)', color: 'var(--ink)' }}
              />
              {projectInput && (
                <button type="button" onClick={handleAddProject} style={{ padding: '7px 12px', borderRadius: 8, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  +
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Widget 2: Weekly Target Widget — a fixed full-time reference line, not
             this employee's own tracked data (no contracted-hours field exists
             anywhere in the schema to pull a real per-employee figure from). Framed
             as a standard benchmark, and compared against the one number here that
             *is* real: workedMinutesTotal. */}
        <SectionCard title="Weekly target">
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 4 }}>Standard full-time benchmark</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', marginBottom: 14 }}>
              40<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink3)' }}>hrs</span> / 5<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink3)' }}>days</span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 4 }}>Progress this week</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              {Math.min(100, Math.round((workedMinutesTotal / 2400) * 100))}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink3)' }}>% of target</span>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 14 }}>
            <Icon name="info" size={13} color="var(--ink3)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>A general reference, not this employee's personal contracted hours — no contract-hours record exists yet to show that.</span>
          </div>
        </SectionCard>

        {/* Widget 3: Worked Hours Widget */}
        <SectionCard title="Worked hours">
          <div>
            <div style={{ background: 'var(--card-sunken)', borderRadius: 10, padding: '16px 18px', textAlign: 'center', border: '1px solid var(--border)', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Total hours (Until today)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>
                {formatHoursMins(workedMinutesTotal)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <Icon name="info" size={13} color="var(--ink3)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>The total time an employee worked, including break time.</span>
          </div>
        </SectionCard>

      </div>

      {/* Main Section: My Timesheets Timeline */}
      <SectionCard
        title="My timesheets"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {/* Category Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ink2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--teal)' }}></span>
                <span>Working time</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--blue)' }}></span>
                <span>Break</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--gold)' }}></span>
                <span>Overtime</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)' }}></span>
                <span>Late</span>
              </div>
            </div>

            <button type="button" onClick={() => setShowManualModal(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', fontSize: 12, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              + Entry log
            </button>
          </div>
        }
      >
        {/* Timeline Table Visualization */}
        <div style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 10 }}>
          
          {/* Time Ticks Header Scale */}
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 140, paddingRight: 80, fontSize: 11, color: 'var(--ink3)', borderBottom: '1px dashed var(--border)', paddingBottom: 8 }}>
            <div style={{ flex: 1, textAlign: 'left' }}>09:00</div>
            <div style={{ flex: 1, textAlign: 'center' }}>11:00</div>
            <div style={{ flex: 1, textAlign: 'center' }}>13:00</div>
            <div style={{ flex: 1, textAlign: 'center' }}>15:00</div>
            <div style={{ flex: 1, textAlign: 'center' }}>16:00</div>
            <div style={{ flex: 1, textAlign: 'center' }}>17:00</div>
            <div style={{ flex: 1, textAlign: 'right' }}>18:00</div>
          </div>

          {/* Timeline Rows */}
          {dayRows.map((row) => (
            <div key={row.dateIso} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              
              {/* Row Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                <span>{row.dateLabel}</span>
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>Duration: {row.durationHours}</span>
              </div>

              {/* Row Visualizer Track */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                
                {/* Left Clock In Badge */}
                <div style={{ width: 120, fontSize: 11, color: 'var(--ink3)', flexShrink: 0 }}>
                  <span style={{ color: 'var(--ink3)' }}>Clock-in</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{row.clockInTime}</div>
                </div>

                {/* Center Timeline Segment Bar */}
                <div style={{ flex: 1, height: 16, background: 'var(--card-sunken)', borderRadius: 8, position: 'relative', overflow: 'hidden', display: 'flex' }}>
                  {row.blocks.map((b, idx) => {
                    const bg = b.type === 'working' ? 'var(--teal)' : b.type === 'break' ? 'var(--blue)' : b.type === 'overtime' ? 'var(--gold)' : 'var(--red)';
                    return (
                      <div
                        key={idx}
                        title={`${b.label}: ${b.startTime} - ${b.endTime}`}
                        style={{
                          height: '100%',
                          width: `${b.widthPercent}%`,
                          marginLeft: idx === 0 ? `${b.startPercent}%` : 0,
                          background: bg,
                          borderRadius: 4,
                          marginRight: 2,
                          transition: 'opacity 0.2s',
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </div>

                {/* Right Clock Out Badge */}
                <div style={{ width: 80, fontSize: 11, color: 'var(--ink3)', textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ color: 'var(--ink3)' }}>Clock-out</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{row.clockOutTime}</div>
                </div>

              </div>

            </div>
          ))}

        </div>

      </SectionCard>

      {/* Manual Entry Log Dialog */}
      <Dialog open={showManualModal} onOpenChange={setShowManualModal}>
        <DialogContent className="sm:max-w-110">
          <DialogHeader><DialogTitle>Log Manual Time Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveManualEntry} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Date</label>
              <DatePicker
                date={parseDateOnly(manualDate)}
                onChange={d => setManualDate(toDateOnlyString(d))}
                placeholder="Select date"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Clock In Time</label>
                <input
                  type="time"
                  value={manualClockIn}
                  onChange={e => setManualClockIn(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Clock Out Time</label>
                <input
                  type="time"
                  value={manualClockOut}
                  onChange={e => setManualClockOut(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Break (Minutes)</label>
              <input
                type="number"
                value={manualBreakMins}
                onChange={e => setManualBreakMins(e.target.value)}
                min="0"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Project / Activity Name</label>
              <input
                type="text"
                value={manualProject}
                onChange={e => setManualProject(e.target.value)}
                placeholder="e.g. Mobile App Redesign"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowManualModal(false)}>Cancel</Button>
              <Button type="submit" disabled={submittingManual}>
                {submittingManual ? 'Saving…' : 'Save Entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Timesheet Dialog — replaces a window.prompt() for the reason. */}
      <Dialog open={!!rejectTarget} onOpenChange={o => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-100">
          <DialogHeader><DialogTitle>Reject timesheet</DialogTitle></DialogHeader>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Reason (optional)</label>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Let them know what needs correcting…"
              rows={3}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', color: 'var(--ink)', boxSizing: 'border-box' }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              style={{ background: 'var(--red)', color: '#fff' }}
              disabled={reviewingId === rejectTarget}
              onClick={() => {
                if (rejectTarget) submitReview(rejectTarget, 'reject', rejectNote);
                setRejectTarget(null);
              }}
            >
              {reviewingId === rejectTarget ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
