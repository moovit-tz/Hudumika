import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from './Icon.js';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { MicrosoftSignInButton } from './MicrosoftSignInButton.js';
import { Tip } from './ui/tooltip.js';

const METHOD_META: Record<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso', { icon: 'phone' | 'shield' | 'fingerprint' | 'mail' | 'building'; label: string }> = {
  'phone':       { icon: 'phone',       label: 'Sign in with a phone code' },
  'totp':        { icon: 'shield',      label: 'Sign in with an authenticator app' },
  'passkey':     { icon: 'fingerprint', label: 'Sign in with a passkey' },
  'magic-link':  { icon: 'mail',        label: 'Sign in with an email link' },
  'company-sso': { icon: 'building',    label: "Sign in with your company's SSO" },
};

// Off for now, by request — the plan is to bring passkey sign-in back once
// it can be offered platform-wide (every app's own login, not just Ondi's),
// rather than only here. The whole flow underneath (submitPasskey,
// requestPasskeyLoginOptions/verifyPasskeyLogin in useAuth.tsx, the real
// WebAuthn ceremony) is untouched — this only hides the entry point, so
// flipping it back to `true` is the entire re-enable.
const PASSKEY_LOGIN_ENABLED = false;
// Same story, same pattern — off until needed. sendMagicLink,
// requestMagicLink in useAuth.tsx, and the real /v1/ondi/auth/magic-link/*
// backend are all untouched; only this entry point is hidden.
const MAGIC_LINK_LOGIN_ENABLED = false;
const VISIBLE_METHODS = (Object.keys(METHOD_META) as Array<keyof typeof METHOD_META>)
  .filter(key => key !== 'passkey' || PASSKEY_LOGIN_ENABLED)
  .filter(key => key !== 'magic-link' || MAGIC_LINK_LOGIN_ENABLED);
// Phone is its own primary pill (the idle view's second CTA, alongside
// Google), not one more icon in the secondary row below. Always non-empty:
// totp and company-sso are unconditional members of METHOD_META, never
// gated by the two ENABLED flags above.
const SECONDARY_METHODS = VISIBLE_METHODS.filter(key => key !== 'phone');

/**
 * Ondi's actual method picker and sign-in forms — Google/phone pills, the
 * "more ways to sign in" reveal (authenticator/company SSO/Microsoft), and
 * every mode's form (phone+OTP, email+authenticator-code, passkey, magic
 * link, company SSO). Pulled out of OndiLogin.tsx (the dedicated /ondi/login
 * page) so the *identical* picker can also render inline — as the "Ondi" tab
 * on the plain Login page, and on signup's own Details/Ondi choice — without
 * three copies of this state machine drifting apart. Only the page-level
 * chrome (theme toggle, the centered icon/headline, the closing "sign in
 * with password instead" links) stays with each host; this component is
 * just the picker + its own error/info feedback.
 *
 * Fully self-contained: no props. Every mode lands on the same session
 * /auth/login issues and always finishes by navigating to '/', regardless
 * of which page is currently hosting it.
 */
