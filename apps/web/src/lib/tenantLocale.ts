/**
 * The workspace's own language, timezone and base currency.
 *
 * Settings has always had a Localization section, and until now nothing read
 * it. Language was chosen per browser in `hudumika_locale`, so a Tanzanian
 * workspace could not make Kiswahili its default for everyone — each person
 * got whatever their browser happened to say, and the tenant admin's choice
 * changed nothing.
 *
 * The rule here is that a person's own explicit choice always wins. The tenant
 * default is what applies to somebody who has never chosen, which is almost
 * everybody. That way an admin setting Kiswahili changes the workspace without
 * overriding the colleague who deliberately switched to French.
 */
import { apiFetch } from './api.js';

export interface TenantLocale {
  language: string | null;
  timezone: string | null;
  base_currency: string | null;
}

const EMPTY: TenantLocale = { language: null, timezone: null, base_currency: null };

/** Cached for the session; /identity/me is already fetched once on load. */
let current: TenantLocale = EMPTY;

/** Set when the person picked a language themselves — their choice outranks the tenant's. */
const USER_CHOICE_KEY = 'hudumika_locale';

export function getTenantLocale(): TenantLocale {
  return current;
}

/**
 * Adopt what /identity/me reported.
 *
 * Returns the language that should be applied now, or null to leave the
 * current one alone — the caller owns i18n, this module only decides.
 */
export function applyTenantLocale(loc: Partial<TenantLocale> | null | undefined): string | null {
  current = {
    language: loc?.language ?? null,
    timezone: loc?.timezone ?? null,
    base_currency: loc?.base_currency ?? null,
  };

  const personalChoice = localStorage.getItem(USER_CHOICE_KEY);
  if (personalChoice) return null;
  return current.language;
}

/** Re-read after an admin changes the workspace language, without a reload. */
export async function refreshTenantLocale(): Promise<TenantLocale> {
  try {
    const me = await apiFetch('/v1/identity/me');
    applyTenantLocale(me?.tenant?.localization);
  } catch {
    // Keeping the last known values beats blanking the workspace's settings
    // because one request failed.
  }
  return current;
}

/**
 * The locale tag to format with.
 *
 * A person's own choice first, then the workspace's, then the browser's — the
 * same order of precedence the language itself follows.
 */
export function formattingLocale(): string {
  return localStorage.getItem(USER_CHOICE_KEY) || current.language || navigator.language || 'en';
}

const dateOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' };

/** A date in the workspace's timezone, not the reader's. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(formattingLocale(), {
    ...dateOpts,
    ...(current.timezone ? { timeZone: current.timezone } : {}),
  }).format(d);
}

/** A timestamp in the workspace's timezone — the point of setting one. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(formattingLocale(), {
    ...dateOpts,
    hour: '2-digit',
    minute: '2-digit',
    ...(current.timezone ? { timeZone: current.timezone } : {}),
  }).format(d);
}
