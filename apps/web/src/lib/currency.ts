export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  TZS: 2560,
  EUR: 0.92,
  GBP: 0.79,
  KES: 133,
  UGX: 3700,
  ZAR: 18.5,
  AED: 3.67,
  CNY: 7.25,
};

export function convertAmount(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const inUSD = amount / (EXCHANGE_RATES[from] ?? 1);
  return inUSD * (EXCHANGE_RATES[to] ?? 1);
}

export function formatAmount(amount: number, currency: string): string {
  const noDecimal = ['TZS', 'KES', 'UGX'].includes(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
