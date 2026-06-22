import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { AuthBrand, AuthAlert, AuthField } from './Login.js';

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

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [fieldErr, setFieldErr]       = useState<Partial<Record<keyof typeof form | 'agreed', string>>>({});
  const [loading, setLoading]         = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [k]: e.target.value }));
    setFieldErr(p => ({ ...p, [k]: undefined }));
  };

  const validate = () => {
    const e: typeof fieldErr = {};
    if (!form.name.trim())   e.name = 'Full name is required';
    if (!form.email)         e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (!form.password)      e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    if (!agreed)             e.agreed = 'You must accept the terms to continue';
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      navigate('/auth/verify-email?email=' + encodeURIComponent(form.email));
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = passStrength(form.password);

  return (
    <div className="auth-shell">
      <AuthBrand />

      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-hdr">
            <h2 className="auth-form-title">Create your account</h2>
            <p className="auth-form-sub">Join ClearOS to manage your freight operations.</p>
          </div>

          {error && <AuthAlert message={error} />}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <AuthField label="Full name" error={fieldErr.name}>
              <input
                type="text"
                className={`auth-input${fieldErr.name ? ' auth-input-err' : ''}`}
                placeholder="John Mwangi"
                value={form.name}
                onChange={set('name')}
                autoComplete="name"
              />
            </AuthField>

            <AuthField label="Work email" error={fieldErr.email}>
              <input
                type="email"
                className={`auth-input${fieldErr.email ? ' auth-input-err' : ''}`}
                placeholder="you@company.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
              />
            </AuthField>

            <AuthField label="Password" error={fieldErr.password}>
              <div className="auth-input-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`auth-input auth-input-icon-r${fieldErr.password ? ' auth-input-err' : ''}`}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                  <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
              {form.password && (
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

            <AuthField label="Confirm password" error={fieldErr.confirm}>
              <div className="auth-input-wrap">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className={`auth-input auth-input-icon-r${fieldErr.confirm ? ' auth-input-err' : ''}`}
                  placeholder="Re-enter password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" aria-label={showConfirm ? 'Hide password' : 'Show password'} onClick={() => setShowConfirm(p => !p)} tabIndex={-1}>
                  <Icon name={showConfirm ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </AuthField>

            <div className={`auth-field${fieldErr.agreed ? ' has-error' : ''}`}>
              <label className="auth-check">
                <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); setFieldErr(p => ({ ...p, agreed: undefined })); }} />
                <span>
                  I agree to the{' '}
                  <a href="#" className="auth-link" onClick={e => e.preventDefault()}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="auth-link" onClick={e => e.preventDefault()}>Privacy Policy</a>
                </span>
              </label>
              {fieldErr.agreed && <span className="auth-field-error" style={{ marginTop: 6 }}>{fieldErr.agreed}</span>}
            </div>

            <button type="submit" disabled={loading} className="auth-btn-primary">
              {loading ? <><span className="auth-spinner" /> Creating account…</> : 'Create account'}
            </button>
          </form>

          <p className="auth-switch-link">
            Already have an account?{' '}
            <Link to="/auth/login" className="auth-link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
