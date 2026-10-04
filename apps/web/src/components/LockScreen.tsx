import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useIdleLock } from '../hooks/useIdleLock.js';
import { Icon } from './Icon.js';
import { Input } from './ui/input.js';
import { Button } from './ui/button.js';
import { Banner } from './ui/alert.js';
import { PersonAvatar } from './PersonAvatar.js';

/**
 * The idle-lock overlay — rendered *alongside* the mounted app (see
 * LockScreenGate in App.tsx), never in place of it, so anything already
 * polling underneath keeps running and the session stays genuinely alive.
 *
 * Deliberately built on the platform's real, always-live design tokens
 * (--white/--ink/--border/--primary/...) rather than Login.css's --lp-*
 * variables: those are only ever set by Login.tsx's own theme effect, which
 * this overlay never runs, so every --lp-* read here would silently fall
 * back to its hardcoded *light-mode* default regardless of the app's actual
 * theme — a white card with light-mode text over a dark workspace. The
 * tokens used below are already correct for the current theme the instant
 * this mounts, because the real app underneath already set them.
 */
export function LockScreen() {
  const { user, logout } = useAuth();
  const { unlock } = useIdleLock();

  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One stable key per character position — a new key causes React to remount
  // that dot span, which re-fires the pop animation. Deleting trims from the right.
  const [dotKeys, setDotKeys] = useState<string[]>([]);
  const prevLenRef = useRef(0);
  useEffect(() => {
    const newLen = password.length;
    const delta  = newLen - prevLenRef.current;
    prevLenRef.current = newLen;
    if (delta > 0) {
      const fresh = Array.from({ length: delta }, (_, i) => `d-${Date.now()}-${i}`);
      setDotKeys(prev => [...prev, ...fresh]);
    } else if (delta < 0) {
      setDotKeys(prev => prev.slice(0, newLen));
    }
  }, [password.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await unlock(password, needs2fa ? totp : undefined);
      if (result === 'needs_2fa') {
        setNeeds2fa(true);
        setError(null);
      }
      // 'ok' needs no further action — useIdleLock's own state flip removes this overlay.
    } catch (err: any) {
      setError(err.message || 'Incorrect password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(15, 17, 21, 0.54)', backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: 460, padding: 'clamp(32px, 5vw, 44px)',
        background: 'color-mix(in srgb, var(--white) 88%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
        boxShadow: 'var(--elev-lg)',
        backdropFilter: 'blur(20px) saturate(1.12)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.12)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <PersonAvatar
            userId={(user as any)?.id}
            name={user?.name ?? 'User'}
            size={76}
            style={{ border: '1px solid var(--border)' }}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>{user?.name}</div>
            <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 4 }}>Session locked after 15 minutes of inactivity</div>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 18 }}><Banner variant="error">{error}</Banner></div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            {/* Real input — hidden text so the animated dot overlay shows instead */}
            <Input
              type={showPass ? 'text' : 'password'}
              placeholder={showPass ? 'Password' : ''}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              style={{
                minHeight: 'var(--ctl-h-lg)', paddingRight: 52, fontSize: 15,
                color: showPass ? 'var(--ink)' : 'transparent',
                caretColor: showPass ? 'var(--ink)' : 'transparent',
              }}
            />

            {/* Animated dot display — rendered over the input when in mask mode */}
            {!showPass && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                display: 'flex', alignItems: 'center',
                paddingLeft: 14, paddingRight: 52, gap: 7,
              }}>
                {dotKeys.length === 0 ? (
                  <span style={{ fontSize: 15, color: 'var(--ink3)' }}>Password</span>
                ) : (
                  <>
                    {dotKeys.map((k, i) => (
                      <span
                        key={k}
                        className={`ls-dot${i === dotKeys.length - 1 ? ' ls-dot--pop' : ''}`}
                      />
                    ))}
                    <span className="ls-cursor" />
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              title={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--r-sm)',
                color: 'var(--ink3)',
              }}
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={19} />
            </button>
          </div>

          {needs2fa && (
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit authentication code"
              value={totp}
              onChange={e => setTotp(e.target.value)}
              autoComplete="one-time-code"
              autoFocus
              style={{ minHeight: 'var(--ctl-h-lg)', fontSize: 15 }}
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 12 }}>
            <Button type="button" variant="ghost" size="lg" onClick={logout} style={{ color: 'var(--ink3)' }}>
              Log out instead
            </Button>
            <Button type="submit" size="lg" disabled={submitting || !password}>
              {submitting ? 'Unlocking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
