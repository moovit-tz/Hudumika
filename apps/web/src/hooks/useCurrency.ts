import { useCompany } from '../data/companyStore.js';
import { convertAmount, formatAmount, formatCompact } from '../lib/currency.js';

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
    return formatCompact(v, currency);
  }

  return { currency, fmt, fmtCompact, convert };
}
