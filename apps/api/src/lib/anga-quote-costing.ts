/**
 * ANGA quote cost build-up — ported from the standalone Gereji app's
 * lib/anga/quote-costing.ts. Pure, no I/O. All *_minor fields are integer
 * minor units (never floats) — the quote total is always the sum of line
 * sell prices computed here, never a separately-entered figure that could
 * drift from its components.
 */
export type QuoteLineInput = {
  part_cost_minor: number;
  freight_minor: number;
  duty_vat_minor: number;
  clearance_fee_minor: number;
  handling_minor: number;
  margin_percent: number;
};

export type QuoteLineTotals = {
  line_cost_minor: number;
  margin_minor: number;
  sell_price_minor: number;
};

export function computeQuoteLine(input: QuoteLineInput): QuoteLineTotals {
  const line_cost_minor = Math.round(
    input.part_cost_minor + input.freight_minor + input.duty_vat_minor + input.clearance_fee_minor + input.handling_minor,
  );
  const margin_minor = Math.round(line_cost_minor * (input.margin_percent / 100));
  const sell_price_minor = line_cost_minor + margin_minor;
  return { line_cost_minor, margin_minor, sell_price_minor };
}

export type QuoteTotals = {
  subtotal_minor: number;
  margin_total_minor: number;
  total_minor: number;
};

export function computeQuoteTotals(lines: QuoteLineTotals[]): QuoteTotals {
  const subtotal_minor = lines.reduce((sum, l) => sum + l.line_cost_minor, 0);
  const margin_total_minor = lines.reduce((sum, l) => sum + l.margin_minor, 0);
  const total_minor = lines.reduce((sum, l) => sum + l.sell_price_minor, 0);
  return { subtotal_minor, margin_total_minor, total_minor };
}
