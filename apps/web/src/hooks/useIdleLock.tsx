import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BASE_URL, csrfToken } from '../lib/api.js';
import { useAuth } from './useAuth.js';
import { IDLE_LOCK_KEYS as KEYS, IDLE_LOCK_RESET_EVENT } from '../lib/idleLockKeys.js';

// 15 minutes of no genuine user input locks the session. Deliberately not
// wired to apiFetch — background polling must never be what keeps a session
// unlocked, or an idle tab with a notification poller running would never
// lock at all.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 10 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart'] as const;

interface IdleLockContextType {
  locked: boolean;
  /** Verifies the password (and TOTP, once challenged) against the CURRENT
   *  session — never issues new tokens, just re-checks who's already signed
   *  in. Returns 'ok', 'needs_2fa', or throws with the server's own message
   *  on a wrong password/code. */
  unlock: (password: string, totp?: string) => Promise<'ok' | 'needs_2fa'>;
  /** Locks immediately, same overlay as the 15-minute idle timeout — for a
   *  person stepping away who doesn't want to wait for it. Cross-tab via the
   *  same storage flag the idle poller already writes. */
  lock: () => void;
}

const IdleLockContext = createContext<IdleLockContextType | null>(null);

function readLastActivity(): number {
  const raw = localStorage.getItem(KEYS.lastActivity);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : Date.now();
}

export const IdleLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [locked, setLocked] = useState(() => localStorage.getItem(KEYS.locked) === '1');
  const lastThrottledWrite = useRef(0);

  // Always active, independent of `user` — this provider is mounted once
  // for the app's lifetime, so its in-memory `locked` state would otherwise
  // survive a same-tab logout -> re-login cycle with no page reload (e.g.
  // LockScreen's own "Log out instead"), re-locking the very next session
  // instantly. clearIdleLockState() (called from every real session-ending
  // path — see idleLockKeys.ts) dispatches this the moment a session ends,
  // not the moment a new one starts, so it fires whether or not `user` is
  // set at that exact instant.
  useEffect(() => {
    const onReset = () => setLocked(false);
    window.addEventListener(IDLE_LOCK_RESET_EVENT, onReset);
    return () => window.removeEventListener(IDLE_LOCK_RESET_EVENT, onReset);
  }, []);

  // Only tracked while a session actually exists — no point locking the
  // login page itself.
  useEffect(() => {
    if (!user) return;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastThrottledWrite.current < ACTIVITY_THROTTLE_MS) return;
      lastThrottledWrite.current = now;
      localStorage.setItem(KEYS.lastActivity, String(now));
    };
    // A tab that's had nothing happen in it yet still needs a starting point.
    if (!localStorage.getItem(KEYS.lastActivity)) recordActivity();

    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, recordActivity, { passive: true });

    const interval = setInterval(() => {
      if (localStorage.getItem(KEYS.locked) === '1') return; // already locked, nothing to check
      if (Date.now() - readLastActivity() >= IDLE_TIMEOUT_MS) {
        localStorage.setItem(KEYS.locked, '1');
        setLocked(true);
      }
    }, POLL_INTERVAL_MS);

    // Cross-tab: another tab locking or unlocking should reflect here
    // immediately, not wait for this tab's own poll — same storage-event
    // pattern useAuth.tsx already uses for cross-tab logout.
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (e.key !== null && e.key !== KEYS.locked) return;
      setLocked(localStorage.getItem(KEYS.locked) === '1');
    };
    window.addEventListener('storage', onStorage);

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, recordActivity);
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, [user]);

  // Deliberately not apiFetch/apiFetchRaw: those treat *any* 401 as a dead
  // session and force a full logout+redirect (api.ts's handleUnauthorized)
  // — exactly wrong here, where a wrong password is an ordinary, retryable
  // answer that must leave the lock screen exactly where it was.
  const unlock = async (password: string, totp?: string): Promise<'ok' | 'needs_2fa'> => {
    const csrf = csrfToken();
    const response = await fetch(`${BASE_URL}/auth/verify-password`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(totp ? { password, totp } : { password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || 'Incorrect password');
    }
    if (body?.requires_2fa) return 'needs_2fa';
    localStorage.setItem(KEYS.lastActivity, String(Date.now()));
    localStorage.removeItem(KEYS.locked);
    setLocked(false);
    return 'ok';
  };

  const lock = () => {
    localStorage.setItem(KEYS.locked, '1');
    setLocked(true);
  };

  return (
    <IdleLockContext.Provider value={{ locked: !!user && locked, unlock, lock }}>
      {children}
    </IdleLockContext.Provider>
  );
};

export const useIdleLock = () => {
  const ctx = useContext(IdleLockContext);
  if (!ctx) throw new Error('useIdleLock must be used within an IdleLockProvider');
  return ctx;
};
