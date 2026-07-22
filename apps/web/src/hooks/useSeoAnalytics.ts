import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';

export interface SeoSettings {
  enabled: boolean;
  ga4MeasurementId?: string;
  gtmContainerId?: string;
  metaPixelId?: string;
  googleSiteVerification?: string;
  bingSiteVerification?: string;
  customHeadScripts?: string;
  customBodyScripts?: string;
}

const DEFAULTS: SeoSettings = { enabled: false };

const KEYS: Record<keyof SeoSettings, string> = {
  enabled: 'hudumika_seo_enabled',
  ga4MeasurementId: 'hudumika_seo_ga4',
  gtmContainerId: 'hudumika_seo_gtm',
  metaPixelId: 'hudumika_seo_meta_pixel',
  googleSiteVerification: 'hudumika_seo_google_verify',
  bingSiteVerification: 'hudumika_seo_bing_verify',
  customHeadScripts: 'hudumika_seo_head_scripts',
  customBodyScripts: 'hudumika_seo_body_scripts',
};

export function readSeoSettings(): SeoSettings {
  return {
    enabled: localStorage.getItem(KEYS.enabled) === 'true',
    ga4MeasurementId: localStorage.getItem(KEYS.ga4MeasurementId) ?? '',
    gtmContainerId: localStorage.getItem(KEYS.gtmContainerId) ?? '',
    metaPixelId: localStorage.getItem(KEYS.metaPixelId) ?? '',
    googleSiteVerification: localStorage.getItem(KEYS.googleSiteVerification) ?? '',
    bingSiteVerification: localStorage.getItem(KEYS.bingSiteVerification) ?? '',
    customHeadScripts: localStorage.getItem(KEYS.customHeadScripts) ?? '',
    customBodyScripts: localStorage.getItem(KEYS.customBodyScripts) ?? '',
  };
}

function writeSeoSettings(settings: SeoSettings) {
  localStorage.setItem(KEYS.enabled, String(!!settings.enabled));
  for (const k of ['ga4MeasurementId', 'gtmContainerId', 'metaPixelId', 'googleSiteVerification', 'bingSiteVerification', 'customHeadScripts', 'customBodyScripts'] as const) {
    localStorage.setItem(KEYS[k], settings[k] ?? '');
  }
}

/** Saves to the backend. Throws on failure — callers must handle it, same convention as pushBranding. */
export async function pushSeoSettings(patch: Partial<SeoSettings>): Promise<SeoSettings> {
  const merged = await apiFetch('/v1/platform/seo', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  writeSeoSettings({ ...DEFAULTS, ...merged });
  window.dispatchEvent(new Event('hudumika-seo-updated'));
  return merged;
}

function ensureEl<K extends keyof HTMLElementTagNameMap>(id: string, tag: K, parent: HTMLElement): HTMLElementTagNameMap[K] {
  let el = document.getElementById(id) as HTMLElementTagNameMap[K] | null;
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    parent.appendChild(el);
  }
  return el;
}

function removeEl(id: string) {
  document.getElementById(id)?.remove();
}

/** Injects a raw HTML/script string into a singleton container so embedded <script> tags actually execute (innerHTML= does not run scripts; a contextual fragment does). */
function injectRaw(containerId: string, html: string, parent: HTMLElement) {
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.style.display = 'none';
    parent.appendChild(container);
  }
  container.innerHTML = '';
  if (html && html.trim()) {
    const fragment = document.createRange().createContextualFragment(html);
    container.appendChild(fragment);
  }
}

export function applySeoAnalytics(settings: SeoSettings): void {
  const on = !!settings.enabled;

  if (on && settings.ga4MeasurementId) {
    const id = settings.ga4MeasurementId;
    const loader = ensureEl('hudumika-ga4-loader', 'script', document.head);
    loader.setAttribute('src', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
    loader.setAttribute('async', 'true');
    const init = ensureEl('hudumika-ga4-init', 'script', document.head);
    init.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${id}');`;
  } else {
    removeEl('hudumika-ga4-loader');
    removeEl('hudumika-ga4-init');
  }

  if (on && settings.gtmContainerId) {
    const id = settings.gtmContainerId;
    const loader = ensureEl('hudumika-gtm-loader', 'script', document.head);
    loader.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
    const noscript = ensureEl('hudumika-gtm-noscript', 'noscript', document.body);
    noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
  } else {
    removeEl('hudumika-gtm-loader');
    removeEl('hudumika-gtm-noscript');
  }

  if (on && settings.metaPixelId) {
    const id = settings.metaPixelId;
    const px = ensureEl('hudumika-meta-pixel', 'script', document.head);
    px.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${id}');fbq('track', 'PageView');`;
  } else {
    removeEl('hudumika-meta-pixel');
  }

  if (on && settings.googleSiteVerification) {
    const meta = ensureEl('hudumika-google-verify', 'meta', document.head);
    meta.setAttribute('name', 'google-site-verification');
    meta.setAttribute('content', settings.googleSiteVerification);
  } else {
    removeEl('hudumika-google-verify');
  }

  if (on && settings.bingSiteVerification) {
    const meta = ensureEl('hudumika-bing-verify', 'meta', document.head);
    meta.setAttribute('name', 'msvalidate.01');
    meta.setAttribute('content', settings.bingSiteVerification);
  } else {
    removeEl('hudumika-bing-verify');
  }

  injectRaw('hudumika-custom-head-scripts', on ? (settings.customHeadScripts ?? '') : '', document.head);
  injectRaw('hudumika-custom-body-scripts', on ? (settings.customBodyScripts ?? '') : '', document.body);
}

export function useSeoAnalytics(): void {
  const location = useLocation();

  useEffect(() => {
    const settings = readSeoSettings();
    applySeoAnalytics(settings);

    const handler = () => applySeoAnalytics(readSeoSettings());
    window.addEventListener('hudumika-seo-updated', handler);
    const storageHandler = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('hudumika_seo_')) handler();
    };
    window.addEventListener('storage', storageHandler);

    apiFetch('/v1/platform/seo').then((data: any) => {
      if (!data) return;
      writeSeoSettings({ ...DEFAULTS, ...data });
      handler();
    }).catch(() => {});

    return () => {
      window.removeEventListener('hudumika-seo-updated', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // Virtual pageviews: this is a SPA, so route changes never trigger a real
  // page load — without this, GA4/GTM would only ever see the first pageview.
  useEffect(() => {
    const settings = readSeoSettings();
    if (!settings.enabled) return;
    if (settings.ga4MeasurementId && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', { page_path: location.pathname + location.search });
    }
    if (settings.gtmContainerId) {
      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({ event: 'virtual_page_view', page_path: location.pathname + location.search });
    }
  }, [location.pathname, location.search]);
}
