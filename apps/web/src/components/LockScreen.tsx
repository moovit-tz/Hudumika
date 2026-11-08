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
import './LockScreen.css';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the password input on mount
    inputRef.current?.focus();
  }, []);

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
    <div className={`ls-overlay${isDark ? ' ls-dark' : ''}`}>
      {/* Light / Dark Mode Toggle */}
      <button
        type="button"
        className="ls-theme-toggle"
        data-theme-switcher=""
        onClick={(e) => toggleThemeWithAnimation(e, !isDark)}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} />
      </button>

      {/* Main Lock Screen Card */}
      <div className="ls-card">
        {/* Status Badge */}
        <div className="ls-badge">
          <Icon name="lock" size={12} color="var(--teal)" />
          <span>Locked</span>
        </div>

        {/* User Avatar with Status Ring */}
        <div className="ls-avatar-wrap">
          <div className="ls-avatar-ring">
            <PersonAvatar
              userId={(user as any)?.id}
              name={user?.name ?? 'User'}
              size={76}
              hideStatus
              style={{ display: 'block', borderRadius: '50%' }}
            />
          </div>
          <div className="ls-avatar-emblem">
            <Icon name="lock" size={12} />
          </div>
        </div>

        {/* User Identity */}
        <div className="ls-identity">
          <div className="ls-name">{user?.name || 'Workspace User'}</div>
          <div className="ls-subtitle">Enter your password to unlock your workspace</div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="ls-error">
            <Banner variant="error">{error}</Banner>
          </div>
        )}

        {/* Unlock Form */}
        <form onSubmit={handleSubmit} noValidate className="ls-form">
          {/* Password Field */}
          <div className="ls-field">
            <div className="ls-field-icon">
              <Icon name="key" size={15} />
            </div>
            <Input
              ref={inputRef}
              type={showPass ? 'text' : 'password'}
              placeholder="Enter password…"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyActivity}
              onKeyUp={handleKeyActivity}
              autoComplete="current-password"
              autoFocus
              className={`ls-input ${!showPass ? 'password-masked' : ''}`}
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore=""
              data-form-type="other"
            />
            <button data-ui-native-button=""
              type="button"
              className="ls-eye-btn"
              onClick={() => {
                setShowPass(p => !p);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              onMouseDown={e => e.preventDefault()}
              title={showPass ? 'Hide password' : 'Show password'}
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>

          {/* CapsLock Warning */}
          {capsLock && (
            <div className="ls-caps">
              <Icon name="alertTriangle" size={12} color="var(--gold, #d97706)" />
              <span>Caps Lock is on</span>
            </div>
          )}

          {/* 2FA Input (Conditional) */}
          {needs2fa && (
            <div className="ls-field">
              <div className="ls-field-icon">
                <Icon name="shield" size={15} color="var(--teal)" />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="6-digit authenticator code"
                value={totp}
                onChange={e => setTotp(e.target.value)}
                autoComplete="one-time-code"
                autoFocus
                className="ls-input"
              />
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="ls-actions">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={logout}
              className="ls-btn-logout"
            >
              <Icon name="logOut" size={14} />
              <span>Log out</span>
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={submitting || !password}
              className="ls-btn-unlock"
            >
              {submitting ? (
                <span>Unlocking…</span>
              ) : (
                <>
                  <span>Unlock</span>
                  <Icon name="arrowRight" size={14} />
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Security Footer */}
        <div className="ls-footer">
          <Icon name="shield" size={12} color="var(--teal)" />
          <span>Encrypted Session · {branding.platformName || 'Hudumika'} Security</span>
        </div>
      </div>
    </div>
  );
}
