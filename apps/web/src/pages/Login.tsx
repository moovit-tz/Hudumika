import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useBranding, BRAND_LOGO_LIGHT, BRAND_LOGO_DARK } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { lightenHex, enforceContrastFloor, pickForegroundHsl } from '../lib/color.js';
import { OndiLogo } from '../components/OndiLogo.js';
import { OndiSignInPanel } from '../components/OndiSignInPanel.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../components/ui/dropdown-menu.js';
import { Tip } from '../components/ui/tooltip.js';
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
  const { login } = useAuth();
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
  // Real password+authenticator-code 2FA (Workspace ▸ Security's "Enable
  // 2FA" — a user sets this up once there; every sign-in after that, this
  // is what runs). password+totp are submitted together, but the code
  // field only appears once the server confirms the account actually has
  // 2FA enabled (requires_2fa) — asking for it upfront on every account
  // would leak who has 2FA turned on before a password is even checked.
  const [needs2fa, setNeeds2fa]       = useState(false);
  const [totpCode, setTotpCode]       = useState('');
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);
  const [method, setMethod] = useState<'password' | 'ondi'>('password');

  // Google/Microsoft/phone/authenticator/company-SSO used to be three
  // separate things on this page: a "Google" tab, a "Microsoft" tab, and a
  // "Continue with Ondi" link buried below the form. All of them are really
  // the same choice ("something other than a typed password"), and Ondi's
  // own page (/ondi/login) already offers every one of them — Google
  // included, with its client ID resolved the same way GoogleSignInButton
  // always did. So this tab now just navigates there instead of
  // re-rendering a second, partial copy of that page's own method picker.
  const methods: Array<{ key: typeof method; label: string; icon: React.ReactNode }> = [
    { key: 'ondi', label: 'Ondi', icon: <OndiLogo size={14} /> },
    { key: 'password', label: 'Password', icon: <Icon name="lock" size={14} /> },
  ];

  const branding = useBranding(true);
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
    // platform-wide — see CLAUDE.md) — as literal link text on the dark card
    // it can be nearly invisible when the accent itself is a dark tone.
    // Google's own dark-mode link blue is a safe, on-theme fallback for text
    // specifically; the accent still drives the button surface below.
    el.style.setProperty('--lp-link-accent',     d ? '#8ab4f8' : accent);
    // Button *surface*, not just text: the assumption that the raw accent
    // "reads fine as the submit button's fill because contrast is against
    // white button text" is exactly the bug — a dark tenant colour (navy,
    // charcoal) used as a full solid fill on an already-near-black dark page
    // doesn't fail WCAG, it just reads as a heavy, undifferentiated block
    // instead of a CTA. useDesignSystem.ts already solved this for the main
    // app's --primary token (lighten the brand hex 45% before the contrast
    // floor, dark mode only, light mode uses the hex as picked) — this reuses
    // the exact same lib/color.ts functions instead of inventing a second,
    // login-page-only fix.
    const surfaceBase = d ? lightenHex(accent, 0.45) : accent;
    const surface = enforceContrastFloor(surfaceBase).hex;
    el.style.setProperty('--lp-accent-surface',    surface);
    el.style.setProperty('--lp-accent-surface-fg', `hsl(${pickForegroundHsl(surface)})`);
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
    if (needs2fa) {
      if (totpCode.trim().length < 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
      setError(null);
      setLoading(true);
      try {
        const res = await login(email, password, totpCode.trim());
        if ('requires_2fa' in res) { setError('Invalid code. Try again.'); return; }
        navigate('/');
      } catch (err: any) {
        setError(err.message || 'Invalid or expired code.');
      } finally { setLoading(false); }
      return;
    }
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      if ('requires_2fa' in res) { setNeeds2fa(true); return; }
      navigate('/');
    }
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

  return (
    <div ref={rootRef} className="login-page" data-theme={theme}>

      <Tip label={t('login.toggleTheme')}>
        <button
          type="button"
          onClick={e => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            toggleThemeWithAnimation(e, next === 'dark');
          }}
          className="login-toggle"
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </Tip>

      <div className="login-card">

        {/* Brand Header — logo only. */}
        <div className="login-brand-hdr">
          <div className="login-brand-row">
            <img
              src={logo || (isDark ? BRAND_LOGO_DARK : BRAND_LOGO_LIGHT)}
              alt={branding.platformName}
              className="g-brand-logo-img"
            />
          </div>
        </div>

        <h1 className="login-headline">{branding.loginHeadline}</h1>

        {/* Sign in / Sign up — Sign up isn't rebuilt in-card since /signup
            is already a real, dedicated multi-step registration flow
            (OnboardingWizard); this pill just navigates there. */}
        <div className="login-toplevel-tabs">
          <button type="button" className="login-toplevel-tab login-toplevel-tab--active">{t('login.signIn')}</button>
          <button type="button" onClick={() => navigate('/signup')} className="login-toplevel-tab">{t('login.createAccount')}</button>
        </div>

        <div className="login-header-left">
          <p className="login-subtext">{branding.loginSubtext}</p>
        </div>

        {error && (
          <div className="login-error">
            <Icon name="alertCircle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Sign-in method tabs — both render inline now: Password's own
            form below, or OndiSignInPanel (the exact same picker /ondi/login
            renders standalone) in the Ondi tab. Was a navigation to
            /ondi/login; moved inline per direct feedback — a tab switching
            to a different *page* read as broken, not as a tab. ── */}
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

        {method === 'ondi' && <OndiSignInPanel />}

        {/* ── Credentials Form ── */}
        {method === 'password' && (
        <form onSubmit={handleSubmit} noValidate className="login-form">

          {needs2fa ? (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="login-totp">Authenticator code</label>
                <input
                  id="login-totp"
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="login-input"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div className="login-form-actions">
                <button
                  type="button"
                  onClick={() => { setNeeds2fa(false); setTotpCode(''); setError(null); }}
                  disabled={loading}
                  className="login-back-btn"
                >
                  Back
                </button>
                <button type="submit" disabled={loading} className="login-submit-btn">
                  {loading ? t('login.signingIn') : 'Verify & sign in'}
                </button>
              </div>
            </>
          ) : (
            <>
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
                  <Tip label={showPass ? t('login.hidePassword') : t('login.showPassword')}>
                    <button type="button" onClick={() => setShowPass(p => !p)} className="login-pw-toggle">
                      <Icon name={showPass ? 'eyeOff' : 'eye'} size={16} />
                    </button>
                  </Tip>
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
            </>
          )}
        </form>
        )}

        {/* ── Demo accounts ── */}
        <div className="login-divider"><span>{t('login.orTryDemo')}</span></div>
        <div className="login-demo-grid">
          {DEMO_ACCOUNTS.map(acc => (
            <Tip key={acc.email} label={acc.email}>
              <button
                type="button"
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
            </Tip>
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

/**
 * The shared shell for every secondary auth page (ForgotPassword,
 * AcceptInvite, MagicLinkPage, RecoveryPage, ResetPassword,
 * SsoCompletePage, VerifyEmail) — one component, so fixing it here fixes
 * all seven at once. Replaces the old two-panel .auth-shell/AuthBrand
 * split-screen layout (a completely different, older design system that
 * never got the Google-Material-style pass Login.tsx/OndiLogin.tsx got)
 * with the exact same centered .login-card chrome those two pages already
 * use — same --lp-* tokens, same theme toggle (and the same
 * hudumika_login_theme localStorage key, so a dark-mode choice made on any
 * one pre-auth page carries to the rest), same brand header and page
 * footer. Each page still owns its own body content (icon/title/subtitle,
 * form, success state) via .auth-form-hdr/.auth-input/.auth-btn-primary
 * etc. — those classes were only ever restyled here to pull from the same
 * --lp-* tokens, not rewritten, so no page's JSX below this wrapper had to
 * change beyond swapping .auth-shell for <AuthCard>.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const branding = useBranding(true);
  const { t, language, setLanguage, LANGUAGES } = useLocale();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('hudumika_login_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { localStorage.setItem('hudumika_login_theme', theme); }, [theme]);

  const isDark   = theme === 'dark';
  const logo     = isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight;
  const pageBg   = isDark ? '#131314' : (LOGIN_BG_MAP[branding.loginBgStyle] ?? '#f0f4f9');
  const isBgDark = !isDark && branding.loginBgStyle !== 'white';
  const accent   = branding.accentColor;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const d = isDark, b = isBgDark;
    el.style.setProperty('--lp-bg',              pageBg);
    el.style.setProperty('--lp-accent',          accent);
    el.style.setProperty('--lp-card-bg',         d ? '#1e1e1f'                     : '#fff');
    el.style.setProperty('--lp-card-border',     d ? '#3c4043'                     : '#e0e2e6');
    el.style.setProperty('--lp-card-shadow',     b ? '0 8px 32px rgba(0,0,0,0.28)': 'none');
    el.style.setProperty('--lp-ink',             d ? '#e3e3e3'                     : '#1f1f1f');
    el.style.setProperty('--lp-ink2',            d ? '#c4c7c5'                     : '#444746');
    el.style.setProperty('--lp-ink3',            d ? '#9aa0a6'                     : '#5f6368');
    el.style.setProperty('--lp-input-bg',        d ? '#2a2a2d'                     : '#fff');
    el.style.setProperty('--lp-input-border',    d ? '#8e918f'                     : '#747775');
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
    // Same green-hued pair pattern as --lp-error-* above, for AuthSuccess /
    // .auth-alert-ok and the "sent"/"done" state icon circles — these pages
    // are full of exactly that state (link sent, password updated, request
    // approved), and reusing the platform's authenticated-app --green(-l)
    // tokens would be wrong here for the same reason .login-input had to be
    // double-scoped: those key off <html>'s own separate theme toggle, not
    // this page's local one.
    el.style.setProperty('--lp-success-bg',      d ? '#1e2c22' : '#f0fdf4');
    el.style.setProperty('--lp-success-border',  d ? '#2d4a37' : '#dcfce7');
    el.style.setProperty('--lp-success-text',    d ? '#86efac' : '#166534');
    el.style.setProperty('--lp-link-accent',     d ? '#8ab4f8' : accent);
    const surfaceBase = d ? lightenHex(accent, 0.45) : accent;
    const surface = enforceContrastFloor(surfaceBase).hex;
    el.style.setProperty('--lp-accent-surface',    surface);
    el.style.setProperty('--lp-accent-surface-fg', `hsl(${pickForegroundHsl(surface)})`);
  }, [isDark, isBgDark, pageBg, accent]);

  return (
    <div ref={rootRef} className="login-page" data-theme={theme}>
      <Tip label={t('login.toggleTheme')}>
        <button
          type="button"
          onClick={e => {
            const next = theme === 'light' ? 'dark' : 'light';
            setTheme(next);
            toggleThemeWithAnimation(e, next === 'dark');
          }}
          className="login-toggle"
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
      </Tip>

      <div className="login-card">
        <div className="login-brand-hdr">
          <div className="login-brand-row">
            <img
              src={logo || (isDark ? BRAND_LOGO_DARK : BRAND_LOGO_LIGHT)}
              alt={branding.platformName}
              className="g-brand-logo-img"
            />
          </div>
        </div>
        {children}
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

export default Login;