export function OndiSignInPanel() {
  const { login, requestOtpLogin, verifyOtpLogin, requestMagicLink, requestPasskeyLoginOptions, verifyPasskeyLogin, loginWithGoogle, loginWithMicrosoft } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // null = the idle "choose how to sign in" view (the two pills); set once
  // a method is actually picked.
  const [mode, setMode] = useState<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso' | null>(null);
  const [showMoreMethods, setShowMoreMethods] = useState(false);

  // Phone + OTP
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Email + authenticator (real password+authenticator-code 2FA — the same
  // /auth/login mechanism the plain password Login page uses, not a
  // separate passwordless check. See submitTotpCredentials below.)
  const [email, setEmail] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [showTotpPassword, setShowTotpPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Passkey
  const [passkeyEmail, setPasskeyEmail] = useState('');

  // Email magic link
  const [magicEmail, setMagicEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Company SSO (SAML)
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoChecking, setSsoChecking] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ondi-saml.routes.ts's /acs redirects failures here as ?samlError=1 (it
  // has no JS context of its own to show an error from) — only ever present
  // when this panel is hosted on /ondi/login, but harmless to check
  // regardless of host. Same "drop the marker once consumed" pattern as
  // Login.tsx's own ?expired=.
  useEffect(() => {
    if (searchParams.get('samlError')) {
      setMode('company-sso');
      setError("Your company sign-on didn't complete. Try again, or check with your IT administrator.");
      setSearchParams(params => { params.delete('samlError'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCode = async () => {
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    setError(null); setInfo(null); setLoading(true);
    try {
      const res = await requestOtpLogin(phone.trim());
      setOtpSent(true);
      setInfo(res.message || 'A sign-in code was sent by SMS.');
      setResendIn(30);
    } catch (err: any) {
      setError(err.message || 'Could not send the code. Try again.');
    } finally { setLoading(false); }
  };

  const submitOtp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (otpCode.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError(null); setLoading(true);
    try {
      await verifyOtpLogin(phone.trim(), otpCode.trim());
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  // Real password+authenticator-code 2FA — the exact same /auth/login
  // mechanism (useAuth's login()) the plain password Login page uses, not
  // a separate passwordless TOTP check. Step 1 is credentials; the code
  // step only appears once the server actually confirms this account has
  // 2FA enabled (requires_2fa) — asking for a code upfront on every
  // account would leak who has 2FA turned on before a password is even
  // checked. An account with no 2FA enabled at all just signs straight in
  // after step 1, same as the plain password form.
  const [totpStep, setTotpStep] = useState<'credentials' | 'code'>('credentials');

  const submitTotpCredentials = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!email.trim() || !totpPassword) { setError('Enter your email and password.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await login(email.trim(), totpPassword);
      if ('requires_2fa' in res) { setTotpStep('code'); return; }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally { setLoading(false); }
  };

  const submitTotp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (totpCode.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await login(email.trim(), totpPassword, totpCode.trim());
      if ('requires_2fa' in res) { setError('Invalid code. Try again.'); return; }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  const switchMode = (next: 'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso' | null) => {
    setMode(next); setError(null); setInfo(null); setTotpStep('credentials'); setTotpPassword('');
  };

  const checkCompanySso = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ssoEmail.trim()) { setError('Enter your work email.'); return; }
    setError(null); setInfo(null); setSsoChecking(true);
    try {
      const res = await apiFetch(`/v1/ondi/auth/saml/lookup?email=${encodeURIComponent(ssoEmail.trim())}`);
      if (res.found) {
        // A real cross-origin navigation to the IdP, not a fetch — SAML
        // can't be driven through the SPA's own request layer.
        window.location.href = `${BASE_URL}/v1/ondi/auth/saml/${res.providerId}/login`;
      } else {
        setError('No company sign-on found for that email. Check with your IT administrator, or use another sign-in method.');
        setSsoChecking(false);
      }
    } catch (err: any) {
      setError(err.message || 'Could not look up your company sign-on. Try again.');
      setSsoChecking(false);
    }
  };

  const sendMagicLink = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!magicEmail.trim()) { setError('Enter your email.'); return; }
    setError(null); setInfo(null); setLoading(true);
    try {
      const res = await requestMagicLink(magicEmail.trim());
      setMagicLinkSent(true);
      setInfo(res.message || 'If that email is registered, a sign-in link has been sent.');
    } catch (err: any) {
      setError(err.message || 'Could not send the link. Try again.');
    } finally { setLoading(false); }
  };

  const submitPasskey = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!passkeyEmail.trim()) { setError('Enter your email.'); return; }
    setError(null); setLoading(true);
    try {
      const options = await requestPasskeyLoginOptions(passkeyEmail.trim());
      const response = await startAuthentication({ optionsJSON: options });
      await verifyPasskeyLogin(passkeyEmail.trim(), response);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Could not sign in with that passkey.');
    } finally { setLoading(false); }
  };

  // allowJoinRequest=true here (and only here — Login.tsx's own Google tab
  // used to call this login-only) — an email with no matching user but a
  // real domain match gets queued as a join request instead of a bare "no
  // account" error. See createJoinRequestForFederatedIdentity's own header
  // for why that's the only registration case a federated identity can
  // support (never a brand-new tenant with no company/plan/payment behind
  // it).
  const handleFederatedResult = (res: Awaited<ReturnType<typeof loginWithGoogle>>) => {
    if ('join_request' in res) {
      setInfo(`A request to join ${res.join_request.tenant_name} was sent for review. You'll get an email once an admin approves it.`);
      return;
    }
    navigate('/');
  };

  const handleFederatedError = (err: any, provider: 'Google' | 'Microsoft') => {
    if (err?.status === 404 && err?.body?.code === 'NO_MATCHING_WORKSPACE') {
      setError(`No Hudumika workspace found for that ${provider} account. If your company is new here, create a workspace instead.`);
      return;
    }
    setError(err.message || `Could not sign in with ${provider}.`);
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null); setInfo(null); setLoading(true);
    try {
      handleFederatedResult(await loginWithGoogle(credential, true));
    } catch (err: any) {
      handleFederatedError(err, 'Google');
    } finally { setLoading(false); }
  };

  const handleMicrosoftCredential = async (credential: string) => {
    setError(null); setInfo(null); setLoading(true);
    try {
      handleFederatedResult(await loginWithMicrosoft(credential, true));
    } catch (err: any) {
      handleFederatedError(err, 'Microsoft');
    } finally { setLoading(false); }
  };

  return (
    <div className="ondi-panel">
      {mode === null ? (
        <>
          <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} variant="pill" />
          <button type="button" onClick={() => switchMode('phone')} className="ondi-pill ondi-pill--phone">
            <Icon name="phone" size={16} /> Continue with phone number
          </button>

          <button type="button" onClick={() => setShowMoreMethods(s => !s)} className="ondi-more-toggle">
            {showMoreMethods ? 'Fewer options' : 'More ways to sign in'}
            <Icon name={showMoreMethods ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
          {showMoreMethods && (
            <div>
              <div className="ondi-method-row">
                {SECONDARY_METHODS.map(key => (
                  <Tip key={key} label={METHOD_META[key].label}>
                    <button
                      type="button"
                      onClick={() => switchMode(key)}
                      className="ondi-method-btn"
                      aria-label={METHOD_META[key].label}
                    >
                      <Icon name={METHOD_META[key].icon} size={17} />
                    </button>
                  </Tip>
                ))}
              </div>
              <div className="ondi-method-caption">Pick a method above</div>
              {/* Microsoft draws its own real click-handled button (no
                  iframe constraint like Google's), so it needs no pill
                  treatment here — .login-social-btn's existing centered
                  look is enough for a secondary, tucked-away option. */}
              <MicrosoftSignInButton onCredential={handleMicrosoftCredential} onError={setError} />
            </div>
          )}
        </>
      ) : (
        <button type="button" onClick={() => switchMode(null)} className="login-back-btn ondi-form-back">
          <Icon name="chevronLeft" size={14} /> All sign-in options
        </button>
      )}

      {error && (
        <div className="login-error">
          <Icon name="alertCircle" size={16} />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="login-error" style={{ background: 'var(--green-l, #ecfdf5)', borderColor: 'var(--green, #059669)', color: 'var(--green, #059669)' }}>
          <Icon name="checkCircle" size={16} />
          <span>{info}</span>
        </div>
      )}

      {mode === 'phone' && (
        <form onSubmit={otpSent ? submitOtp : (e) => { e.preventDefault(); sendCode(); }} noValidate className="login-form">
          <div className="login-field">
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={e => { setPhone(e.target.value); setOtpSent(false); setOtpCode(''); }}
              className="login-input"
              autoComplete="tel"
              disabled={loading}
            />
          </div>

          {otpSent && (
            <div className="login-field">
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="login-input"
                autoComplete="one-time-code"
                disabled={loading}
              />
            </div>
          )}

          {otpSent ? (
            <div className="login-form-actions">
              <button
                type="button"
                onClick={sendCode}
                disabled={loading || resendIn > 0}
                className="login-back-btn"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="submit" disabled={loading} className="login-submit-btn">
                {loading ? 'Please wait…' : 'Verify & sign in'}
              </button>
            </div>
          ) : (
            <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full">
              {loading ? 'Please wait…' : 'Send code'}
            </button>
          )}
        </form>
      )}

      {mode === 'totp' && (
        totpStep === 'credentials' ? (
          <form onSubmit={submitTotpCredentials} noValidate className="login-form">
            <div className="login-field">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="login-input"
                autoComplete="username"
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="login-field">
              <div className="login-field-pw">
                <input
                  type={showTotpPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={totpPassword}
                  onChange={e => setTotpPassword(e.target.value)}
                  className="login-input"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <Tip label={showTotpPassword ? 'Hide password' : 'Show password'}>
                  <button type="button" onClick={() => setShowTotpPassword(p => !p)} className="login-pw-toggle">
                    <Icon name={showTotpPassword ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </Tip>
              </div>
            </div>
            <button type="submit" disabled={loading || !email.trim() || !totpPassword} className="login-submit-btn login-submit-btn--full">
              {loading ? 'Please wait…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitTotp} noValidate className="login-form">
            <div className="login-field">
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit authenticator code"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="login-input"
                autoComplete="one-time-code"
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="login-form-actions">
              <button
                type="button"
                onClick={() => { setTotpStep('credentials'); setTotpCode(''); setTotpPassword(''); setError(null); }}
                disabled={loading}
                className="login-back-btn"
              >
                Back
              </button>
              <button type="submit" disabled={loading} className="login-submit-btn">
                {loading ? 'Please wait…' : 'Verify & sign in'}
              </button>
            </div>
          </form>
        )
      )}

      {mode === 'passkey' && (
        <form onSubmit={submitPasskey} noValidate className="login-form">
          <div className="login-field">
            <input
              type="email"
              placeholder="Email"
              value={passkeyEmail}
              onChange={e => setPasskeyEmail(e.target.value)}
              className="login-input"
              autoComplete="username webauthn"
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full">
            {loading ? 'Please wait…' : 'Continue with passkey'}
          </button>
        </form>
      )}

      {mode === 'magic-link' && (
        magicLinkSent ? (
          <div className="login-form">
            <p className="login-subtext" style={{ textAlign: 'center' }}>
              Check <strong>{magicEmail}</strong> for a one-click sign-in link. It expires in 15 minutes and works once.
            </p>
            <button
              type="button"
              onClick={() => { setMagicLinkSent(false); setInfo(null); }}
              className="login-back-btn"
              style={{ margin: '0 auto' }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} noValidate className="login-form">
            <div className="login-field">
              <input
                type="email"
                placeholder="Email"
                value={magicEmail}
                onChange={e => setMagicEmail(e.target.value)}
                className="login-input"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full">
              {loading ? 'Please wait…' : 'Send sign-in link'}
            </button>
          </form>
        )
      )}

      {mode === 'company-sso' && (
        <form onSubmit={checkCompanySso} noValidate className="login-form">
          <div className="login-field">
            <input
              type="email"
              placeholder="you@yourcompany.com"
              value={ssoEmail}
              onChange={e => setSsoEmail(e.target.value)}
              className="login-input"
              autoComplete="username"
              disabled={ssoChecking}
            />
          </div>
          <button type="submit" disabled={ssoChecking} className="login-submit-btn login-submit-btn--full">
            {ssoChecking ? 'Redirecting…' : 'Continue'}
          </button>
        </form>
      )}
    </div>
  );
}

export default OndiSignInPanel;
