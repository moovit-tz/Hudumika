import { describe, expect, it } from 'vitest';
import { computeQuoteLine, computeQuoteTotals } from '../lib/anga-quote-costing.js';

describe('ANGA quote cost build-up', () => {
  it('rolls part/freight/duty-VAT/clearance/handling into line cost, then applies margin', () => {
    const line = computeQuoteLine({
      part_cost_minor: 100_00, freight_minor: 20_00, duty_vat_minor: 15_00,
      clearance_fee_minor: 5_00, handling_minor: 2_50, margin_percent: 20,
    });
    expect(line.line_cost_minor).toBe(142_50);
    expect(line.margin_minor).toBe(28_50);
    expect(line.sell_price_minor).toBe(171_00);
  });

  it('rounds to the nearest minor unit rather than carrying fractional cents', () => {
    const line = computeQuoteLine({ part_cost_minor: 100, freight_minor: 0, duty_vat_minor: 0, clearance_fee_minor: 0, handling_minor: 0, margin_percent: 33.33 });
    expect(line.margin_minor).toBe(Math.round(100 * 0.3333));
    expect(Number.isInteger(line.margin_minor)).toBe(true);
    expect(Number.isInteger(line.sell_price_minor)).toBe(true);
  });

  it('quote totals are always the sum of line totals, never an independently entered figure', () => {
    const lines = [
      computeQuoteLine({ part_cost_minor: 1000, freight_minor: 0, duty_vat_minor: 0, clearance_fee_minor: 0, handling_minor: 0, margin_percent: 10 }),
      computeQuoteLine({ part_cost_minor: 2000, freight_minor: 100, duty_vat_minor: 0, clearance_fee_minor: 0, handling_minor: 0, margin_percent: 15 }),
    ];
    const totals = computeQuoteTotals(lines);
    expect(totals.subtotal_minor).toBe(lines[0].line_cost_minor + lines[1].line_cost_minor);
    expect(totals.margin_total_minor).toBe(lines[0].margin_minor + lines[1].margin_minor);
    expect(totals.total_minor).toBe(lines[0].sell_price_minor + lines[1].sell_price_minor);
  });

  it('zero lines produce zero totals, not an error', () => {
    expect(computeQuoteTotals([])).toEqual({ subtotal_minor: 0, margin_total_minor: 0, total_minor: 0 });
  });
});
