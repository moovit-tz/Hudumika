import { useSyncExternalStore } from 'react';

// Reactive company branding store — read by DeliveryNotes, Invoices, Reports, TopBar, etc.
// Persisted to localStorage under 'cls_company' so settings survive page refreshes.

export interface CompanyInfo {
  name: string;
  logoUrl: string | null;     // null = use default / text fallback
  logoHistory: string[];      // previously set logos, newest first
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
  // Finance settings
  currency: string;           // default billing currency, e.g. 'TZS', 'USD'
  defaultTax: number;         // default tax rate %, e.g. 18
  fiscalMonth: number;        // fiscal year start month 1–12
}

const STORAGE_KEY = 'cls_company';

const DEFAULTS: CompanyInfo = {
  name:        'Vihilox Logistics Ltd',
  logoUrl:     null,
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

export function setCompany(info: Partial<CompanyInfo>): void {
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
}

export function subscribeCompany(fn: () => void): () => void {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

export function useCompany(): CompanyInfo {
  return useSyncExternalStore(subscribeCompany, getCompany);
}
