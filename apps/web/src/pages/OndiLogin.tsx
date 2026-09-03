import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../hooks/useBranding.js';
import { Icon } from '../components/Icon.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { lightenHex, enforceContrastFloor, pickForegroundHsl } from '../lib/color.js';
import { OndiSignInPanel } from '../components/OndiSignInPanel.js';
import { Tip } from '../components/ui/tooltip.js';
import './Login.css';
import './OndiLogin.css';

const LOGIN_BG_MAP: Record<string, string> = {
  navy: '#0e1f3d', teal: '#0d7a6b',
  gradient: 'linear-gradient(135deg,#0e1f3d 0%,#0d7a6b 100%)', white: '#f0f4f9',
};

/**
 * Ondi's own dedicated login page — page chrome (theme toggle, centered
 * icon/headline, the closing "sign in with password instead" links) around
 * OndiSignInPanel, the actual method picker. The panel is the same
 * component embedded inline as the "Ondi" tab on Login.tsx and on signup's
 * Details/Ondi choice — see OndiSignInPanel.tsx's own header for why that
 * split exists (one state machine, three hosts). Reachable at /ondi/login;
 * not yet the default (see ondi-auth.routes.ts's own header comment) —
 * that cutover is a later, separate, reversible milestone.
 */
export const OndiLogin: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const branding = useBranding(true);

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
    // Button surface — same fix as Login.tsx's identical block, reusing
    // useDesignSystem.ts's own --primary dark-mode derivation (lighten 45%
    // before the contrast floor) rather than the raw accent, which passes
    // WCAG against white text but still reads as a heavy, near-invisible
    // block when the accent itself is dark and the page already is too.
    const surfaceBase = d ? lightenHex(accent, 0.45) : accent;
    const surface = enforceContrastFloor(surfaceBase).hex;
    el.style.setProperty('--lp-accent-surface',    surface);
    el.style.setProperty('--lp-accent-surface-fg', `hsl(${pickForegroundHsl(surface)})`);
  }, [isDark, isBgDark, pageBg, accent]);

  return (
    <div ref={rootRef} className="login-page ondi-login" data-theme={theme}>
      <Tip label="Toggle theme">
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
        <div className="login-brand-hdr ondi-idle-header">
          <img src="/ondi-icon.svg" alt="Ondi" className="ondi-idle-icon" />
          <div className="login-header-left">
            <h1 className="login-headline">Welcome to Ondi</h1>
            <p className="login-subtext">Your identity. Your access. Your control.</p>
          </div>
        </div>

        <OndiSignInPanel />

        <div className="login-create-links">
          <p className="login-create-p">
            <span className="login-create-lead">Prefer a password?</span>{' '}
            <Link to="/login" className="login-create-link">Sign in instead</Link>
          </p>
          <p className="login-create-p">
            <span className="login-create-lead">New company?</span>{' '}
            <Link to="/signup" className="login-create-link">Create a workspace</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default OndiLogin;
