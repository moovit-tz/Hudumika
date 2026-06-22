import { useCompany } from '../data/companyStore.js';
import { convertAmount, formatAmount } from '../lib/currency.js';

export function useCurrency() {
  const { currency } = useCompany();

  function convert(amount: number, fromCurrency: string): number {
    return convertAmount(amount, fromCurrency, currency);
  }

  function fmt(amount: number, fromCurrency?: string): string {
    const v = fromCurrency ? convert(amount, fromCurrency) : amount;
    return formatAmount(v, currency);
  }

  function fmtCompact(amount: number, fromCurrency?: string): string {
    const v = fromCurrency ? convert(amount, fromCurrency) : amount;
    const abs = Math.abs(v);
    const sym = getCurrencySymbol(currency);
    if (abs >= 1_000_000_000) return `${sym}${(v / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000)     return `${sym}${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)         return `${sym}${(v / 1_000).toFixed(0)}k`;
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
