import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate, Link } from 'react-router-dom';
import { useCompany } from '../data/companyStore.js';
import { Icon } from '../components/Icon.js';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: typeof fieldErr = {};
    if (!email) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthBrand />

      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-hdr">
            <h2 className="auth-form-title">Welcome back</h2>
            <p className="auth-form-sub">Sign in to your ClearOS account to continue.</p>
          </div>

          {error && <AuthAlert message={error} />}

          <form onSubmit={handleSubmit} noValidate className="auth-form">
            <AuthField label="Email address" error={fieldErr.email}>
              <input
                type="email"
                className={`auth-input${fieldErr.email ? ' auth-input-err' : ''}`}
                placeholder="you@company.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErr(p => ({ ...p, email: undefined })); }}
                autoComplete="email"
              />
            </AuthField>

            <AuthField
              label="Password"
              error={fieldErr.password}
              right={<Link to="/auth/forgot-password" className="auth-link auth-link-sm">Forgot password?</Link>}
            >
              <div className="auth-input-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`auth-input auth-input-icon-r${fieldErr.password ? ' auth-input-err' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
                  autoComplete="current-password"
                />
                <button type="button" className="auth-eye-btn" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                  <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </AuthField>

            <label className="auth-check">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>Keep me signed in for 30 days</span>
            </label>

            <button type="submit" disabled={loading} className="auth-btn-primary">
              {loading ? <><span className="auth-spinner" /> Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch-link">
            Don't have an account?{' '}
            <Link to="/auth/register" className="auth-link">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Shared auth components ── */

export function AuthBrand() {
  const co = useCompany();
  return (
    <div className="auth-brand">
      <div className="auth-brand-logo" style={{ marginBottom: 16 }}>
        {co.logoUrl ? (
          <img src={co.logoUrl} alt={co.name} style={{ height: 32, objectFit: 'contain', display: 'block' }} />
        ) : (
          <>
            <img src="/logo-light.png" alt="Moovit ClearOS" className="logo-light-only" style={{ height: 32, objectFit: 'contain' }} />
            <img src="/logo-dark.png" alt="Moovit ClearOS" className="logo-dark-only" style={{ height: 32, objectFit: 'contain' }} />
          </>
        )}
      </div>

      <div className="auth-brand-body">
        <h1 className="auth-brand-hl">East Africa's Customs &amp; Freight Intelligence Platform</h1>
        <p className="auth-brand-sub">
          Streamline import/export operations, customs declarations, and logistics across all ports in one unified system.
        </p>
        <ul className="auth-brand-feats">
          {[
            'Real-time shipment & clearance tracking',
            'Multi-port declaration management',
            'Demurrage monitoring & cost control',
            'Customer, contract & billing management',
          ].map(f => (
            <li key={f} className="auth-brand-feat">
              <span className="auth-feat-tick"><Icon name="check" size={11} strokeWidth={2.5} /></span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="auth-brand-badges">
        <span className="auth-badge">Tanzania Customs</span>
        <span className="auth-badge">Kenya Ports</span>
        <span className="auth-badge">TANCIS Integrated</span>
      </div>

      <div className="auth-brand-foot">
        © {new Date().getFullYear()} Moovit Logistics Ltd · ClearOS Platform
      </div>
    </div>
  );
}

export function AuthAlert({ message }: { message: string }) {
  return (
    <div className="auth-alert">
      <Icon name="alertCircle" size={15} />
      <span>{message}</span>
    </div>
  );
}

export function AuthSuccess({ message }: { message: string }) {
  return (
    <div className="auth-alert auth-alert-ok">
      <Icon name="checkCircle" size={15} />
      <span>{message}</span>
    </div>
  );
}

interface AuthFieldProps {
  label: string;
  error?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}
export function AuthField({ label, error, right, children }: AuthFieldProps) {
  return (
    <div className={`auth-field${error ? ' has-error' : ''}`}>
      <div className="auth-field-row">
        <label className="auth-field-label">{label}</label>
        {right && <span className="auth-field-right">{right}</span>}
      </div>
      {children}
      {error && <span className="auth-field-error">{error}</span>}
    </div>
  );
}
