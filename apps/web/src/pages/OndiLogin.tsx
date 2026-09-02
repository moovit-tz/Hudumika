import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
import { Icon } from '../components/Icon.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { apiFetch, BASE_URL } from '../lib/api.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.js';
import { MicrosoftSignInButton } from '../components/MicrosoftSignInButton.js';
import './Login.css';
import './OndiLogin.css';

const METHOD_META: Record<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso', { icon: 'phone' | 'shield' | 'fingerprint' | 'mail' | 'building'; label: string }> = {
  'phone':       { icon: 'phone',       label: 'Sign in with a phone code' },
  'totp':        { icon: 'shield',      label: 'Sign in with an authenticator app' },
  'passkey':     { icon: 'fingerprint', label: 'Sign in with a passkey' },
  'magic-link':  { icon: 'mail',        label: 'Sign in with an email link' },
  'company-sso': { icon: 'building',    label: "Sign in with your company's SSO" },
};

const LOGIN_BG_MAP: Record<string, string> = {
  navy: '#0e1f3d', teal: '#0d7a6b',
  gradient: 'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)', white: '#f0f4f9',
};

/**
 * Ondi's own login front door — phone+SMS-code and email+authenticator-code
 * (M1), plus passkey and Google sign-in (M2), all landing on the exact same
 * session /login issues. Reachable at /ondi/login, linked from the main
 * Login page; not yet the default (see ondi-auth.routes.ts's own header
 * comment) — that cutover is a later, separate, reversible milestone.
 * Google's button renders itself only when a real OAuth client is
 * configured (see GoogleSignInButton.tsx); passkey login only works for an
 * account that has already registered one from Workspace ▸ Security.
 */
