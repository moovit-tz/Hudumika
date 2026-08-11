import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon, IconName } from '../components/Icon.js';
import { PageHeader as SharedPageHeader } from '../components/PageHeader.js';

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
      alert(err.message || 'Failed to clock in');
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
      alert(err.message || 'Failed to toggle break');
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
      alert(err.message || 'Failed to clock out');
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
      alert(err.message || 'Failed to add manual entry');
    } finally {
      setSubmittingManual(false);
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
    <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* Shared Standard Page Header */}
      <SharedPageHeader
        crumbs={['NexusHR', 'Clock-in']}
        titlePlain="Clock-in & Weekly"
        titleEm="timesheets"
        subtitle="Live attendance tracking, stopwatch timer, and weekly hours visualizer"
        actions={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: 'var(--ink2)' }}>
              <Icon name="clock" size={14} color="#7c3aed" />
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--navy)' }}>
                {formatTimer(elapsedSeconds)}
              </span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setShowManualModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={14} /> Entry log
            </button>
          </div>
        }
      />

      {/* User Welcome & Date Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, boxShadow: '0 2px 8px rgba(124,58,237,0.2)' }}>
            {(userProfile?.name || 'User').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Welcome, {userProfile?.name || 'James Brown'} 👋
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {userProfile?.role || 'HR Manager'} · Feb 11 2025, 11:44 am
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={dateRangeFilter} onChange={e => setDateRangeFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--ink)', fontFamily: 'var(--font)' }}>
            <option value="7days">Last 7 days</option>
            <option value="14days">Last 14 days</option>
            <option value="month">This Month</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
            <Icon name="calendar" size={14} color="var(--ink3)" />
            <span>Feb 04 - Feb 11 2025</span>
          </div>
        </div>
      </div>

      {/* Top 3 Widget Cards Row (Matching Image 1 Design) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16 }}>
        
        {/* Widget 1: Clock-in Control Widget */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
              <Icon name="clock" size={16} color="#7c3aed" />
              <span>Clock-in</span>
            </div>
            {activeSession ? (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: activeSession.status === 'ON_BREAK' ? 'var(--gold-l)' : 'rgba(124,58,237,0.12)', color: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {activeSession.status === 'ON_BREAK' ? 'ON BREAK' : 'ONGOING'}
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: 'var(--bg)', color: 'var(--ink3)' }}>
                NOT CLOCKED IN
              </span>
            )}
          </div>

          {/* Large Live Stopwatch Counter */}
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
              {activeSession ? (activeSession.status === 'ON_BREAK' ? 'PAUSED' : 'ONGOING') : 'IDLE'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)', color: activeSession ? '#0f172a' : 'var(--ink3)', letterSpacing: '-1px' }}>
              {formatTimer(elapsedSeconds)}
            </div>

            {/* Break & Clock-out Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              {activeSession ? (
                <>
                  <button type="button" onClick={handleToggleBreak} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border)', background: activeSession.status === 'ON_BREAK' ? 'var(--gold-l)' : '#f1f5f9', color: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeSession.status === 'ON_BREAK' ? 'var(--gold)' : '#64748b' }}></span>
                    {activeSession.status === 'ON_BREAK' ? 'Resume Work' : 'Break'}
                  </button>
                  <button type="button" onClick={handleStopClockOut} style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(239,68,68,0.3)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}></span>
                    Clock-out
                  </button>
                </>
              ) : (
                <button type="button" onClick={handleStartClockIn} style={{ padding: '10px 28px', borderRadius: 20, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 3px 10px rgba(124,58,237,0.35)' }}>
                  <Icon name="check" size={16} color="#fff" />
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
                style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: '#fff', color: 'var(--ink)' }}
              />
              {projectInput && (
                <button type="button" onClick={handleAddProject} style={{ padding: '7px 12px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  +
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Widget 2: Planned Hours Widget */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                <Icon name="target" size={16} color="#0891b2" />
                <span>Planned hours</span>
              </div>
              <button type="button" style={{ background: 'none', border: 'none', color: '#0891b2', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Details <Icon name="externalLink" size={12} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', marginBottom: 4 }}>Total hours (Weekly)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', marginBottom: 14 }}>
              40<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink3)' }}>hrs </span>00<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink3)' }}>mins</span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 4 }}>Total days on week</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>
              5<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink3)' }}>days</span>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 14 }}>
            <Icon name="info" size={13} color="var(--ink3)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Each employee should complete their total weekly planned hours.</span>
          </div>
        </div>

        {/* Widget 3: Worked Hours Widget */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 16 }}>
              <Icon name="activity" size={16} color="#10b981" />
              <span>Worked hours</span>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px 18px', textAlign: 'center', border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>Total hours (Until today)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>
                {formatHoursMins(workedMinutesTotal || 1932)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'flex-start', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <Icon name="info" size={13} color="var(--ink3)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>The total time an employee worked, including break time.</span>
          </div>
        </div>

      </div>

      {/* Main Section: My Timesheets Timeline */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        
        {/* Header & Legend Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>
            <Icon name="clock" size={18} color="#7c3aed" />
            <span>My timesheets</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {/* Category Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ink2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#7c3aed' }}></span>
                <span>Working time</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#06b6d4' }}></span>
                <span>Break</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }}></span>
                <span>Overtime</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }}></span>
                <span>Late</span>
              </div>
            </div>

            <button type="button" onClick={() => setShowManualModal(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              + Entry log
            </button>
          </div>
        </div>

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
                <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 8, position: 'relative', overflow: 'hidden', display: 'flex' }}>
                  {row.blocks.map((b, idx) => {
                    const bg = b.type === 'working' ? '#7c3aed' : b.type === 'break' ? '#06b6d4' : b.type === 'overtime' ? '#f59e0b' : '#ef4444';
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

      </div>

      {/* Manual Entry Log Modal */}
      {showManualModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>+ Log Manual Time Entry</div>
              <button type="button" onClick={() => setShowManualModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualEntry} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
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
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Clock Out Time</label>
                  <input
                    type="time"
                    value={manualClockOut}
                    onChange={e => setManualClockOut(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
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
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 4, display: 'block' }}>Project / Activity Name</label>
                <input
                  type="text"
                  value={manualProject}
                  onChange={e => setManualProject(e.target.value)}
                  placeholder="e.g. Mobile App Redesign"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingManual}>
                  {submittingManual ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
