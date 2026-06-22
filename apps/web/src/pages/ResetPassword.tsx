import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { AuthBrand, AuthAlert, AuthSuccess, AuthField } from './Login.js';

function passStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s as 0 | 1 | 2 | 3;
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Strong'];
const STRENGTH_COLOR = ['', '#e11d48', '#d97706', '#16a34a'];

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErr, setFieldErr]   = useState<{ password?: string; confirm?: string }>({});
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  const validate = () => {
    const e: typeof fieldErr = {};
    if (!password)          e.password = 'New password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (confirm !== password) e.confirm = 'Passwords do not match';
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => navigate('/auth/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const strength = passStrength(password);

  if (!token) {
    return (
      <div className="auth-shell">
        <AuthBrand />
        <div className="auth-form-panel">
          <div className="auth-form-wrap">
            <div className="auth-sent-state">
              <div className="auth-sent-icon auth-sent-icon-err">
                <Icon name="alertCircle" size={32} strokeWidth={1.5} />
              </div>
              <h2 className="auth-form-title">Invalid reset link</h2>
              <p className="auth-form-sub" style={{ marginBottom: 24 }}>
                This password reset link is missing or invalid. Please request a new one.
              </p>
              <Link to="/auth/forgot-password" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Request new link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <AuthBrand />

      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          {done ? (
            <div className="auth-sent-state">
              <div className="auth-sent-icon auth-sent-icon-ok">
                <Icon name="checkCircle" size={32} strokeWidth={1.5} />
              </div>
              <h2 className="auth-form-title">Password updated</h2>
              <p className="auth-form-sub" style={{ marginBottom: 24 }}>
                Your password has been changed successfully. Redirecting you to sign in…
              </p>
              <Link to="/auth/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Sign in now
              </Link>
            </div>
          ) : (
            <>
              <div className="auth-form-hdr">
                <div className="auth-back-icon">
                  <Icon name="shield" size={22} strokeWidth={1.5} />
                </div>
                <h2 className="auth-form-title">Set a new password</h2>
                <p className="auth-form-sub">Choose a strong password to secure your account.</p>
              </div>

              {error && <AuthAlert message={error} />}

              <form onSubmit={handleSubmit} noValidate className="auth-form">
                <AuthField label="New password" error={fieldErr.password}>
                  <div className="auth-input-wrap">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className={`auth-input auth-input-icon-r${fieldErr.password ? ' auth-input-err' : ''}`}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
                      autoComplete="new-password"
                      autoFocus
                    />
                    <button type="button" className="auth-eye-btn" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                      <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  </div>
                  {password && (
                    <div className="auth-strength">
                      <div className="auth-strength-bars">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="auth-strength-seg" style={{ background: strength >= i ? STRENGTH_COLOR[strength] : 'var(--border)' }} />
                        ))}
                      </div>
                      <span className="auth-strength-label" style={{ color: STRENGTH_COLOR[strength] }}>
                        {STRENGTH_LABEL[strength]}
                      </span>
                    </div>
                  )}
                </AuthField>

                <AuthField label="Confirm new password" error={fieldErr.confirm}>
                  <div className="auth-input-wrap">
                    <input
                      type={showConf ? 'text' : 'password'}
                      className={`auth-input auth-input-icon-r${fieldErr.confirm ? ' auth-input-err' : ''}`}
                      placeholder="Re-enter new password"
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setFieldErr(p => ({ ...p, confirm: undefined })); }}
                      autoComplete="new-password"
                    />
                    <button type="button" className="auth-eye-btn" aria-label={showConf ? 'Hide password' : 'Show password'} onClick={() => setShowConf(p => !p)} tabIndex={-1}>
                      <Icon name={showConf ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  </div>
                </AuthField>

                <button type="submit" disabled={loading} className="auth-btn-primary">
                  {loading ? <><span className="auth-spinner" /> Updating…</> : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
