import React, { useState } from 'react';
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
      background: 'rgba(15, 17, 21, 0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, padding: 28, boxShadow: 'var(--elev-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <PersonAvatar
            userId={(user as any)?.id}
            name={user?.name ?? 'User'}
            size={56}
            style={{ border: '1px solid var(--border)' }}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 2 }}>Session locked after 15 minutes of inactivity</div>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 14 }}><Banner variant="error">{error}</Banner></div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              title={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--r-sm)',
                color: 'var(--ink3)',
              }}
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={16} />
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
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 10 }}>
            <Button type="button" variant="ghost" onClick={logout} style={{ color: 'var(--ink3)' }}>
              Log out instead
            </Button>
            <Button type="submit" disabled={submitting || !password}>
              {submitting ? 'Unlocking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