export const OndiLogin: React.FC = () => {
  const { requestOtpLogin, verifyOtpLogin, loginWithTotp, requestMagicLink, requestPasskeyLoginOptions, verifyPasskeyLogin, loginWithGoogle, loginWithMicrosoft } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();

  // Was `const [theme] = useState(...)` with no setter — the toggle button
  // below called toggleThemeWithAnimation directly (only ever meant for
  // components that read the theme reactively off document.documentElement,
  // like AppHeader's own MutationObserver), which set documentElement's
  // attribute and the *wrong* localStorage key ('theme', not this page's own
  // 'hudumika_login_theme') but never updated this component's local state —
  // so the button visibly did nothing to this page, while the stray
  // documentElement attribute it left behind could bleed into a handful of
  // elements through unscoped [data-theme="dark"] CSS selectors (see
  // Login.css's own comments on that). Login.tsx/OnboardingWizard.tsx
  // already had the correct, working version of this same block.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hudumika_login_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { localStorage.setItem('hudumika_login_theme', theme); }, [theme]);
  const isDark = theme === 'dark';
  const pageBg = isDark ? '#131314' : (LOGIN_BG_MAP[branding.loginBgStyle] ?? '#f0f4f9');
  const isBgDark = !isDark && branding.loginBgStyle !== 'white';
  const accent = branding.accentColor;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const d = isDark, b = isBgDark;
    el.style.setProperty('--lp-bg', pageBg);
    el.style.setProperty('--lp-accent', accent);
    el.style.setProperty('--lp-card-bg', d ? '#1e1e1f' : '#fff');
    el.style.setProperty('--lp-card-border', d ? '#3c4043' : '#e0e2e6');
    el.style.setProperty('--lp-card-shadow', b ? '0 8px 32px rgba(0,0,0,0.28)' : 'none');
    el.style.setProperty('--lp-ink', d ? '#e3e3e3' : '#1f1f1f');
    el.style.setProperty('--lp-ink2', d ? '#c4c7c5' : '#444746');
    el.style.setProperty('--lp-ink3', d ? '#9aa0a6' : '#5f6368');
    // Lighter than --lp-card-bg (#1e1e1f), not a reuse of the page-level
    // near-black (#131314) — an input darker than the card it sits in
    // reads as a hole punched through the card rather than a field on it.
    el.style.setProperty('--lp-input-bg', d ? '#2a2a2d' : '#fff');
    el.style.setProperty('--lp-input-border', d ? '#8e918f' : '#747775');
    // Segmented tabs background & active tab properties
    el.style.setProperty('--lp-tabs-bg', d ? '#131314' : '#f1f3f4');
    el.style.setProperty('--lp-tabs-border', d ? '#2a2a2d' : '#e0e2e6');
    el.style.setProperty('--lp-tab-active-bg', d ? '#2a2a2d' : '#fff');
    el.style.setProperty('--lp-tab-active-color', d ? '#e3e3e3' : '#1f1f1f');
    el.style.setProperty('--lp-tab-active-shadow', d ? 'none' : '0 1.5px 3px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)');
    // Used by the segmented-tab track/active-pill border — without this,
    // dark mode fell through to the light-mode CSS fallback (#e0e2e6) and
    // drew a near-white ring around the tabs on an otherwise dark page.
    el.style.setProperty('--lp-list-border', d ? '#3c4043' : '#e0e2e6');
    el.style.setProperty('--lp-toggle-border', d ? '#3c4043' : b ? 'rgba(255,255,255,0.25)' : '#e0e2e6');
    el.style.setProperty('--lp-toggle-bg', d ? '#1e1e1f' : b ? 'rgba(255,255,255,0.12)' : '#fff');
    el.style.setProperty('--lp-toggle-color', d ? '#e3e3e3' : b ? '#fff' : '#444746');
    // The tenant's raw accent has no contrast guarantee (see Login.tsx's
    // identical comment) — used as literal link text below, it can be
    // nearly invisible on the dark card when the accent itself is dark.
    el.style.setProperty('--lp-link-accent', d ? '#8ab4f8' : accent);
    el.style.setProperty('--lp-error-bg', d ? '#2c1e1e' : '#fdf2f2');
    el.style.setProperty('--lp-error-border', d ? '#4b2e2e' : '#fde2e2');
    el.style.setProperty('--lp-error-text', d ? '#fca5a5' : '#c2410c');
  }, [isDark, isBgDark, pageBg, accent]);

  const [mode, setMode] = useState<'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso'>('phone');

  // Phone + OTP
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Email + authenticator
  const [email, setEmail] = useState('');
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
  // has no JS context of its own to show an error from). Same "drop the
  // marker once consumed" pattern as Login.tsx's own ?expired=.
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

  const submitTotp = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!email.trim() || totpCode.trim().length !== 6) { setError('Enter your email and 6-digit code.'); return; }
    setError(null); setLoading(true);
    try {
      await loginWithTotp(email.trim(), totpCode.trim());
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid email or code.');
    } finally { setLoading(false); }
  };

  const switchMode = (next: 'phone' | 'totp' | 'passkey' | 'magic-link' | 'company-sso') => {
    setMode(next); setError(null); setInfo(null);
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

  const handleGoogleCredential = async (credential: string) => {
    setError(null); setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Could not sign in with Google.');
    } finally { setLoading(false); }
  };

  const handleMicrosoftCredential = async (credential: string) => {
    setError(null); setLoading(true);
    try {
      await loginWithMicrosoft(credential);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Could not sign in with Microsoft.');
    } finally { setLoading(false); }
  };

  return (
    <div ref={rootRef} className="login-page ondi-login" data-theme={theme}>
      <button
        type="button"
        onClick={e => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          toggleThemeWithAnimation(e, next === 'dark');
        }}
        className="login-toggle"
        title="Toggle theme"
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} />
      </button>

      <div className="login-card">
        <div className="login-brand-hdr">
          <img
            src={isDark ? '/ondi-logo-full-white.svg' : '/ondi-logo-full.svg'}
            alt="Ondi"
            className="ondi-logo-full"
          />
          <div className="login-header-left">
            <span className="ondi-eyebrow"><Icon name="shield" size={11} /> Passwordless</span>
            <h1 className="login-headline">Sign in</h1>
            <p className="login-subtext">Your Hudumika identity — no password needed.</p>
          </div>
        </div>

        <div>
          <div className="ondi-method-row">
            {(Object.keys(METHOD_META) as Array<keyof typeof METHOD_META>).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => switchMode(key)}
                className={`ondi-method-btn${mode === key ? ' ondi-method-btn--active' : ''}`}
                title={METHOD_META[key].label}
                aria-label={METHOD_META[key].label}
                aria-pressed={mode === key}
              >
                <Icon name={METHOD_META[key].icon} size={17} />
              </button>
            ))}
          </div>
          <div className="ondi-method-caption">{METHOD_META[mode].label}</div>
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} />
        <MicrosoftSignInButton onCredential={handleMicrosoftCredential} onError={setError} />

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
          <form onSubmit={submitTotp} noValidate className="login-form">
            <div className="login-field">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="login-input"
                autoComplete="username"
                disabled={loading}
              />
            </div>
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
              />
            </div>
            <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full">
              {loading ? 'Please wait…' : 'Verify & sign in'}
            </button>
          </form>
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

        <p className="login-create-p">
          <Link to="/login" className="login-create-link">Sign in with password instead</Link>
        </p>
      </div>
    </div>
  );
};

export default OndiLogin;
