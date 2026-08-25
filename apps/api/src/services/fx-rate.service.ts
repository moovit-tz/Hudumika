import { dbPlatform } from '../db/client.js';

/** Every currency this platform's documents actually use — invoices/bills
 *  default to TZS, with USD the other real-world currency ClearOS freight
 *  lines are typically quoted in (see invoices.routes.ts's own
 *  invoiceGrandTotal comment). KES/EUR/GBP included since they already
 *  appear as options in Bills.tsx/RecurringInvoices.tsx's currency
 *  selects — fetched against the same base so every pair this platform
 *  can actually produce a document in has a real rate. */
const BASE_CURRENCY = 'USD';
const TRACKED_CURRENCIES = ['TZS', 'KES', 'EUR', 'GBP'];
const API_URL = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;

/**
 * Fetches today's rates from a free, no-key exchange-rate API and stores
 * them. Uses the platform-wide fx_rates table (no tenant scoping — a rate
 * is a fact about the world, same reasoning as sanctions_entries having no
 * tenant_id). Failure here is a real, honest gap (no rate published for
 * today) rather than something to paper over with a fabricated number.
 */
export async function fetchAndStoreFxRates(today = new Date().toISOString().slice(0, 10)): Promise<{ stored: number }> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`FX rate API responded ${res.status}`);
  const json = await res.json() as { result: string; rates: Record<string, number> };
  if (json.result !== 'success' || !json.rates) throw new Error('FX rate API returned an unexpected response shape');

  let stored = 0;
  for (const quote of TRACKED_CURRENCIES) {
    const rate = json.rates[quote];
    if (!rate) continue;
    await dbPlatform.insertInto('fx_rates').values({
      rate_date: today, base_currency: BASE_CURRENCY, quote_currency: quote, rate, source: 'open.er-api.com',
    }).onConflict(oc => oc.columns(['rate_date', 'base_currency', 'quote_currency']).doUpdateSet({ rate, fetched_at: new Date(), source: 'open.er-api.com' })).execute();
    stored++;
  }
  return { stored };
}

/** Most recent published rate for a pair, on or before the given date —
 *  not strictly "today's," since a weekend/holiday gap shouldn't leave a
 *  document with no rate to offer at all. */
export async function getLatestFxRate(base: string, quote: string, onOrBefore = new Date().toISOString().slice(0, 10)): Promise<{ rate: number; date: string } | null> {
  if (base === quote) return { rate: 1, date: onOrBefore };
  const direct = await dbPlatform.selectFrom('fx_rates').select(['rate', 'rate_date'])
    .where('base_currency', '=', base).where('quote_currency', '=', quote)
    .where('rate_date', '<=', onOrBefore).orderBy('rate_date', 'desc').executeTakeFirst();
  if (direct) return { rate: Number(direct.rate), date: direct.rate_date };

  // Inverse — e.g. TZS->USD when only USD->TZS was fetched (USD is always the base).
  const inverse = await dbPlatform.selectFrom('fx_rates').select(['rate', 'rate_date'])
    .where('base_currency', '=', quote).where('quote_currency', '=', base)
    .where('rate_date', '<=', onOrBefore).orderBy('rate_date', 'desc').executeTakeFirst();
  if (inverse) return { rate: Math.round((1 / Number(inverse.rate)) * 1e6) / 1e6, date: inverse.rate_date };

  return null;
}
