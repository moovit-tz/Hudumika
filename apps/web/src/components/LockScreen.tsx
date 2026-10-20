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
    if (e.getModifierState) setCapsLock(e.getModifierState('CapsLock'));
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
    <div className={`ls-overlay${isDark ? ' ls-dark' : ''}`}>
      <button
        type="button"
        className="ls-theme-toggle"
        onClick={(e) => toggleThemeWithAnimation(e, !isDark)}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} color="var(--ink)" />
      </button>

      <div className="ls-card">
        {/* Locked badge */}
        <div className="ls-badge">
          <Icon name="lock" size={12} color="var(--teal)" />
          <span>Locked</span>
        </div>

        {/* Avatar + lock emblem */}
        <div className="ls-avatar-wrap">
          <PersonAvatar
            userId={(user as any)?.id}
            name={user?.name ?? 'User'}
            size={80}
            style={{
              border: '2.5px solid color-mix(in srgb, var(--teal) 35%, var(--border))',
              boxShadow: '0 8px 24px -4px color-mix(in srgb, var(--teal) 25%, rgba(0, 0, 0, 0.2))',
            }}
          />
          <div className="ls-avatar-emblem">
            <Icon name="lock" size={12} color="hsl(var(--primary-foreground))" />
          </div>
        </div>

        {/* Identity */}
        <div className="ls-identity">
          <div className="ls-name">{user?.name}</div>
          <div className="ls-subtitle">Enter your password to unlock your workspace</div>
        </div>

        {/* Error */}
        {error && (
          <div className="ls-error">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="ls-form">
          {/* Password field */}
          <div className="ls-field">
            <div className="ls-field-icon">
              <Icon name="key" size={16} />
            </div>
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
                color: showPass ? undefined : 'transparent',
                caretColor: showPass ? undefined : 'transparent',
              }}
            />
            {!showPass && (
              <div className="ls-dots">
                {dotKeys.length === 0 ? (
                  <span className="ls-dots-placeholder">Password</span>
                ) : (
                  <>
                    {dotKeys.map((k, i) => (
                      <span key={k} className={`ls-dot${i === dotKeys.length - 1 ? ' ls-dot--pop' : ''}`} />
                    ))}
                    <span className="ls-cursor" />
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              className="ls-eye"
              onClick={() => setShowPass(p => !p)}
              title={showPass ? 'Hide password' : 'Show password'}
              data-ui-native-button=""
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>

          {/* Caps lock */}
          {capsLock && (
            <div className="ls-caps">
              <Icon name="alertTriangle" size={12} color="var(--gold, #d97706)" />
              Caps Lock is on
            </div>
          )}

          {/* 2FA */}
          {needs2fa && (
            <div className="ls-field ls-field-2fa">
              <div className="ls-field-icon">
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
              />
            </div>
          )}

          {/* Actions */}
          <div className="ls-actions">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={logout}
              className="ls-logout-btn"
            >
              <Icon name="logOut" size={15} color="currentColor" />
              Log out
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={submitting || !password}
              className="ls-unlock-btn"
            >
              {submitting ? 'Unlocking…' : <><span>Unlock</span><Icon name="arrowRight" size={14} color="currentColor" /></>}
            </Button>
          </div>
        </form>

        {/* Footer */}
        <div className="ls-footer">
          <Icon name="shield" size={12} color="var(--teal)" />
          Encrypted Session · {branding.platformName || 'Hudumika'} Security
        </div>
      </div>
    </div>
  );
}
