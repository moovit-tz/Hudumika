import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { Button } from './ui/button.js';
import { PersonAvatar } from './PersonAvatar.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.js';
import { readDesignTokens } from '../hooks/useDesignSystem.js';
import { enforceContrastFloor, hexToHslTriplet, pickForegroundHsl } from '../lib/color.js';
import { MGMT_ROLES } from '../lib/permissions.js';

interface ClockOutSummary {
  worked_minutes: number;
  tasks_completed_count: number;
  tasks_completed: { id: string; title: string; completed_at: string }[];
}

/**
 * The personal identity + clock-in hero banner — moved here from NexusHR's
 * MyHub.tsx (the ESS "My HR" dashboard) onto the Advanced workspace hub, at
 * the user's own request. Self-contained: it owns its own clock-in state
 * rather than depending on MyHub's, since it now renders on a page that
 * knows nothing about payslips/leave/documents.
 *
 * The greeting/time/weather row was WorkspaceHome's own standalone
 * "Welcome Bar" above this card — the user asked for it to move inside
 * this card instead of sitting as a separate strip above it, so that state
 * (and its Open-Meteo fetch) moved here too rather than staying split
 * across two components.
 */
export function AttendanceStatusBanner() {
  const { user } = useAuth();
  const [activeClockIn, setActiveClockIn] = useState<any>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [clocking, setClocking] = useState(false);
  const [clockOutSummary, setClockOutSummary] = useState<ClockOutSummary | null>(null);

  // Position and location both read straight off user.profile — the exact
  // same field UserProfile.tsx's own "Personal Info" tab saves through
  // PATCH /v1/auth/me (job_title / city). No separate fetch: useAuth()'s
  // user object already updates live the moment a save there completes
  // (updateUser(res.user)), so this can't drift the way it did when
  // position was pulled from a different, admin-managed org-chart node
  // and location was a literal hardcoded string ("Dar es Salaam HQ") that
  // wasn't wired to anything at all — neither reflected an edit made
  // anywhere in the product. ROLE_LABEL mirrors UserProfile.tsx's own
  // fallback (job_title defaults to a label derived from the account's
  // role when nothing's been typed in) so the two pages agree by default.
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

        const humidDesc = humidity > 70 ? 'humid in Dar es Salaam' : 'comfortable in Dar es Salaam';
        setWeather({ temp, desc, city: 'Dar es Salaam', humidDesc });
      } catch {
        if (cancelled) return;
        setWeather({ temp: 26, desc: 'Overcast', city: 'Dar es Salaam', humidDesc: 'humid in Dar es Salaam' });
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

  // This banner renders on WorkspaceHome — the app launcher itself, outside
  // any WorkspaceApp wrapper — so the shared --primary/--primary-foreground
  // tokens are all it has. Those are deliberately lightened ~45% toward white
  // for dark mode (useDesignSystem.ts's darkTeal) so *text* stays legible on
  // a near-black page; for a brand hex that starts out low-saturation, that
  // same lightening desaturates it almost to flat grey (H 222° S 7% L 53% on
  // this tenant's colour), which is exactly right for a caption but wrong for
  // a full-bleed hero fill — every other dark card on this page reads as a
  // deliberate dark navy, and this one alone read as a washed-out grey box.
  // A solid card fill doesn't have that same "text on a dark page" legibility
  // problem the lightening step exists for, so this recomputes its own
  // surface straight off the un-lightened brand hex (same math WorkspaceApp
  // uses per-app, minus that one dark-mode step) — rich in both themes,
  // exactly like the version of this card that already renders correctly
  // inside NexusHR's own WorkspaceApp wrapper.
  const brandHex = readDesignTokens().brand.primary;
  const surface = enforceContrastFloor(brandHex);
  const surfaceHsl = hexToHslTriplet(surface.hex);
  const fgHsl = pickForegroundHsl(surface.hex);
  const fg = (alpha?: number) => alpha == null ? `hsl(${fgHsl})` : `hsl(${fgHsl} / ${alpha})`;

  return (
    <>
    <div
      style={{
        background: `hsl(${surfaceHsl})`,
        borderRadius: 20,
        padding: '28px 32px',
        color: fg(),
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--elev-lg)',
        border: `1px solid ${fg(0.1)}`,
      }}
    >
      {/* Welcome / time / weather — was WorkspaceHome's own standalone bar
          above this card; moved in here at the user's request. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, position: 'relative', zIndex: 2, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${fg(0.12)}` }}>
        {/* No name here — it's already the bold heading just below in the
            identity block, so repeating it in the greeting read as
            redundant. */}
        <p style={{ fontSize: 19, fontWeight: 400, color: fg(0.75), letterSpacing: '-0.01em', margin: 0, lineHeight: 1.2 }}>
          Welcome back.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: fg(0.78), flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: fg(), fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em' }}>{timeStr}</span>
          {weather && (
            <>
              <span style={{ opacity: 0.55 }}>·</span>
              <span>{weather.desc}, {weather.temp}°C</span>
              <span style={{ opacity: 0.55 }}>·</span>
              <span>{weather.humidDesc}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 2 }}>
        {/* Left Block: Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* The dot itself is real, API-linked presence (offline / online /
              clocked-in — lib/presence.ts), not this card's own guess from
              activeClockIn alone: a colleague viewing this same avatar
              elsewhere in the app sees the identical status. statusRingColor
              matches this card's own brand surface so the dot still reads as
              "cut into" the card the way it did as a hand-rolled div.
              The decorative ring is drawn with outline/outline-offset rather
              than a wrapping div's border+padding — a wrapping div gives the
              ring its own, larger circular box, and the status dot (anchored
              to the photo's own 64px corner) then pokes past that box's
              curve at the corner, since a circle's edge falls away faster
              than a square there. outline paints outside this element's own
              box without creating a second box to escape past, so the dot
              and the ring share one circle. */}
          <PersonAvatar
            name={user?.name || 'Employee'} size={64} userId={user?.id}
            statusRingColor={`hsl(${surfaceHsl})`}
            style={{ outline: `3px solid ${fg(0.4)}`, outlineOffset: 7 }}
          />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: fg(), background: fg(0.12), border: `1px solid ${fg(0.3)}`, padding: '2px 8px', borderRadius: 12 }}>
                ESS WORKSPACE
              </span>
              <span style={{ fontSize: 11, color: fg(0.65) }}>ID: EMP-{user?.id?.slice(0, 8).toUpperCase() ?? '2026'}</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: fg(), letterSpacing: '-0.02em', margin: 0 }}>
              {user?.name || 'Valued Team Member'}
              {orgPosition && (
                <>
                  {', '}
                  <em style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic', fontWeight: 700, color: fg() }}>
                    {orgPosition}
                  </em>
                </>
              )}
            </h1>
            <div style={{ fontSize: 13, color: fg(0.65), marginTop: 4, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span>Role: <strong style={{ color: fg() }}>{user?.role || 'Staff Member'}</strong></span>
              {userCity && (
                <>
                  <span>•</span>
                  <span>Location: <strong style={{ color: fg() }}>{userCity}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Block: Live Clock-In Action Control Box — stretches to fill
            the row instead of floating as a narrow pill with dead space
            beside it (the empty gap between it and the card's own edge). */}
        <div style={{ flex: '1 1 340px', maxWidth: 460, background: fg(0.1), borderRadius: 16, padding: '16px 22px', border: `1px solid ${fg(0.2)}`, boxShadow: 'var(--elev-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: activeClockIn ? 'var(--green)' : fg(0.8), marginBottom: 2 }}>
              {activeClockIn ? '● Active Session Counter' : '○ Attendance Status'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: fg(), fontFamily: 'var(--mono)' }}>
              {activeClockIn ? formatTimer(elapsedSecs) : 'OFF THE CLOCK'}
            </div>
            <div style={{ fontSize: 11.5, color: fg(0.75), marginTop: 2 }}>
              {activeClockIn ? `Started at ${new Date(activeClockIn.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Ready to begin?'}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleToggleClockIn}
            disabled={clocking}
            style={{
              height: 44,
              padding: '0 22px',
              fontSize: 14,
              fontWeight: 800,
              borderRadius: 12,
              background: activeClockIn ? 'var(--red)' : 'var(--green)',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              boxShadow: 'var(--elev-sm)',
              cursor: 'pointer',
            }}
          >
            <Icon name="clock" size={17} />
            {clocking ? 'Processing…' : activeClockIn ? 'Clock Out' : 'Clock In Now'}
          </Button>
        </div>
      </div>
    </div>

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
