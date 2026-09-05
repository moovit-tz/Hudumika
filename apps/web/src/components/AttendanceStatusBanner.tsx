import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import './AttendanceStatusBanner.css';

interface ClockOutSummary {
  worked_minutes: number;
  tasks_completed_count: number;
  tasks_completed: { id: string; title: string; completed_at: string }[];
  is_short_shift?: boolean;
}
interface ClockOutPreview {
  worked_minutes: number;
  tasks_completed_count: number;
  tasks_completed: { id: string; title: string; completed_at: string }[];
}

/**
 * AttendanceStatusBanner — Compact personal identity + live session status hero banner.
 *
 * Clock-in state is deliberately NOT this component's own — it reads
 * ClockInContext, the exact same shared state the header's own CheckInWidget
 * (`components/CheckInWidget.tsx`) publishes to. hr.routes.ts bridges
 * hr_clock_sessions (this card's own backing table) and hr_time_entries (the
 * header's) bidirectionally at the API layer already; this is the frontend
 * half of that — one poll, one truth, so clocking in from the header and
 * clocking in from this card can never show two different answers on screen
 * at once. "Clock In Now" doesn't call the clock-in API directly at all: it
 * opens the SAME task/shipment picker the header uses (ctxTriggerOpen), so
 * there is exactly one place in the whole platform that decides what
 * "select a task and start the clock" looks like.
 */
