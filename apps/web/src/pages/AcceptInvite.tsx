import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { AuthCard, AuthAlert, AuthField } from './Login.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.js';
import { MicrosoftSignInButton } from '../components/MicrosoftSignInButton.js';
import { AppleSignInButton } from '../components/AppleSignInButton.js';

export const AcceptInvite: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { completeOnboarding, loginWithGoogle, loginWithMicrosoft, loginWithApple } = useAuth();

  const [name, setName]           = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErr, setFieldErr]   = useState<{ name?: string; password?: string; confirm?: string }>({});
  const [loading, setLoading]     = useState(false);
  // Full-SSO alternative to the typed-password form below — same
  // Google/Microsoft/Apple identity verification the signup wizard uses,
  // scoped to this exact invite token server-side (see
  // acceptHrInviteForFederatedIdentity). The password form stays: not every
  // invitee has signed in anywhere with these yet, and there's no reason to
  // force the choice.
  const handleFederatedResult = (res: Awaited<ReturnType<typeof loginWithGoogle>>) => {
    if ('join_request' in res || 'signup_ticket' in res) return; // never returned for this call shape
    // loginWithGoogle/Microsoft/Apple already set the session cookie and
    // local user state via completeLogin() — nothing left to do but land
    // in the workspace, same as any other successful sign-in.
    navigate('/nexushr');
  };
  const handleFederatedError = (err: any) => setError(err.message || 'Could not verify that account for this invitation.');
  const handleGoogleCredential = (credential: string) => {
    setError(null); setLoading(true);
    loginWithGoogle(credential, false, false, token).then(handleFederatedResult).catch(handleFederatedError).finally(() => setLoading(false));
  };
  const handleMicrosoftCredential = (credential: string) => {
    setError(null); setLoading(true);
    loginWithMicrosoft(credential, false, false, token).then(handleFederatedResult).catch(handleFederatedError).finally(() => setLoading(false));
  };
  const handleAppleCredential = (credential: string, appleName?: string) => {
    setError(null); setLoading(true);
    loginWithApple(credential, appleName, false, false, token).then(handleFederatedResult).catch(handleFederatedError).finally(() => setLoading(false));
  };

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
      <AuthCard>
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
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="auth-form-hdr">
        <h2 className="auth-form-title">Set up your account</h2>
        <p className="auth-form-sub">You've been invited to join Hudumika. Choose your name and a password to get started.</p>
      </div>

      {error && <AuthAlert message={error} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <GoogleSignInButton onCredential={handleGoogleCredential} onError={handleFederatedError} />
        <MicrosoftSignInButton onCredential={handleMicrosoftCredential} onError={handleFederatedError} />
        <AppleSignInButton onCredential={handleAppleCredential} onError={handleFederatedError} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px', color: 'var(--ink3, #94a3b8)', fontSize: 13 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border, #e2e8f0)' }} />
        or set a password instead
        <div style={{ flex: 1, height: 1, background: 'var(--border, #e2e8f0)' }} />
      </div>

      <form onSubmit={handleSubmit} noValidate className="auth-form">
        <AuthField label="Full name" error={fieldErr.name}>
          <input data-ui-field="input"
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
            <input data-ui-field="input"
              type={showPass ? 'text' : 'password'}
              className={`auth-input auth-input-icon-r${fieldErr.password ? ' auth-input-err' : ''}`}
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
              autoComplete="new-password"
            />
            <button type="button" className="auth-eye-btn" aria-label={showPass ? 'Hide password' : 'Show password'} onClick={() => setShowPass(p => !p)} tabIndex={-1} data-ui-native-button="">
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </div>
        </AuthField>

        <AuthField label="Confirm password" error={fieldErr.confirm}>
          <input data-ui-field="input"
            type={showPass ? 'text' : 'password'}
            className={`auth-input${fieldErr.confirm ? ' auth-input-err' : ''}`}
            placeholder="Re-enter password"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setFieldErr(p => ({ ...p, confirm: undefined })); }}
            autoComplete="new-password"
          />
        </AuthField>

        <button type="submit" disabled={loading} className="auth-btn-primary" data-ui-native-button="">
          {loading ? <><span className="auth-spinner" /> Creating account…</> : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
};

export default AcceptInvite;
