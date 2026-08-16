import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useOrgAuth } from '../hooks/useOrgAuth.js';
import './Login.css';

/**
 * Login for an Organization (migration 230) — reuses Login.css's classes for
 * visual consistency with the staff/customer login page, but is otherwise a
 * standalone form: no demo-account chooser, no 2FA, no i18n for this first
 * slice — this is a new, small surface, not an extension of Login.tsx's
 * already-large branching.
 */
export const OrgLogin: React.FC = () => {
  const { orgLogin } = useOrgAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await orgLogin(email, password);
      navigate('/org', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand-hdr">
          <div className="login-brand-row">
            <div className="g-brand-grid">
              <div className="g-brand-sq g-brand-sq--r" />
              <div className="g-brand-sq g-brand-sq--b" />
              <div className="g-brand-sq g-brand-sq--y" />
              <div className="g-brand-sq g-brand-sq--g" />
            </div>
            <span className="g-brand-name">hudumika</span>
          </div>
          <h1 className="login-headline">Organization sign in</h1>
          <p className="login-subtext">Track every shipment across every agent handling them, in one place.</p>
        </div>

        {error && (
          <div className="login-error">
            <Icon name="alertCircle" size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="login-form">
          <div className="login-field">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="login-input"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-field">
            <div className="login-field-pw">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="login-input"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="login-pw-toggle" title={showPass ? 'Hide password' : 'Show password'}>
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>
          </div>

          <div className="login-form-actions">
            <span />
            <button type="submit" disabled={loading || !email || !password} className="login-submit-btn">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
