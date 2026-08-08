import { useCompany } from '../data/companyStore.js';
import { convertAmount, formatAmount } from '../lib/currency.js';

/** Largest first, so the first match is the right tier. Quadrillion is the top
 *  because a trillion USD is ~2.6 quadrillion TZS, and a shilling-denominated
 *  tenant is exactly who needs the short form most. */
const TIERS: [number, string][] = [
  [1e15, 'Q'],
  [1e12, 'T'],
  [1e9,  'B'],
  [1e6,  'M'],
];

export function useCurrency() {
  const { currency } = useCompany();

  function convert(amount: number, fromCurrency: string): number {
    return convertAmount(amount, fromCurrency, currency);
  }

  function fmt(amount: number, fromCurrency?: string): string {
    const v = fromCurrency ? convert(amount, fromCurrency) : amount;
    return formatAmount(v, currency);
  }

  /**
   * A short form for cards and chips, where the box is fixed and the figure is
   * meant to be read at a glance.
   *
   * The ladder used to stop at B, which is precisely where a low-denomination
   * currency starts needing it: a trillion dollars rendered "$1000.0B", and the
   * same money in shillings rendered "TZS 2646444.4B" — fourteen characters
   * that are neither compact nor idiomatic. It now runs to quadrillions, which
   * covers a trillion USD in TZS (~2.6 quadrillion) with room over.
   */
  function fmtCompact(amount: number, fromCurrency?: string): string {
    const v = fromCurrency ? convert(amount, fromCurrency) : amount;
    const abs = Math.abs(v);
    const sym = getCurrencySymbol(currency);
    for (const [limit, suffix] of TIERS) {
      if (abs >= limit) {
        const scaled = v / limit;
        // One decimal below 100, none above: "2.6Q" and "265T" are both four
        // characters, where "264.6T" would be six and buys no useful precision
        // at that magnitude.
        return `${sym}${scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : 1)}${suffix}`;
      }
    }
    if (abs >= 1_000) return `${sym}${(v / 1_000).toFixed(0)}k`;
    return formatAmount(v, currency);
  }

  return { currency, fmt, fmtCompact, convert };
}

function getCurrencySymbol(code: string): string {
  try {
    const formatted = formatAmount(1, code);
    const m = formatted.match(/^[^0-9,.]+/);
    return m ? m[0] : code + ' ';
  } catch {
    return code + ' ';
  }
}