export function AttendanceStatusBanner() {
  const { user } = useAuth();
  const { isCheckedIn, currentEntry, triggerOpen: ctxTriggerOpen, setCheckedIn: ctxSetCheckedIn } = useClockIn();
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [clockOutSummary, setClockOutSummary] = useState<ClockOutSummary | null>(null);

  // Pre-clock-out confirmation — worked time + tasks closed so far, fetched
  // live (not guessed client-side) the moment "Clock Out" is pressed, so the
  // number being confirmed is the real one the server would also compute.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState<ClockOutPreview | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [clockingOut, setClockingOut] = useState(false);

  const userCity = user?.profile?.city || null;
  const timesheetExempt = !!user?.profile?.timesheet_exempt;

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [weather, setWeather] = useState<{ temp: number; desc: string; city: string; humidDesc: string } | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=-6.8235&longitude=39.2695&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Africa%2FDar_es_Salaam'
        );
        if (!res.ok) throw new Error('weather fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const cur = data.current;
        const temp = Math.round(cur?.temperature_2m ?? 26);
        const code = cur?.weather_code ?? 2;
        const humidity = cur?.relative_humidity_2m ?? 75;

        let desc = 'Partly Cloudy';
        if (code === 0) desc = 'Clear sky';
        else if (code === 1 || code === 2) desc = 'Partly Cloudy';
        else if (code === 3) desc = 'Overcast';
        else if (code >= 51 && code <= 67) desc = 'Light Rain';
        else if (code >= 80 && code <= 99) desc = 'Rain Showers';

        const humidDesc = humidity > 70 ? 'humid' : 'comfortable';
        setWeather({ temp, desc, city: 'Dar es Salaam', humidDesc });
      } catch {
        if (cancelled) return;
        setWeather({ temp: 26, desc: 'Overcast', city: 'Dar es Salaam', humidDesc: 'humid' });
      }
    }

    loadWeather();
    return () => { cancelled = true; };
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // The timer's own start time comes from the shared context's entry, not a
  // fetch this component owns — whichever surface (header or this card)
  // actually opened the session, both read the same started_at.
  useEffect(() => {
    if (!isCheckedIn || !currentEntry?.started_at) { setElapsedSecs(0); return; }
    const start = new Date(currentEntry.started_at).getTime();
    const tick = () => setElapsedSecs(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isCheckedIn, currentEntry]);

  // "Clock In Now" opens the same task/shipment picker the header's clock
  // button does — the one place in the platform that decides what
  // "select a task and start the clock" looks like, rather than this card
  // clocking in against a hardcoded placeholder task name of its own.
  const handleClockIn = () => ctxTriggerOpen();

  const openClockOutConfirm = async () => {
    setConfirmOpen(true);
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const preview = await apiFetch('/v1/hr/clock-in/preview');
      setConfirmPreview(preview);
    } catch (err: any) {
      setConfirmError(err?.message ?? 'Could not load your session summary.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const confirmClockOut = async () => {
    setClockingOut(true);
    try {
      const res = await apiFetch('/v1/hr/clock-in/stop', { method: 'POST' });
      setConfirmOpen(false);
      setConfirmPreview(null);
      // Instant sync — the header's CheckInWidget reads this same context,
      // so it flips to idle immediately rather than waiting on its own poll.
      ctxSetCheckedIn(false);
      if (res?.summary) setClockOutSummary(res.summary);
    } catch (err: any) {
      setConfirmError(err?.message ?? 'Clock-out failed. Try again.');
    } finally {
      setClockingOut(false);
    }
  };

  const kpiLink = user?.role && MGMT_ROLES.includes(user.role as any) ? '/nexushr/performance' : '/nexushr/me';

  const formatSummaryDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatTimer = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <>
      <div className="asb-card">
        {/* Three columns: identity (name + id), centred welcome/time/weather/
            location, and the session box — collapses to one stacked column
            on mobile (see the CSS media query). */}
        <div className="asb-main-row">
          {/* Left column: avatar + name, id below it */}
          <div className="asb-identity">
            <div className="asb-avatar-wrap">
              <PersonAvatar
                name={user?.name || 'Employee'}
                size={48}
                userId={user?.id}
                statusRingColor="var(--asb-bg)"
                style={{
                  boxShadow: '0 0 0 1.5px var(--border, #e2e8f0)',
                }}
              />
            </div>

            <div className="asb-info-col">
              <h1 className="asb-name-title">{user?.name || 'Valued Team Member'}</h1>
              <span className="asb-id-label">ID: EMP-{user?.id?.slice(0, 8).toUpperCase() ?? '2026'}</span>
            </div>
          </div>

          {/* Centre column: greeting + time/weather/location */}
          <div className="asb-center-col">
            <p className="asb-greeting">Welcome back,</p>
            <div className="asb-weather-time">
              <span className="asb-time-badge">{timeStr}</span>
              {weather && (
                <>
                  <span className="asb-dot-sep">·</span>
                  <span className="asb-weather-item">{weather.desc}, {weather.temp}°C</span>
                  <span className="asb-dot-sep">·</span>
                  <span className="asb-weather-item">{weather.humidDesc}</span>
                </>
              )}
              {userCity && (
                <>
                  <span className="asb-dot-sep">·</span>
                  <span className="asb-weather-item">{userCity}</span>
                </>
              )}
            </div>
          </div>

          {/* Right Block: Live Clock-In Action Control Box */}
          {timesheetExempt ? (
            <div className="asb-session-box">
              <div className="asb-session-info">
                <div className="asb-session-label inactive">
                  <span>Not tracked by timesheet</span>
                </div>
                <div className="asb-session-sub">Your account isn't measured by clock-in hours.</div>
              </div>
            </div>
          ) : (
            <div className="asb-session-box">
              <div className="asb-session-info">
                <div className={`asb-session-label ${isCheckedIn ? 'active' : 'inactive'}`}>
                  <span className="asb-pulse-dot" />
                  <span>{isCheckedIn ? 'Active Session Counter' : 'Attendance Status'}</span>
                </div>
                <div className={`asb-session-timer ${isCheckedIn ? 'is-active' : 'is-off'}`}>
                  {isCheckedIn ? formatTimer(elapsedSecs) : 'CLOCKED OUT'}
                </div>
                <div className="asb-session-sub">
                  {isCheckedIn
                    ? (currentEntry?.task_name ? `Working on: ${currentEntry.task_name}` : 'Started your session')
                    : 'Ready to begin?'}
                </div>
              </div>

              <Button
                type="button"
                onClick={isCheckedIn ? openClockOutConfirm : handleClockIn}
                className={`asb-action-btn ${isCheckedIn ? 'clock-out' : 'clock-in'}`}
              >
                <Icon name="clock" size={15} />
                <span>{isCheckedIn ? 'Clock Out' : 'Clock In Now'}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Pre-clock-out confirmation — worked time + tasks so far, with a
          real way out (Cancel) rather than an irreversible click. */}
      <Dialog open={confirmOpen} onOpenChange={o => !o && !clockingOut && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock out now?</DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {confirmLoading ? (
              <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>Loading your session…</p>
            ) : confirmError ? (
              <p style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{confirmError}</p>
            ) : confirmPreview && (
              <>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 4 }}>Time so far</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{formatSummaryDuration(confirmPreview.worked_minutes)}</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 4 }}>Tasks closed</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{confirmPreview.tasks_completed_count}</div>
                  </div>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: 0 }}>This is what gets recorded on your timesheet if you clock out now.</p>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Link to={kpiLink} onClick={() => setConfirmOpen(false)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                View timesheet →
              </Link>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={clockingOut}>
                  Cancel
                </Button>
                <Button type="button" onClick={confirmClockOut} disabled={confirmLoading || clockingOut} style={{ background: 'var(--red)', color: 'hsl(var(--red-foreground))', border: 'none' }}>
                  {clockingOut ? 'Clocking out…' : 'Confirm Clock Out'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clock Out Summary Dialog */}
      <Dialog open={!!clockOutSummary} onOpenChange={o => !o && setClockOutSummary(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Session complete</DialogTitle>
          </DialogHeader>
          {clockOutSummary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {clockOutSummary.is_short_shift && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--gold-l, #fffbeb)', border: '1px solid var(--gold-m, #fde68a)' }}>
                  <Icon name="alertCircle" size={15} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>That was a very short session — if this was a mis-click, you can clock back in.</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 4 }}>Time worked</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{formatSummaryDuration(clockOutSummary.worked_minutes)}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginBottom: 4 }}>Tasks closed</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{clockOutSummary.tasks_completed_count}</div>
                </div>
              </div>

              {clockOutSummary.tasks_completed_count > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {clockOutSummary.tasks_completed.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                      <Icon name="check" size={14} strokeWidth={2.5} color="var(--green)" />
                      <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink3)', flexShrink: 0 }}>{new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>No tasks were marked done during this session.</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <Link to={kpiLink} onClick={() => setClockOutSummary(null)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                  View HR insights →
                </Link>
                <Button type="button" onClick={() => setClockOutSummary(null)} style={{ height: 38, padding: '0 18px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AttendanceStatusBanner;
