import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';

/**
 * Opt-in, intensity-only activity collector + its ALWAYS-VISIBLE indicator.
 *
 * It runs only when the server says both gates are open (tenant enabled AND the
 * person consented — see GET /v1/activity-monitor/config). It records HOW MUCH,
 * never WHAT: a count of keydowns (the pressed key is never read), mouse-travel
 * distance, clicks, seconds active, and a coarse pointer zone for a heatmap. No
 * key identity, no text, no field values ever leave the browser. While it runs,
 * a small chip is shown so it is never covert; clicking the chip is the fastest
 * way to the settings page where consent can be withdrawn.
 */

const ZONE_ROWS = 8, ZONE_COLS = 12;

interface Accum {
  keystrokes: number; mouse: number; clicks: number; activeSeconds: number;
  zones: Record<string, number>; lastX: number | null; lastY: number | null; windowStart: number;
}
const freshAccum = (): Accum => ({ keystrokes: 0, mouse: 0, clicks: 0, activeSeconds: 0, zones: {}, lastX: null, lastY: null, windowStart: Date.now() });

export function ActivityMonitorIndicator({ appId }: { appId: string }) {
  const [active, setActive] = useState(false);
  const [captureKeys, setCaptureKeys] = useState(true);
  const [captureHeat, setCaptureHeat] = useState(true);
  const [intervalSec, setIntervalSec] = useState(60);
  const [live, setLive] = useState({ keystrokes: 0, clicks: 0 });
  const acc = useRef<Accum>(freshAccum());

  // Decide whether to run.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/v1/activity-monitor/config').then((cfg: any) => {
      if (cancelled) return;
      setActive(!!cfg.active);
      setCaptureKeys(cfg.settings?.captureKeystrokes !== false);
      setCaptureHeat(cfg.settings?.captureHeatmap !== false);
      setIntervalSec(Math.max(15, Math.min(600, cfg.settings?.intervalSeconds || 60)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active) return;
    acc.current = freshAccum();

    const zoneKey = (x: number, y: number) => {
      const col = Math.max(0, Math.min(ZONE_COLS - 1, Math.floor((x / Math.max(1, window.innerWidth)) * ZONE_COLS)));
      const row = Math.max(0, Math.min(ZONE_ROWS - 1, Math.floor((y / Math.max(1, window.innerHeight)) * ZONE_ROWS)));
      return `r${row}c${col}`;
    };
    const onKey = () => { if (captureKeys) { acc.current.keystrokes++; } };  // NB: event.key is never read
    const onMove = (e: MouseEvent) => {
      const a = acc.current;
      if (a.lastX != null && a.lastY != null) a.mouse += Math.hypot(e.clientX - a.lastX, e.clientY - a.lastY);
      a.lastX = e.clientX; a.lastY = e.clientY;
      if (captureHeat) { const k = zoneKey(e.clientX, e.clientY); a.zones[k] = (a.zones[k] ?? 0) + 1; }
    };
    const onClick = (e: MouseEvent) => {
      acc.current.clicks++;
      if (captureHeat) { const k = zoneKey(e.clientX, e.clientY); acc.current.zones[k] = (acc.current.zones[k] ?? 0) + 3; }
    };
    window.addEventListener('keydown', onKey, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('click', onClick, { passive: true });

    // Active-seconds tick while the tab is visible.
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') acc.current.activeSeconds++; }, 1000);

    const flush = (keepalive = false) => {
      const a = acc.current;
      if (a.keystrokes === 0 && a.clicks === 0 && a.mouse === 0 && a.activeSeconds === 0) { a.windowStart = Date.now(); return; }
      const sample = {
        windowStart: new Date(a.windowStart).toISOString(), windowEnd: new Date().toISOString(),
        keystrokes: a.keystrokes, mouseDistancePx: Math.round(a.mouse), clicks: a.clicks, activeSeconds: a.activeSeconds,
        zones: a.zones, app: appId, path: window.location.pathname,
      };
      acc.current = freshAccum();
      setLive({ keystrokes: 0, clicks: 0 });
      // Always via apiFetch so the JWT is attached (navigator.sendBeacon can't
      // set the Authorization header, so a beacon would just 401). keepalive
      // lets the last flush survive an unload; a dropped final window is only
      // approximate intensity data, never anything exact.
      apiFetch('/v1/activity-monitor/samples', { method: 'POST', body: JSON.stringify({ samples: [sample] }), keepalive }).catch(() => {});
    };

    const flushTimer = window.setInterval(() => flush(false), intervalSec * 1000);
    const liveTimer = window.setInterval(() => setLive({ keystrokes: acc.current.keystrokes, clicks: acc.current.clicks }), 2000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    document.addEventListener('visibilitychange', onHide);
    const onUnload = () => flush(true);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      flush(false);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.clearInterval(tick); window.clearInterval(flushTimer); window.clearInterval(liveTimer);
    };
  }, [active, captureKeys, captureHeat, intervalSec, appId]);

  if (!active) return null;
  return (
    <a href="/activity-monitor" title="Activity monitoring is on. Records intensity only — never what you type. Click to manage." style={{
      position: 'fixed', bottom: 14, right: 14, zIndex: 4000, display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textDecoration: 'none',
      background: 'var(--teal-l, #e6f4f2)', color: 'var(--teal-d, #0a6e66)', border: '1px solid var(--teal-m, #b6ded9)',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal, #0d9488)', boxShadow: '0 0 0 0 rgba(13,148,136,.6)', animation: 'amPulse 2s infinite' }} />
      Activity on
      <span style={{ opacity: .7, fontWeight: 600 }}>· {live.keystrokes}k {live.clicks}c</span>
      <style>{`@keyframes amPulse{0%{box-shadow:0 0 0 0 rgba(13,148,136,.5)}70%{box-shadow:0 0 0 6px rgba(13,148,136,0)}100%{box-shadow:0 0 0 0 rgba(13,148,136,0)}}`}</style>
    </a>
  );
}
