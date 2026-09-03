// ─── RecoveryPage.tsx — public, unauthenticated ───────────────────
// Ondi feature-gap pass (M4): the "I lost my password AND my email" path —
// mutual-consent recovery via a trusted contact instead of an email link.
// Two stages on one page, switched by the presence of ?token=:
//   1. No token: enter your account email, we notify your accepted
//      recovery contacts (auth.routes.ts POST /auth/recovery/request).
//   2. ?token=…: this IS the link a contact would share back (or the one
//      the requester bookmarked) — shows live status, and once a contact
//      has approved AND the cooldown has elapsed, a "set a new password"
//      form (POST /auth/recovery/complete).
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { AuthCard, AuthAlert, AuthField } from './Login.js';

function RequestStage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    setError(null); setLoading(true);
    try {
      await apiFetch('/auth/recovery/request', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err: any) { setError(err.message || 'Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  }

  if (sent) {
    return (
      <div className="auth-sent-state">
        <div className="auth-sent-icon"><Icon name="userCheck" size={32} strokeWidth={1.5} /></div>
        <h2 className="auth-form-title">Request sent</h2>
        <p className="auth-form-sub" style={{ marginBottom: 24 }}>
          If <strong>{email}</strong> has recovery contacts set up, they've each been emailed asking to vouch for you. Once one of them approves, there's a 24-hour cooldown before you can set a new password — check back on this page, or the link they send you.
        </p>
        <Link to="/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Back to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <div className="auth-form-hdr">
        <h2 className="auth-form-title">Recover via a trusted contact</h2>
        <p className="auth-form-sub">Lost your password and can't access your email either? A colleague you've named as a recovery contact can vouch for you instead.</p>
      </div>
      {error && <AuthAlert message={error} />}
      <form onSubmit={submit} noValidate className="auth-form">
        <AuthField label="Your account email">
          <input type="email" className="auth-input" placeholder="you@company.com" value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }} autoComplete="email" autoFocus />
        </AuthField>
        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? <><span className="auth-spinner" /> Sending…</> : 'Notify my recovery contacts'}
        </button>
      </form>
      <p className="auth-switch-link">
        Still have email access? <Link to="/auth/forgot-password" className="auth-link">Reset by email instead</Link>
      </p>
    </>
  );
}

interface RecoveryStatus { status: string; cooldownEndsAt: string | null; readyToComplete: boolean }

function TokenStage({ token }: { token: string }) {
  const [status, setStatus] = useState<RecoveryStatus | null | 'not_found'>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await apiFetch(`/auth/recovery/status/${encodeURIComponent(token)}`);
        if (!cancelled) setStatus(res);
      } catch { if (!cancelled) setStatus('not_found'); }
    }
    poll();
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(null); setLoading(true);
    try {
      await apiFetch('/auth/recovery/complete', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err: any) { setError(err.message || 'Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="auth-sent-state">
        <div className="auth-sent-icon"><Icon name="checkCircle" size={32} strokeWidth={1.5} /></div>
        <h2 className="auth-form-title">Password updated</h2>
        <p className="auth-form-sub" style={{ marginBottom: 24 }}>You can now sign in with your new password.</p>
        <Link to="/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Sign in</Link>
      </div>
    );
  }

  if (status === null) return <p className="auth-form-sub">Checking status…</p>;
  if (status === 'not_found') return <AuthAlert message="This recovery link is invalid or has expired." />;

  if (status.status === 'completed') return <AuthAlert message="This recovery has already been completed." />;
  if (status.status === 'cancelled') return <AuthAlert message="This recovery request was cancelled — the account holder signed in normally before it took effect." />;
  if (status.status === 'declined') return <AuthAlert message="Your recovery contact declined this request." />;

  if (status.status === 'pending') {
    return (
      <div className="auth-sent-state">
        <div className="auth-sent-icon"><Icon name="clock" size={32} strokeWidth={1.5} /></div>
        <h2 className="auth-form-title">Waiting for approval</h2>
        <p className="auth-form-sub">Your recovery contact hasn't responded yet. This page checks automatically — no need to refresh.</p>
      </div>
    );
  }

  if (status.status === 'approved' && !status.readyToComplete) {
    return (
      <div className="auth-sent-state">
        <div className="auth-sent-icon"><Icon name="clock" size={32} strokeWidth={1.5} /></div>
        <h2 className="auth-form-title">Approved — cooldown in progress</h2>
        <p className="auth-form-sub">
          Your contact approved this request. As a safeguard, it takes effect at{' '}
          <strong>{status.cooldownEndsAt ? new Date(status.cooldownEndsAt).toLocaleString() : '—'}</strong>. If this wasn't really you, the real account holder can cancel it just by signing in normally in the meantime.
        </p>
      </div>
    );
  }

  // approved && readyToComplete
  return (
    <>
      <div className="auth-form-hdr">
        <h2 className="auth-form-title">Set a new password</h2>
        <p className="auth-form-sub">Your recovery contact approved this, and the cooldown has passed.</p>
      </div>
      {error && <AuthAlert message={error} />}
      <form onSubmit={submit} noValidate className="auth-form">
        <AuthField label="New password">
          <input type="password" className="auth-input" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </AuthField>
        <AuthField label="Confirm new password">
          <input type="password" className="auth-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </AuthField>
        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? <><span className="auth-spinner" /> Saving…</> : 'Set new password'}
        </button>
      </form>
    </>
  );
}

export const RecoveryPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <AuthCard>
      {token ? <TokenStage token={token} /> : <RequestStage />}
    </AuthCard>
  );
};

export default RecoveryPage;
