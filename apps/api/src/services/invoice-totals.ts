/**
 * An invoice's grand total, expressed in the invoice's own currency.
 *
 * Every line is converted on its own currency against the invoice's, which is
 * the only thing that actually determines whether conversion is needed. This
 * used to be decided by `line_group`: anything tagged 'shipping' was treated
 * as foreign and multiplied by exchange_rate, anything else was assumed to be
 * base currency. That held only because a freight invoice happens to bill its
 * ocean leg under that label, and it is wrong twice over —
 *
 *   * it couples the finance core to a freight-specific grouping, so any other
 *     industry billing in a second currency is mis-totalled by construction;
 *   * there are already 4 USD lines sitting in the 'other' group. They total
 *     correctly today only because both their invoices carry exchange_rate 1.
 *     On a 2650 invoice the same line would be understated 2650-fold.
 *
 * Lines legitimately differ in currency from their invoice — a USD ocean
 * freight line on a TZS invoice is the normal shape of the document — so the
 * line currency stays. What changed is that it is now what gets read.
 */
export function invoiceGrandTotal(
  lines: { qty: unknown; rate: unknown; tax_pct: unknown; currency?: string | null }[],
  invoiceCurrency: string,
  exchangeRate: number,
): number {
  const base = (invoiceCurrency || 'TZS').toUpperCase();
  const total = lines.reduce((sum, l) => {
    // Round per-line before accumulating — floating-point drift on
    // 18% tax (1.1799999…) compounds across many lines otherwise.
    const lineGross = Math.round(Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100) * 100) / 100;
    // A line with no currency recorded is in the invoice's currency; that is
    // what the column's default has always meant.
    const cur = (l.currency || base).toUpperCase();
    const converted = cur === base ? lineGross : Math.round(lineGross * exchangeRate * 100) / 100;
    return sum + converted;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** The same conversion as invoiceGrandTotal, split into its net and tax parts.
 *
 * Both functions must use the same per-line gross, or net+tax drifts from
 * grandTotal. Derive tax as gross-net (not as net*rate) so that rounding
 * on net and on gross never produces a gap. */
export function invoiceNetAndTax(
  lines: { qty: unknown; rate: unknown; tax_pct: unknown; currency?: string | null }[],
  invoiceCurrency: string,
  exchangeRate: number,
): { net: number; tax: number } {
  const base = (invoiceCurrency || 'TZS').toUpperCase();
  const result = lines.reduce((acc, l) => {
    const cur = (l.currency || base).toUpperCase();
    const fx = cur === base ? 1 : exchangeRate;
    // Gross matches invoiceGrandTotal exactly — same formula, same rounding.
    const sourceGross = Math.round(Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100) * 100) / 100;
    const lineGross = fx === 1 ? sourceGross : Math.round(sourceGross * fx * 100) / 100;
    const lineNet   = Math.round(Number(l.qty) * Number(l.rate) * fx * 100) / 100;
    const lineTax   = Math.round((lineGross - lineNet) * 100) / 100;
    acc.net = Math.round((acc.net + lineNet) * 100) / 100;
    acc.tax = Math.round((acc.tax + lineTax) * 100) / 100;
    return acc;
  }, { net: 0, tax: 0 });
  return result;
}

