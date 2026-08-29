import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useCompany } from '../data/companyStore.js';
import { Icon } from '../components/Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import './Login.css';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin',   email: 'superadmin@hudumika.tz', name: 'Super Admin',      initials: 'SA', avKey: 'sa' },
  { role: 'Tenant Admin',  email: 'admin@msomi.co',        name: 'Msomi Admin',       initials: 'MA', avKey: 'ma' },
  { role: 'Manager',       email: 'manager@msomi.co',      name: 'Jane Mwangi',       initials: 'JM', avKey: 'jm' },
  { role: 'Finance',       email: 'finance@msomi.co',      name: 'Devota Mushi',      initials: 'DM', avKey: 'dm' },
  { role: 'Senior Officer',email: 'senior@msomi.co',       name: 'Fredrick Msemwa',   initials: 'FM', avKey: 'fm' },
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
  const { t, language, LANGUAGES } = useLocale();

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

  const [view, setView]               = useState<'choose-account' | 'credentials'>('choose-account');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [error, setError]             = useState<string | null>(
    searchParams.get('expired') ? 'Your session has expired. Please log in again.' : null
  );
  const [fieldErr, setFieldErr]       = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading]         = useState(false);
  const [demoLoadingEmail, setDemoLoadingEmail] = useState<string | null>(null);

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
    el.style.setProperty('--lp-input-bg',        d ? '#131314'                     : '#fff');
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

      <div className={`login-card${view === 'choose-account' ? ' login-card--accounts' : ''}`}>

        {/* Brand Header */}
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
          <div>
            <h1 className="login-headline">
              {view === 'choose-account' ? t('login.chooseAccount') : branding.loginHeadline}
            </h1>
            <p className="login-subtext">{branding.loginSubtext}</p>
          </div>
        </div>

        {error && (
          <div className="login-error">
            <Icon name="alertCircle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Choose Account ── */}
        {view === 'choose-account' && (
          <div className="login-accounts">
            <div className="login-account-list">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleDemoLogin(acc.email)}
                  disabled={loading || !!demoLoadingEmail}
                  className="login-account-btn"
                >
                  <div className={`login-av login-av--${acc.avKey}`}>
                    {demoLoadingEmail === acc.email
                      ? <span className="auth-spinner" />
                      : acc.initials
                    }
                  </div>
                  <div className="login-acc-info">
                    <div className="login-acc-info-top">
                      <span className="login-acc-name">{acc.name}</span>
                      <span className={`login-badge login-av--${acc.avKey}`}>{acc.role}</span>
                    </div>
                    <div className="login-acc-email">{acc.email}</div>
                  </div>
                </button>
              ))}
            </div>

            <button type="button" onClick={() => setView('credentials')} className="login-use-other">
              <div className="login-use-other-icon">
                <Icon name="plus" size={16} />
              </div>
              <span className="login-use-other-label">{t('login.useAnotherAccount')}</span>
            </button>

            <p className="login-create-p">
              {t('login.noAccount')}{' '}
              <Link to="/signup" className="login-create-link">{t('login.createAccount')}</Link>
            </p>
          </div>
        )}

        {/* ── Credentials Form ── */}
        {view === 'credentials' && (
          <form onSubmit={handleSubmit} noValidate className="login-form">

            <div className="login-field">
              <input
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
              <div className="login-field-pw">
                <input
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

            <div className="login-form-actions">
              <button type="button" onClick={() => setView('choose-account')} className="login-back-btn">
                {t('login.backToAccounts')}
              </button>
              <button type="submit" disabled={loading} className="login-submit-btn">
                {loading ? t('login.signingIn') : t('login.next')}
              </button>
            </div>

            <p className="login-create-p">
              <Link to="/ondi/login" className="login-create-link">Sign in with phone or authenticator instead</Link>
            </p>

          </form>
        )}

      </div>

      <div className={`login-footer${view === 'choose-account' ? ' login-footer--accounts' : ''}`}>
        <span>{LANGUAGES.find(l => l.code === language)?.nativeLabel ?? 'English'}</span>
        <div className="login-footer-links">
          <a href="#help" className="login-footer-link">{t('login.help')}</a>
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

export default Login;
