import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useIdleLock } from '../hooks/useIdleLock.js';
import { useIsDarkMode } from '../hooks/useIsDarkMode.js';
import { useBranding } from '../hooks/useBranding.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { Icon } from './Icon.js';
import { Input } from './ui/input.js';
import { Button } from './ui/button.js';
import { Banner } from './ui/alert.js';
import { PersonAvatar } from './PersonAvatar.js';

/**
 * The idle-lock overlay — rendered alongside the mounted app,
 * preserving session state while requiring password re-authentication.
 * Styled dynamically with Hudumika Design System tokens and platform colors.
 */
export function LockScreen() {
  const { user, logout } = useAuth();
  const { unlock } = useIdleLock();
  const isDark = useIsDarkMode();
  const branding = useBranding(true);

  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One stable key per character position for the pop animation.
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

  const handleKeyActivity = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

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
    } catch (err: any) {
      setError(err.message || 'Incorrect password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'radial-gradient(ellipse 70% 55% at 50% 20%, color-mix(in srgb, var(--teal) 22%, transparent), color-mix(in srgb, var(--navy, #0f172a) 85%, transparent)), color-mix(in srgb, var(--navy2, #1e293b) 80%, #030712 92%)',
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: 'var(--font)',
      }}
    >
      {/* Floating Rounded Light/Dark Mode Switcher */}
      <button
        type="button"
        className="ls-theme-toggle"
        onClick={(e) => toggleThemeWithAnimation(e, !isDark)}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} color="var(--ink)" />
      </button>

      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 'clamp(28px, 4.5vw, 36px) clamp(24px, 4vw, 32px)',
          background: 'color-mix(in srgb, var(--white) 94%, transparent)',
          border: '1px solid color-mix(in srgb, var(--teal) 24%, var(--border))',
          borderRadius: 'var(--card-radius, var(--r-xl, 24px))',
          boxShadow: '0 24px 64px -12px color-mix(in srgb, var(--navy, #000) 45%, black), 0 0 0 1px color-mix(in srgb, var(--white) 10%, transparent)',
          backdropFilter: 'blur(24px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.15)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Workspace Locked Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 'var(--badge-radius, 9999px)',
            fontSize: 'var(--text-xs, 11px)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'var(--teal-l, color-mix(in srgb, var(--teal) 12%, transparent))',
            color: 'var(--teal)',
            border: '1px solid color-mix(in srgb, var(--teal) 28%, transparent)',
            marginBottom: 22,
          }}
        >
          <Icon name="lock" size={12} color="var(--teal)" />
          <span>{branding.platformName || 'Workspace'} Locked</span>
        </div>

        {/* User Profile Avatar with Lock Emblem */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <PersonAvatar
            userId={(user as any)?.id}
            name={user?.name ?? 'User'}
            size={80}
            style={{
              border: '2.5px solid color-mix(in srgb, var(--teal) 35%, var(--border))',
              boxShadow: '0 8px 24px -4px color-mix(in srgb, var(--teal) 25%, rgba(0, 0, 0, 0.2))',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2.5px solid var(--white)',
              boxShadow: '0 2px 8px color-mix(in srgb, var(--teal) 45%, black)',
            }}
          >
            <Icon name="lock" size={12} color="var(--primary-foreground, #ffffff)" />
          </div>
        </div>

        {/* User Identity Details */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--text-xl, 20px)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {user?.name}
          </div>
          <div style={{ fontSize: 'var(--text-sm, 13px)', color: 'var(--ink3)', marginTop: 4 }}>
            Enter your password to unlock your workspace
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ width: '100%', marginBottom: 16 }}>
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        {/* Unlock Form */}
        <form onSubmit={handleSubmit} noValidate style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ position: 'relative' }}>
            {/* Left Lock Icon */}
            <div
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--ink3)',
                display: 'flex',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
              <Icon name="key" size={16} />
            </div>

            {/* Real Input */}
            <Input
              type={showPass ? 'text' : 'password'}
              placeholder={showPass ? 'Password' : ''}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyActivity}
              onKeyUp={handleKeyActivity}
              autoComplete="current-password"
              autoFocus
              style={{
                minHeight: 'var(--ctl-h-lg, 46px)',
                paddingLeft: 40,
                paddingRight: 48,
                fontSize: 'var(--text-md, 15px)',
                color: showPass ? 'var(--ink)' : 'transparent',
                caretColor: showPass ? 'var(--ink)' : 'transparent',
                borderRadius: 'var(--r, 10px)',
              }}
            />

            {/* Animated dot display overlay */}
            {!showPass && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 40,
                  paddingRight: 48,
                  gap: 7,
                }}
              >
                {dotKeys.length === 0 ? (
                  <span style={{ fontSize: 'var(--text-md, 14.5px)', color: 'var(--ink3)' }}>Password</span>
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

            {/* Eye Toggle Button */}
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              title={showPass ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: 'var(--r-sm)',
                color: 'var(--ink3)',
                zIndex: 2,
              }}
              data-ui-native-button=""
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>

          {/* Caps Lock Warning */}
          {capsLock && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 'var(--text-xs, 11.5px)',
                color: 'var(--gold, #d97706)',
                fontWeight: 600,
                paddingLeft: 2,
              }}
            >
              <Icon name="alertTriangle" size={12} color="var(--gold, #d97706)" />
              Caps Lock is on
            </div>
          )}

          {/* 2FA One-Time Code Field */}
          {needs2fa && (
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--teal)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="shield" size={16} color="var(--teal)" />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="6-digit authentication code"
                value={totp}
                onChange={e => setTotp(e.target.value)}
                autoComplete="one-time-code"
                autoFocus
                style={{
                  minHeight: 'var(--ctl-h-lg, 46px)',
                  paddingLeft: 40,
                  fontSize: 'var(--text-md, 15px)',
                  borderRadius: 'var(--r, 10px)',
                }}
              />
            </div>
          )}

          {/* Actions Bar — Shortened "Log out" Button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              gap: 12,
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={logout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--ink2)',
                fontWeight: 600,
                borderRadius: 'var(--r, 10px)',
              }}
            >
              <Icon name="logOut" size={15} color="var(--ink2)" />
              Log out
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={submitting || !password}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 118,
                justifyContent: 'center',
                fontWeight: 700,
                borderRadius: 'var(--r, 10px)',
                background: 'var(--teal)',
                color: 'var(--primary-foreground, #ffffff)',
                boxShadow: submitting || !password ? 'none' : '0 4px 14px color-mix(in srgb, var(--teal) 35%, transparent)',
              }}
            >
              {submitting ? (
                'Unlocking…'
              ) : (
                <>
                  <span>Unlock</span>
                  <Icon name="arrowRight" size={14} color="currentColor" />
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Security Footer Note */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 24,
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--ink3)',
            opacity: 0.8,
          }}
        >
          <Icon name="shield" size={12} color="var(--teal)" />
          Encrypted Session · {branding.platformName || 'Hudumika'} Security
        </div>
      </div>
    </div>
  );
}

