import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

export interface BrandingState {
  platformName:  string;
  platformTagline: string;
  logoLight:     string;
  logoDark:      string;
  favicon:       string;
  loginHeadline: string;
  loginSubtext:  string;
  loginBgStyle:  'navy' | 'teal' | 'gradient' | 'white';
  accentColor:   string;
  supportEmail?: string;
  getAppColor:   (id: string, fallback?: string) => string;
  getAppLogo:    (id: string) => string;
  getAppName:    (id: string, fallback?: string) => string;
  getAppSlogan:  (id: string, fallback?: string) => string;
}

export function applyWorkspaceBranding(state: BrandingState): void {
  // Update Document Title
  document.title = state.platformName || 'Hudumika';

  // Update Favicon
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (state.favicon) {
    link.href = state.favicon;
  } else {
    // Default fallback favicon or let it be
    link.href = '/favicon.ico';
  }
}

function readBranding(): BrandingState {
  return {
    platformName:    localStorage.getItem('hudumika_platform_name')    ?? 'Hudumika',
    platformTagline: localStorage.getItem('hudumika_platform_tagline') ?? 'Smart Business, Simplified.',
    logoLight:       localStorage.getItem('hudumika_brand_logo_light') ?? '',
    logoDark:        localStorage.getItem('hudumika_brand_logo_dark')  ?? '',
    favicon:         localStorage.getItem('hudumika_brand_favicon')    ?? '',
    loginHeadline:   localStorage.getItem('hudumika_login_headline')   ?? 'Welcome back',
    loginSubtext:    localStorage.getItem('hudumika_login_subtext')    ?? 'Sign in to your workspace',
    loginBgStyle:    (localStorage.getItem('hudumika_login_bg') as 'navy'|'teal'|'gradient'|'white') ?? 'white',
    accentColor:     localStorage.getItem('hudumika_email_accent')     ?? '#0d7a6b',
    supportEmail:    localStorage.getItem('hudumika_support_email')    ?? '',
    getAppColor:     (id, fallback = '#64748b') => localStorage.getItem(`hudumika_app_color_${id}`) ?? fallback,
    getAppLogo:      (id) => localStorage.getItem(`hudumika_app_logo_${id}`) ?? '',
    getAppName:      (id, fallback = '') => localStorage.getItem(`hudumika_app_name_${id}`) ?? fallback,
    getAppSlogan:    (id, fallback = '') => localStorage.getItem(`hudumika_app_slogan_${id}`) ?? fallback,
  };
}

export interface AppBrandingConfig {
  name?: string;
  slogan?: string;
  color?: string;
  logo?: string;
}

/**
 * Saves branding to the backend. Throws on failure — callers must handle this
 * (e.g. show an error) rather than swallow it, since a silently-failed save
 * looks identical to a successful one until someone notices stale data later.
 */
export async function pushBranding(state: Partial<BrandingState> & { apps?: Record<string, AppBrandingConfig> }): Promise<void> {
  await apiFetch('/v1/platform/branding', {
    method: 'PUT',
    body: JSON.stringify(state),
  });
}

export function useBranding(): BrandingState {
  const [state, setState] = useState<BrandingState>(readBranding);

  useEffect(() => {
    applyWorkspaceBranding(state);
    
    const handler = () => {
      const newState = readBranding();
      setState(newState);
      applyWorkspaceBranding(newState);
    };
    // Same-tab updates (this tab just saved something in BrandingView).
    window.addEventListener('hudumika-brand-updated', handler);
    // Cross-tab updates: the native 'storage' event fires in *other* open tabs
    // whenever any of them writes to localStorage — e.g. a tab already open on
    // the hub page picks up a logo/name change saved from a SuperAdmin tab,
    // without needing a manual reload.
    const storageHandler = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('hudumika_')) handler();
    };
    window.addEventListener('storage', storageHandler);

    // Fetch initial from API (the real, shared source of truth) and populate localStorage,
    // which useBranding's getters read from for fast, synchronous access.
    apiFetch('/v1/platform/branding').then((data: any) => {
      if (!data) return;
      if (data.platformName) localStorage.setItem('hudumika_platform_name', data.platformName);
      if (data.platformTagline) localStorage.setItem('hudumika_platform_tagline', data.platformTagline);
      if (data.logoLight) localStorage.setItem('hudumika_brand_logo_light', data.logoLight);
      if (data.logoDark) localStorage.setItem('hudumika_brand_logo_dark', data.logoDark);
      if (data.favicon) localStorage.setItem('hudumika_brand_favicon', data.favicon);
      if (data.loginHeadline) localStorage.setItem('hudumika_login_headline', data.loginHeadline);
      if (data.loginSubtext) localStorage.setItem('hudumika_login_subtext', data.loginSubtext);
      if (data.loginBgStyle) localStorage.setItem('hudumika_login_bg', data.loginBgStyle);
      if (data.supportEmail) localStorage.setItem('hudumika_support_email', data.supportEmail);
      if (data.accentColor) localStorage.setItem('hudumika_email_accent', data.accentColor);

      if (data.apps) {
        for (const [appId, cfg] of Object.entries(data.apps as Record<string, AppBrandingConfig>)) {
          if (cfg.name)   localStorage.setItem(`hudumika_app_name_${appId}`, cfg.name);
          if (cfg.slogan) localStorage.setItem(`hudumika_app_slogan_${appId}`, cfg.slogan);
          if (cfg.color)  localStorage.setItem(`hudumika_app_color_${appId}`, cfg.color);
          if (cfg.logo)   localStorage.setItem(`hudumika_app_logo_${appId}`, cfg.logo);
        }
      }

      handler(); // Triggers UI update
    }).catch(() => {});

    return () => {
      window.removeEventListener('hudumika-brand-updated', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  return state;
}
