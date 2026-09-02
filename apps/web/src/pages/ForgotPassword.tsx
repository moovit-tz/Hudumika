import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { AuthBrand, AuthAlert, AuthSuccess, AuthField } from './Login.js';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail]   = useState('');
  const [fieldErr, setFieldErr] = useState<{ email?: string }>({});
  const [error, setError]   = useState<string | null>(null);
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!email) { setFieldErr({ email: 'Email address is required' }); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldErr({ email: 'Enter a valid email address' }); return false; }
    return true;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthBrand />

      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          {sent ? (
            <div className="auth-sent-state">
              <div className="auth-sent-icon">
                <Icon name="mail" size={32} strokeWidth={1.5} />
              </div>
              <h2 className="auth-form-title">Check your inbox</h2>
              <p className="auth-form-sub" style={{ marginBottom: 24 }}>
                We sent a password reset link to <strong>{email}</strong>. It expires in 30 minutes.
              </p>
              <p className="auth-form-sub" style={{ fontSize: 13, color: 'var(--ink3)' }}>
                Didn't receive it? Check your spam folder or{' '}
                <button
                  type="button"
                  className="auth-link"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                  onClick={() => { setSent(false); setLoading(false); }}
                >
                  try again
                </button>.
              </p>
              <Link to="/auth/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', marginTop: 24, textDecoration: 'none' }}>
                Back to sign in
              </Link>
              <p className="auth-switch-link" style={{ marginTop: 12 }}>
                Lost access to this email too?{' '}
                <Link to="/auth/recovery" className="auth-link">Recover via a trusted contact</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="auth-form-hdr">
                <div className="auth-back-icon">
                  <Icon name="lock" size={22} strokeWidth={1.5} />
                </div>
                <h2 className="auth-form-title">Forgot your password?</h2>
                <p className="auth-form-sub">Enter your account email and we'll send you a reset link.</p>
              </div>

              {error && <AuthAlert message={error} />}

              <form onSubmit={handleSubmit} noValidate className="auth-form">
                <AuthField label="Email address" error={fieldErr.email}>
                  <input
                    type="email"
                    className={`auth-input${fieldErr.email ? ' auth-input-err' : ''}`}
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setFieldErr({}); }}
                    autoComplete="email"
                    autoFocus
                  />
                </AuthField>

                <button type="submit" disabled={loading} className="auth-btn-primary">
                  {loading ? <><span className="auth-spinner" /> Sending…</> : 'Send reset link'}
                </button>
              </form>

              <p className="auth-switch-link">
                Remember your password?{' '}
                <Link to="/auth/login" className="auth-link">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
