import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useCompany } from '../data/companyStore.js';
import { Icon } from '../components/Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { getOndiConfig } from '../lib/ondiConfig.js';
import { GoogleSignInButton } from '../components/GoogleSignInButton.js';
import { MicrosoftSignInButton } from '../components/MicrosoftSignInButton.js';
import { OndiLogo } from '../components/OndiLogo.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import './Login.css';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin',    email: 'viden@hudumika.tz' },
  { role: 'Tenant Admin',   email: 'admin@msomi.co' },
  { role: 'Manager',        email: 'manager@msomi.co' },
  { role: 'Finance',        email: 'finance@msomi.co' },
  { role: 'Senior Officer', email: 'senior@msomi.co' },
];

const LOGIN_BG_MAP: Record<string, string> = {
  navy:     '#0e1f3d',
  teal:     '#0d7a6b',
  gradient: 'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)',
  white:    '#f0f4f9',
};

export const Login: React.FC = () => {
  const { login, loginWithGoogle, loginWithMicrosoft } = useAuth();
  const navigate  = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rootRef   = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage, LANGUAGES } = useLocale();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hudumika_login_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => { localStorage.setItem('hudumika_login_theme', theme); }, [theme]);

  // Drop the ?expired=1 marker from the URL once consumed so a page refresh doesn't re-show it.
  useEffect(() => {
    if (searchParams.get('expired')) {
      setSearchParams(params => { params.delete('expired'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [error, setError]             = useState<string | null>(
    searchParams.get('expired') ? 'Your session has expired. Please log in again.' : null
  );
  const [fieldErr, setFieldErr]       = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading]         = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const [method, setMethod] = useState<'password' | 'google' | 'microsoft'>('password');

  // Which sign-in methods actually exist for this platform — Password is
  // always available; Google/Microsoft only once GET /v1/ondi/auth/config
  // reports a real client ID (see GoogleSignInButton/MicrosoftSignInButton's
  // own identical self-hiding rule). Drives both the method-tab row (hidden
  // entirely when Password is the only option) and which panel renders.
  useEffect(() => {
    getOndiConfig().then(res => setProviders({ google: !!res.google_client_id, microsoft: !!res.microsoft_client_id })).catch(() => {});
  }, []);

  const methods: Array<{ key: typeof method; label: string; icon: React.ReactNode }> = [
    { key: 'password', label: 'Password', icon: <Icon name="lock" size={14} /> },
    ...(providers.google ? [{ key: 'google' as const, label: 'Google', icon: <GoogleGlyph /> }] : []),
    ...(providers.microsoft ? [{ key: 'microsoft' as const, label: 'Microsoft', icon: <MicrosoftGlyph /> }] : []),
  ];

  const branding = useBranding();
  const isDark   = theme === 'dark';
  const logo     = isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight;
  const pageBg   = isDark ? '#131314' : (LOGIN_BG_MAP[branding.loginBgStyle] ?? '#f0f4f9');
  const isBgDark = !isDark && branding.loginBgStyle !== 'white';
  const accent   = branding.accentColor;

  /* Sync all dynamic values as CSS custom properties on the root element */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const d = isDark, b = isBgDark;
    el.style.setProperty('--lp-bg',              pageBg);
    el.style.setProperty('--lp-accent',          accent);
    el.style.setProperty('--lp-use-other-hover', `${accent}15`);
    el.style.setProperty('--lp-card-bg',         d ? '#1e1e1f'                     : '#fff');
    el.style.setProperty('--lp-card-border',     d ? '#3c4043'                     : '#e0e2e6');
    el.style.setProperty('--lp-card-shadow',     b ? '0 8px 32px rgba(0,0,0,0.28)': 'none');
    el.style.setProperty('--lp-ink',             d ? '#e3e3e3'                     : '#1f1f1f');
    el.style.setProperty('--lp-ink2',            d ? '#c4c7c5'                     : '#444746');
    el.style.setProperty('--lp-ink3',            d ? '#9aa0a6'                     : '#5f6368');
    // Lighter than --lp-card-bg (#1e1e1f), not a reuse of the page-level
    // near-black (#131314) — an input darker than the card it sits in
    // reads as a hole punched through the card rather than a field on it.
    el.style.setProperty('--lp-input-bg',        d ? '#2a2a2d'                     : '#fff');
    el.style.setProperty('--lp-input-border',    d ? '#8e918f'                     : '#747775');
    // Segmented tabs background & active tab properties
    el.style.setProperty('--lp-tabs-bg',         d ? '#131314'                     : '#f1f3f4');
    el.style.setProperty('--lp-tabs-border',     d ? '#2a2a2d'                     : '#e0e2e6');
    el.style.setProperty('--lp-tab-active-bg',   d ? '#2a2a2d'                     : '#fff');
    el.style.setProperty('--lp-tab-active-color', d ? '#e3e3e3'                     : '#1f1f1f');
    el.style.setProperty('--lp-tab-active-shadow', d ? 'none' : '0 1.5px 3px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)');
    el.style.setProperty('--lp-row-bg',          d ? '#1e1e1f'                     : '#fff');
    el.style.setProperty('--lp-row-border',      d ? '#303134'                     : '#f0f2f5');
    el.style.setProperty('--lp-list-border',     d ? '#3c4043'                     : '#e0e2e6');
    el.style.setProperty('--lp-toggle-border',   d ? '#3c4043'  : b ? 'rgba(255,255,255,0.25)' : '#e0e2e6');
    el.style.setProperty('--lp-toggle-bg',       d ? '#1e1e1f'  : b ? 'rgba(255,255,255,0.12)' : '#fff');
    el.style.setProperty('--lp-toggle-color',    d ? '#e3e3e3'  : b ? '#fff'                   : '#444746');
    el.style.setProperty('--lp-page-text',       b ? 'rgba(255,255,255,0.65)' : d ? '#9aa0a6'  : '#5f6368');
    el.style.setProperty('--lp-page-link',       b ? 'rgba(255,255,255,0.85)' : d ? 'rgba(255,255,255,0.7)' : '#5f6368');
    el.style.setProperty('--lp-error-bg',        d ? '#2c1e1e' : '#fdf2f2');
    el.style.setProperty('--lp-error-border',    d ? '#4b2e2e' : '#fde2e2');
    el.style.setProperty('--lp-error-text',      d ? '#fca5a5' : '#c2410c');
    // The tenant's raw accent has no contrast guarantee (same issue as --teal
    // platform-wide — see CLAUDE.md) — it reads fine as the submit button's
    // fill (contrast is against white button text) but as literal link text
    // on the dark card it can be nearly invisible when the accent itself is
    // a dark tone. Google's own dark-mode link blue is a safe, on-theme
    // fallback for text specifically; the accent still drives the button.
    el.style.setProperty('--lp-link-accent',     d ? '#8ab4f8' : accent);
  }, [isDark, isBgDark, pageBg, accent]);

  const validate = () => {
    const e: typeof fieldErr = {};
    if (!email) e.email = t('login.enterEmail');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('login.enterValidEmail');
    if (!password) e.password = t('login.enterPassword');
    setFieldErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (err: any) { setError(err.message || 'Invalid email or password. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    if (loading || demoLoadingEmail) return;
    setError(null);
    setDemoLoadingEmail(demoEmail);
    try { await login(demoEmail, 'password123'); navigate('/'); }
    catch (err: any) { setError(err.message || 'Failed to login with demo account.'); }
    finally { setDemoLoadingEmail(null); }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setLoading(true);
    try { await loginWithGoogle(credential); navigate('/'); }
    catch (err: any) { setError(err.message || 'Could not sign in with Google.'); }
    finally { setLoading(false); }
  };

  const handleMicrosoftCredential = async (credential: string) => {
    setError(null);
    setLoading(true);
    try { await loginWithMicrosoft(credential); navigate('/'); }
    catch (err: any) { setError(err.message || 'Could not sign in with Microsoft.'); }
    finally { setLoading(false); }
  };

  return (
    <div ref={rootRef} className="login-page" data-theme={theme}>

      <button
        type="button"
        onClick={e => {
          const next = theme === 'light' ? 'dark' : 'light';
          setTheme(next);
          toggleThemeWithAnimation(e, next === 'dark');
        }}
        className="login-toggle"
        title={t('login.toggleTheme')}
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={18} />
      </button>

      <div className="login-card">

        {/* Brand Header — logo only; headline/subtext moved below the
            Sign in / Sign up toggle so they can read left-aligned. */}
        <div className="login-brand-hdr">
          <div className="login-brand-row">
            {logo ? (
              <img src={logo} alt={branding.platformName} className="g-brand-logo-img" />
            ) : (
              <>
                <div className="g-brand-grid">
                  <div className="g-brand-sq g-brand-sq--r" />
                  <div className="g-brand-sq g-brand-sq--b" />
                  <div className="g-brand-sq g-brand-sq--y" />
                  <div className="g-brand-sq g-brand-sq--g" />
                </div>
                <span className="g-brand-name">{branding.platformName}</span>
              </>
            )}
          </div>
        </div>

        {/* Sign in / Sign up — Sign up isn't rebuilt in-card since /signup
            is already a real, dedicated multi-step registration flow
            (OnboardingWizard); this pill just navigates there. */}
        <div className="login-toplevel-tabs">
          <button type="button" className="login-toplevel-tab login-toplevel-tab--active">{t('login.signIn')}</button>
          <button type="button" onClick={() => navigate('/signup')} className="login-toplevel-tab">{t('login.createAccount')}</button>
        </div>

        <div className="login-header-left">
          <h1 className="login-headline">{branding.loginHeadline}</h1>
          <p className="login-subtext">{branding.loginSubtext}</p>
        </div>

        {error && (
          <div className="login-error">
            <Icon name="alertCircle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Sign-in method tabs — Google/Microsoft only appear once
            configured (GET /v1/ondi/auth/config), so with neither set up
            this row doesn't render at all and Password is the only path. ── */}
        {methods.length > 1 && (
          <div className="login-method-tabs">
            {methods.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className={`login-method-tab${method === m.key ? ' login-method-tab--active' : ''}`}
              >
                {m.icon}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        )}

        {method === 'google' && (
          <div className="login-method-panel">
            <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} />
          </div>
        )}

        {method === 'microsoft' && (
          <div className="login-method-panel">
            <MicrosoftSignInButton onCredential={handleMicrosoftCredential} onError={setError} />
          </div>
        )}

        {/* ── Credentials Form ── */}
        {method === 'password' && (
        <form onSubmit={handleSubmit} noValidate className="login-form">

          <div className="login-field">
            <label className="login-label" htmlFor="login-email">{t('login.emailAddressLabel')}</label>
            <input
              id="login-email"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={e => { setEmail(e.target.value); setFieldErr(p => ({ ...p, email: undefined })); }}
              className={`login-input${fieldErr.email ? ' login-input--error' : ''}`}
              autoComplete="email"
            />
            {fieldErr.email && (
              <span className="login-field-err">
                <Icon name="alertCircle" size={12} /> {fieldErr.email}
              </span>
            )}
          </div>

          <div className="login-field">
            <div className="login-label-row">
              <label className="login-label" htmlFor="login-password">{t('login.passwordLabel')}</label>
              <Link to="/auth/forgot-password" className="login-forgot-link">{t('login.forgotPassword')}</Link>
            </div>
            <div className="login-field-pw">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
                className={`login-input${fieldErr.password ? ' login-input--error' : ''}`}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="login-pw-toggle" title={showPass ? t('login.hidePassword') : t('login.showPassword')}>
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={16} />
              </button>
            </div>
            {fieldErr.password && (
              <span className="login-field-err">
                <Icon name="alertCircle" size={12} /> {fieldErr.password}
              </span>
            )}
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn login-submit-btn--full">
            {loading ? t('login.signingIn') : t('login.signIn')}
            {!loading && <Icon name="arrowRight" size={14} color="#fff" />}
          </button>
        </form>
        )}

        <div className="login-divider"><span>{t('login.orContinueWith')}</span></div>
        <Link to="/ondi/login" className="login-social-btn">
          <OndiLogo size={18} />
          <span>{t('login.continueWithOndi')}</span>
        </Link>

        {/* ── Demo accounts ── */}
        <div className="login-divider"><span>{t('login.orTryDemo')}</span></div>
        <div className="login-demo-grid">
          {DEMO_ACCOUNTS.map(acc => (
            <button
              key={acc.email}
              type="button"
              title={acc.email}
              onClick={() => handleDemoLogin(acc.email)}
              disabled={loading || !!demoLoadingEmail}
              className="login-demo-btn"
            >
              {demoLoadingEmail === acc.email
                ? <span className="auth-spinner" />
                : <Icon name="user" size={14} />
              }
              <span>{acc.role}</span>
            </button>
          ))}
        </div>

      </div>

      <div className="login-footer">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="login-lang-trigger">
              <Icon name="globe" size={13} />
              {LANGUAGES.find(l => l.code === language)?.nativeLabel ?? 'English'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {LANGUAGES.map(l => (
              <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)} className="cursor-pointer gap-3">
                <span className="text-base">{l.flag}</span>
                <span className="flex-1">{l.nativeLabel}</span>
                {language === l.code && <Icon name="check" size={14} />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="login-footer-links">
          <Link to="/support-ticket" className="login-footer-link">{t('login.help')}</Link>
          <Link to="/privacy" className="login-footer-link">{t('login.privacy')}</Link>
          <Link to="/terms" className="login-footer-link">{t('login.terms')}</Link>
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
      <div className="auth-brand-logo">
        {co.logoUrl && <img src={co.logoUrl} alt={co.name} />}
      </div>
    </div>
  );
}

export function AuthAlert({ message }: { message: string }) {
  return (
    <div className="auth-alert">
      <Icon name="alertCircle" size={16} />
      <span>{message}</span>
    </div>
  );
}

export function AuthSuccess({ message }: { message: string }) {
  return (
    <div className="auth-alert auth-alert-ok">
      <Icon name="checkCircle" size={16} />
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

/* ── Small provider glyphs for the method-tab row (not the sign-in
   buttons themselves — those are Google's/MSAL's own real button chrome,
   rendered by GoogleSignInButton/MicrosoftSignInButton). ── */
function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default Login;
