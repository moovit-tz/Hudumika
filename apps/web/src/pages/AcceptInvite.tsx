import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { AuthBrand, AuthAlert, AuthField } from './Login.js';

export const AcceptInvite: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { completeOnboarding } = useAuth();

  const [name, setName]           = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErr, setFieldErr]   = useState<{ name?: string; password?: string; confirm?: string }>({});
  const [loading, setLoading]     = useState(false);

  const validate = () => {
    const e: typeof fieldErr = {};
    if (!name.trim())              e.name = 'Your name is required';
    if (!password)                 e.password = 'Password is required';
    else if (password.length < 8)  e.password = 'Password must be at least 8 characters';
    if (confirm !== password)      e.confirm = 'Passwords do not match';
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
      completeOnboarding(res);
      navigate('/nexushr');
    } catch (err: any) {
      setError(err.message || 'This invitation link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

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
              <h2 className="auth-form-title">Invalid invitation link</h2>
              <p className="auth-form-sub" style={{ marginBottom: 24 }}>
                This invitation link is missing or invalid. Ask your admin to resend it.
              </p>
              <Link to="/auth/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
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
          <div className="auth-form-hdr">
            <div className="auth-back-icon">
              <Icon name="userPlus" size={22} strokeWidth={1.5} />
            </div>
            <h2 className="auth-form-title">Set up your account</h2>
            <p className="auth-form-sub">You've been invited to join Hudumika. Choose your name and a password to get started.</p>
          </div>

          {error && <AuthAlert message={error} />}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <AuthField label="Full name" error={fieldErr.name}>
              <input
                type="text"
                className={`auth-input${fieldErr.name ? ' auth-input-err' : ''}`}
                placeholder="e.g. Amina Hassan"
                value={name}
                onChange={e => { setName(e.target.value); setFieldErr(p => ({ ...p, name: undefined })); }}
                autoComplete="name"
                autoFocus
              />
            </AuthField>

            <AuthField label="Password" error={fieldErr.password}>
              <div className="auth-input-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`auth-input auth-input-icon-r${fieldErr.password ? ' auth-input-err' : ''}`}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                  <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </AuthField>

            <AuthField label="Confirm password" error={fieldErr.confirm}>
              <input
                type={showPass ? 'text' : 'password'}
                className={`auth-input${fieldErr.confirm ? ' auth-input-err' : ''}`}
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setFieldErr(p => ({ ...p, confirm: undefined })); }}
                autoComplete="new-password"
              />
            </AuthField>

            <button type="submit" disabled={loading} className="auth-btn-primary">
              {loading ? <><span className="auth-spinner" /> Creating account…</> : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvite;
