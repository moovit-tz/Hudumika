// ─── MagicLinkPage.tsx — public, unauthenticated ───────────────────
// The landing page for an emailed sign-in link (?token=…), consumed
// automatically on load (POST /v1/ondi/auth/magic-link/verify). An account
// with TOTP enabled gets a code prompt instead of an instant session, same
// as /auth/login's own requires_2fa shape.
//
// This page only ever *lands* a click from an email — the form that
// requests a link in the first place lives as a tab on /ondi/login
// (OndiLogin.tsx), alongside its sibling passwordless mechanisms
// (phone code, authenticator, passkey), not duplicated here.
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { AuthBrand, AuthAlert, AuthField } from './Login.js';

function TokenStage({ token }: { token: string }) {
  const { verifyMagicLink } = useAuth();
  const navigate = useNavigate();
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function attempt(code?: string) {
    setError(null); setLoading(true);
    try {
      const res = await verifyMagicLink(token, code);
      if ('requires_2fa' in res) {
        setNeedsTotp(true);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'This sign-in link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  // Attempt once automatically on load — the whole point of a magic link is
  // that clicking it is the only step, for the (majority) case with no TOTP.
  useEffect(() => { attempt(); }, [token]);

  if (needsTotp) {
    return (
      <>
        <div className="auth-form-hdr">
          <div className="auth-back-icon"><Icon name="shield" size={22} strokeWidth={1.5} /></div>
          <h2 className="auth-form-title">Enter your authenticator code</h2>
          <p className="auth-form-sub">This account has two-factor authentication enabled — the link alone isn't enough.</p>
        </div>
        {error && <AuthAlert message={error} />}
        <form onSubmit={ev => { ev.preventDefault(); attempt(totp); }} noValidate className="auth-form">
          <AuthField label="6-digit code">
            <input type="text" inputMode="numeric" className="auth-input" placeholder="123456" value={totp}
              onChange={e => { setTotp(e.target.value); setError(null); }} autoComplete="one-time-code" autoFocus maxLength={6} />
          </AuthField>
          <button type="submit" disabled={loading || totp.length !== 6} className="auth-btn-primary">
            {loading ? <><span className="auth-spinner" /> Verifying…</> : 'Verify and sign in'}
          </button>
        </form>
      </>
    );
  }

  if (error) {
    return (
      <div className="auth-sent-state">
        <AuthAlert message={error} />
        <Link to="/ondi/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}>Request a new link</Link>
      </div>
    );
  }

  return <p className="auth-form-sub">Signing you in…</p>;
}

export const MagicLinkPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <div className="auth-shell">
      <AuthBrand />
      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          {token ? <TokenStage token={token} /> : (
            <div className="auth-sent-state">
              <div className="auth-sent-icon"><Icon name="zap" size={32} strokeWidth={1.5} /></div>
              <h2 className="auth-form-title">Sign-in link</h2>
              <p className="auth-form-sub" style={{ marginBottom: 24 }}>
                This page is meant to be opened from the link we email you. Request one from the sign-in page.
              </p>
              <Link to="/ondi/login" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Go to sign in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MagicLinkPage;
