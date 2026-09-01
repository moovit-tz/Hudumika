import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
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
}

/**
 * AttendanceStatusBanner — Compact personal identity + live session status hero banner.
 * Self-contained: manages active clock-in state, real-time clock, Open-Meteo weather
 * info, and clock-out summary flow. Designed for light background in light mode,
 * dark background in dark mode, and seamless responsiveness across viewports.
 */
export function AttendanceStatusBanner() {
  const { user } = useAuth();
  const [activeClockIn, setActiveClockIn] = useState<any>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [clocking, setClocking] = useState(false);
  const [clockOutSummary, setClockOutSummary] = useState<ClockOutSummary | null>(null);

  const ROLE_LABEL: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', TENANT_ADMIN: 'Admin',
    MANAGER: 'Manager', FINANCE: 'Finance Officer',
    SALES: 'Sales Officer', SENIOR: 'Senior Officer', JUNIOR: 'Junior Officer',
    OFFICER: 'Officer', CUSTOMER: 'Customer',
  };
  const orgPosition = user?.profile?.job_title || (user?.role ? ROLE_LABEL[user.role] : null) || null;
  const userCity = user?.profile?.city || null;

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

  const loadData = useCallback(async () => {
    try {
      const act = await apiFetch('/v1/hr/clock-in/active').catch(() => ({ active: false }));
      const session = act?.active ? act.session : null;
      setActiveClockIn(session);
      if (session?.clock_in_at) {
        const start = new Date(session.clock_in_at).getTime();
        setElapsedSecs(Math.max(0, Math.floor((Date.now() - start) / 1000)));
      }
    } catch (err) {
      console.error('[AttendanceStatusBanner] Load error:', err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeClockIn?.clock_in_at) return;
    const interval = setInterval(() => {
      const start = new Date(activeClockIn.clock_in_at).getTime();
      setElapsedSecs(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeClockIn]);

  const handleToggleClockIn = async () => {
    setClocking(true);
    try {
      if (activeClockIn) {
        const res = await apiFetch('/v1/hr/clock-in/stop', { method: 'POST' });
        if (res?.summary) setClockOutSummary(res.summary);
      } else {
        await apiFetch('/v1/hr/clock-in/start', { method: 'POST', body: JSON.stringify({ project_name: 'Clocked in via ESS Portal' }) });
      }
      loadData();
    } catch (err: any) {
      alert(err?.message ?? 'Clock-in action failed.');
    } finally {
      setClocking(false);
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
        {/* Top Bar: Welcome Greeting + Time & Weather (without repeating city name) */}
        <div className="asb-top-bar">
          <p className="asb-greeting">
            <span>Welcome back.</span>
          </p>
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

        {/* Main Row: User Identity on Left, Active Session Box on Right */}
        <div className="asb-main-row">
          {/* Left Block: Identity */}
          <div className="asb-identity">
            <div className="asb-avatar-wrap">
              <PersonAvatar
                name={user?.name || 'Employee'}
                size={46}
                userId={user?.id}
                statusRingColor="var(--asb-bg)"
                style={{
                  boxShadow: '0 0 0 1.5px var(--border, #e2e8f0)',
                }}
              />
            </div>

            <div className="asb-info-col">
              <h1 className="asb-name-title">
                {user?.name || 'Valued Team Member'}
                {orgPosition && (
                  <>
                    {', '}
                    <em className="asb-position-em">
                      {orgPosition}
                    </em>
                  </>
                )}
              </h1>
              <div className="asb-badges-row">
                <span className="asb-tag-badge">
                  ESS WORKSPACE
                </span>
                <span className="asb-id-label">ID: EMP-{user?.id?.slice(0, 8).toUpperCase() ?? '2026'}</span>
              </div>
            </div>
          </div>

          {/* Right Block: Live Clock-In Action Control Box */}
          <div className="asb-session-box">
            <div className="asb-session-info">
              <div className={`asb-session-label ${activeClockIn ? 'active' : 'inactive'}`}>
                <span className="asb-pulse-dot" />
                <span>{activeClockIn ? 'Active Session Counter' : 'Attendance Status'}</span>
              </div>
              <div className={`asb-session-timer ${activeClockIn ? 'is-active' : 'is-off'}`}>
                {activeClockIn ? formatTimer(elapsedSecs) : 'CLOCKED OUT'}
              </div>
              <div className="asb-session-sub">
                {activeClockIn
                  ? `Started at ${new Date(activeClockIn.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Ready to begin?'}
              </div>
            </div>

            <Button
              type="button"
              onClick={handleToggleClockIn}
              disabled={clocking}
              className={`asb-action-btn ${activeClockIn ? 'clock-out' : 'clock-in'}`}
            >
              <Icon name="clock" size={15} />
              <span>{clocking ? 'Processing…' : activeClockIn ? 'Clock Out' : 'Clock In Now'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Clock Out Summary Dialog */}
      <Dialog open={!!clockOutSummary} onOpenChange={o => !o && setClockOutSummary(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Session complete</DialogTitle>
          </DialogHeader>
          {clockOutSummary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--bg)' }}>
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
                <Button type="button" onClick={() => setClockOutSummary(null)} style={{ height: 38, padding: '0 18px', fontSize: 13, fontWeight: 700, borderRadius: 9, background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', cursor: 'pointer' }}>
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
