import { useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/api.js';
import { refreshFxRates } from '../lib/currency.js';

// Reactive company info store — read by DeliveryNotes, Invoices, Reports, TopBar,
// ShipmentDetail, Subscription (Company Info + Regulatory Details), Settings, etc.
// Backed by the tenant's real /v1/settings record (tenant_settings.settings.company
// in the DB) so every app that reads company info sees the same tenant-persisted
// data, not a per-browser mock. Cached to localStorage under 'cls_company' purely
// so there's no flash of default data while the server hydration round-trip is in
// flight — the server is always the source of truth once it responds.

export interface CompanyInfo {
  name: string;
  logoUrl: string | null;     // null = use default / text fallback
  logoUrlDark: string | null; // null = fall back to logoUrl — shown wherever a document/preview renders on a dark background (see readers in CustomerInvoices/PurchaseOrders/Billing/Quotations/TopBar)
  logoHistory: string[];      // previously set logos, newest first — local-only, not persisted to the server
  faviconUrl: string | null;  // null = use /favicon.png
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  regNumber: string;
  tagline: string;
  businessType: string;
  contactPerson: string;
  // Customs/regulatory credentials — shown on Subscription's "Regulatory Details" card,
  // also usable by declaration/invoice templates that need to print the agent's licence.
  customsAgentLicence: string;
  licenceExpiry: string;
  traPin: string;
  tancisUsername: string;
  // Finance settings
  currency: string;           // default billing currency, e.g. 'TZS', 'USD'
  defaultTax: number;         // default tax rate %, e.g. 18
  fiscalMonth: number;        // fiscal year start month 1–12
}

const STORAGE_KEY = 'cls_company';

const DEFAULTS: CompanyInfo = {
  name:        'Vihilox Logistics Ltd',
  logoUrl:     null,
  logoUrlDark: null,
  logoHistory: [],
  faviconUrl:  null,
  address:     '14 Msasani Road, Kinondoni',
  city:        'Dar es Salaam',
  country:     'Tanzania',
  phone:       '+255 22 219 0001',
  email:       'info@vihilox.co.tz',
  website:     'www.vihilox.co.tz',
  taxId:       '152-013-019',
  regNumber:   'REG-2019-0042',
  tagline:     'Customs Clearing & Freight Forwarding',
  businessType: 'Customs Clearing Agent',
  contactPerson: '',
  customsAgentLicence: '',
  licenceExpiry: '',
  traPin: '',
  tancisUsername: '',
  currency:    'TZS',
  defaultTax:  18,
  fiscalMonth: 1,
};

function loadFromStorage(): CompanyInfo {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CompanyInfo>;
      return { ...DEFAULTS, logoHistory: [], ...parsed };
    }
  } catch { }
  return { ...DEFAULTS };
}

function applyFaviconToDOM(url: string | null): void {
  try {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url ?? '/favicon.png';
    // Remove explicit type so the browser infers it (works for data URIs and all formats)
    link.removeAttribute('type');
  } catch { }
}

let _company: CompanyInfo = loadFromStorage();
let _hydrated = false;
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

// Apply persisted favicon immediately on module load
applyFaviconToDOM(_company.faviconUrl);

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_company));
  } catch { }
}

const _subs = new Set<() => void>();
function notify() { _subs.forEach(fn => fn()); }

export function getCompany(): CompanyInfo { return _company; }

/** Debounced so several setCompany() calls in quick succession (e.g. multi-field form saves) collapse into one PATCH. */
function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    // Send the full company object — the backend's settings PATCH replaces the
    // whole `company` key rather than deep-merging it, so a partial payload here
    // would silently wipe out every other saved field.
    const { logoHistory, ...company } = _company;
    apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ company }) }).catch(() => {
      // Offline or request failed — local cache stays authoritative until the next successful save.
    });
  }, 400);
}

export function setCompany(info: Partial<CompanyInfo>, opts: { persist?: boolean } = {}): void {
  // When a new logo is being set, push the current one to history
  if (
    'logoUrl' in info &&
    info.logoUrl !== null &&
    info.logoUrl !== _company.logoUrl &&
    _company.logoUrl !== null
  ) {
    const history = [_company.logoUrl, ...(_company.logoHistory ?? [])].slice(0, 10);
    _company = { ..._company, ...info, logoHistory: history };
  } else {
    _company = { ..._company, ...info };
  }
  saveToStorage();
  if ('faviconUrl' in info) applyFaviconToDOM(_company.faviconUrl);
  notify();
  if (opts.persist !== false) schedulePersist();
}

export function subscribeCompany(fn: () => void): () => void {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

export function useCompany(): CompanyInfo {
  return useSyncExternalStore(subscribeCompany, getCompany);
}

/** Pulls the tenant's real company record from the server and merges it in (called once per session, from AuthProvider). */
export async function hydrateCompanyFromServer(): Promise<void> {
  if (_hydrated) return;
  _hydrated = true;
  // Live FX alongside the company record: both are per-session, both need a
  // token, and every figure this store's `currency` is used to format may need
  // converting. Deliberately not awaited — a slow or unavailable FX service
  // must not hold up the company details.
  void refreshFxRates();
  try {
    const res = await apiFetch('/v1/settings');
    const c = res?.settings?.company || {};
    const t = res?.tenant || {};
    setCompany({
      name:        c.name ?? t.name ?? _company.name,
      logoUrl:     c.logoUrl ?? t.logo_url ?? _company.logoUrl,
      logoUrlDark: c.logoUrlDark ?? _company.logoUrlDark,
      faviconUrl:  c.faviconUrl ?? _company.faviconUrl,
      address:     c.address ?? _company.address,
      city:        c.city ?? _company.city,
      country:     c.country ?? _company.country,
      phone:       c.phone ?? _company.phone,
      email:       c.email ?? _company.email,
      website:     c.website ?? _company.website,
      taxId:       c.taxId ?? c.vat ?? _company.taxId,
      regNumber:   c.regNumber ?? _company.regNumber,
      tagline:     c.tagline ?? _company.tagline,
      businessType: c.businessType ?? _company.businessType,
      contactPerson: c.contactPerson ?? _company.contactPerson,
      customsAgentLicence: c.customsAgentLicence ?? _company.customsAgentLicence,
      licenceExpiry: c.licenceExpiry ?? _company.licenceExpiry,
      traPin: c.traPin ?? _company.traPin,
      tancisUsername: c.tancisUsername ?? _company.tancisUsername,
      currency:    c.currency ?? _company.currency,
      defaultTax:  c.defaultTax ?? _company.defaultTax,
      fiscalMonth: c.fiscalMonth ?? _company.fiscalMonth,
    }, { persist: false });
  } catch {
    // Not authenticated yet, offline, or first run for this tenant — keep local cache/defaults.
    _hydrated = false;
  }
}

/** Clears the cached company record on logout so the next tenant to sign in on this browser doesn't briefly see stale branding. */
export function resetCompanyCache(): void {
  _hydrated = false;
  _company = { ...DEFAULTS };
  try { localStorage.removeItem(STORAGE_KEY); } catch { }
  applyFaviconToDOM(null);
  notify();
}
