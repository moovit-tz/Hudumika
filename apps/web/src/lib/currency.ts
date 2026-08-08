import { apiFetch } from './api.js';

/**
 * Currency conversion for the whole app.
 *
 * This module used to export a frozen table of rates and convert against it:
 * TZS 2560 to the dollar, EUR 0.92, and so on, written down once and never
 * touched again. Every converted figure in FinOps — invoices, receivables,
 * dashboards, reports — came from those constants. The platform meanwhile
 * already had a live source: GET /v1/customs/fx-rates, which the Landed Cost
 * calculator uses and which returns 503 rather than invent a rate. On the day
 * this was written the live dollar was TZS 2,645, so every conversion was out
 * by about 3.2%, silently and in the same direction.
 *
 * Rates are now fetched from that same endpoint and cached. The old table
 * survives only as a clearly-labelled last resort, and callers can ask whether
 * what they are being shown is live — a wrong number that looks certain is
 * worse in a finance product than a number marked unverified.
 */

/** USD-based rates: how many units of the currency one USD buys. */
let _rates: Record<string, number> | null = null;
let _fetchedAt = 0;
let _inFlight: Promise<void> | null = null;

const CACHE_KEY = 'hudumika_fx_rates';
/** Rates older than this are refreshed. FX moves, but not by enough to justify
 *  a request per render — the Landed Cost page uses the same endpoint. */
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * The pre-existing hardcoded table, kept ONLY so that a page still renders a
 * number when the live service cannot be reached. It is stale by construction
 * and `ratesAreLive()` reports false while it is in use, so nothing presents
 * these as authoritative.
 */
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, TZS: 2560, EUR: 0.92, GBP: 0.79, KES: 133,
  UGX: 3700, ZAR: 18.5, AED: 3.67, CNY: 7.25,
};

/** Restore the last good rates so the first paint after a reload is not the
 *  stale fallback while the network round-trip is in flight. */
try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved?.rates && typeof saved.fetchedAt === 'number') {
      _rates = saved.rates;
      _fetchedAt = saved.fetchedAt;
    }
  }
} catch {
  // A corrupt cache is not worth failing over; the refresh below replaces it.
}

/**
 * Pull live rates. Safe to call repeatedly — concurrent callers share one
 * request, and a fresh cache short-circuits.
 */
export function refreshFxRates(force = false): Promise<void> {
  if (!force && _rates && Date.now() - _fetchedAt < MAX_AGE_MS) return Promise.resolve();
  if (_inFlight) return _inFlight;
  _inFlight = apiFetch('/v1/customs/fx-rates')
    .then((res: { base?: string; rates?: Record<string, number> }) => {
      const rates = res?.rates;
      // The endpoint answers 503 when it has nothing real to give. Anything
      // that is not a populated table is treated the same way: leave the
      // previous rates alone rather than overwrite them with nothing.
      if (rates && Object.keys(rates).length > 0) {
        _rates = { USD: 1, ...rates };
        _fetchedAt = Date.now();
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ rates: _rates, fetchedAt: _fetchedAt }));
        } catch { /* private mode / quota — the in-memory copy still works */ }
      }
    })
    .catch(() => {
      // Offline or unauthenticated. Keep whatever we had; ratesAreLive() will
      // say so if we had nothing.
    })
    .finally(() => { _inFlight = null; });
  return _inFlight;
}

/** True when conversions are using rates actually fetched from the service. */
export function ratesAreLive(): boolean {
  return _rates !== null;
}

/** When the live rates were last retrieved, or null if never. */
export function ratesFetchedAt(): Date | null {
  return _rates ? new Date(_fetchedAt) : null;
}

function table(): Record<string, number> {
  return _rates ?? FALLBACK_RATES;
}

export function convertAmount(amount: number, from: string, to: string): number {
  // The common case by far: a tenant's own currency, needing no rate at all.
  // Worth short-circuiting before anything else, because it is also the only
  // case that is correct whether or not the live service is reachable.
  if (from === to) return amount;
  const t = table();
  const inUSD = amount / (t[from] ?? 1);
  return inUSD * (t[to] ?? 1);
}

/** Whether a specific conversion can be done from live data. Same-currency is
 *  always true — it needs no rate. */
export function conversionIsLive(from: string, to: string): boolean {
  if (from === to) return true;
  return !!(_rates && _rates[from] != null && _rates[to] != null);
}

export function formatAmount(amount: number, currency: string): string {
  // Currencies whose smallest circulating unit is the unit itself — printing
  // "TZS 1,500.00" implies a precision the money does not have.
  const noDecimal = ['TZS', 'KES', 'UGX'].includes(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    // Intl throws on anything that is not a valid ISO 4217 code.
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/**
 * Retained for callers that still import it. Reads the live table when there
 * is one, so an old import does not quietly opt out of live rates.
 * @deprecated Use convertAmount, or refreshFxRates + ratesAreLive.
 */
export const EXCHANGE_RATES: Record<string, number> = new Proxy({} as Record<string, number>, {
  get: (_t, key: string) => table()[key],
  has: (_t, key: string) => key in table(),
  ownKeys: () => Reflect.ownKeys(table()),
  getOwnPropertyDescriptor: (_t, key: string) => ({
    value: table()[key], enumerable: true, configurable: true,
  }),
});
