import { describe, it, expect } from 'vitest';
import { computeRentalCost, type RateCardPricingInput } from '../lib/anga-rate-card-pricing.js';

const CARD: RateCardPricingInput = {
  dailyRateMinor: 10000, // 100.00 in major units
  minRentalDays: 1,
  minChargeMinor: 5000,
  tier7DiscountPercent: 10,
  tier30DiscountPercent: 20,
  tier90DiscountPercent: 35,
};

describe('computeRentalCost', () => {
  it('1 day: no tier discount', () => {
    const r = computeRentalCost(CARD, 1);
    expect(r.billedDays).toBe(1);
    expect(r.appliedDiscountPercent).toBe(0);
    expect(r.totalMinor).toBe(10000);
  });

  it('6 days: still below the 7-day tier, no discount', () => {
    const r = computeRentalCost(CARD, 6);
    expect(r.appliedDiscountPercent).toBe(0);
    expect(r.totalMinor).toBe(60000);
  });

  it('exactly 7 days: the 7-day tier discount applies', () => {
    const r = computeRentalCost(CARD, 7);
    expect(r.appliedDiscountPercent).toBe(10);
    expect(r.totalMinor).toBe(Math.round(10000 * 7 * 0.9));
  });

  it('8 days: still on the 7-day tier (not yet 30)', () => {
    const r = computeRentalCost(CARD, 8);
    expect(r.appliedDiscountPercent).toBe(10);
  });

  it('29 days: still on the 7-day tier', () => {
    const r = computeRentalCost(CARD, 29);
    expect(r.appliedDiscountPercent).toBe(10);
  });

  it('exactly 30 days: the 30-day tier discount applies', () => {
    const r = computeRentalCost(CARD, 30);
    expect(r.appliedDiscountPercent).toBe(20);
    expect(r.totalMinor).toBe(Math.round(10000 * 30 * 0.8));
  });

  it('31 days: still on the 30-day tier', () => {
    const r = computeRentalCost(CARD, 31);
    expect(r.appliedDiscountPercent).toBe(20);
  });

  it('89 days: still on the 30-day tier (not yet 90)', () => {
    const r = computeRentalCost(CARD, 89);
    expect(r.appliedDiscountPercent).toBe(20);
  });

  it('exactly 90 days: the deepest tier discount applies', () => {
    const r = computeRentalCost(CARD, 90);
    expect(r.appliedDiscountPercent).toBe(35);
    expect(r.totalMinor).toBe(Math.round(10000 * 90 * 0.65));
  });

  it('91 days: still on the 90-day tier', () => {
    const r = computeRentalCost(CARD, 91);
    expect(r.appliedDiscountPercent).toBe(35);
  });

  it('requested duration below minRentalDays is billed at the minimum', () => {
    const card = { ...CARD, minRentalDays: 3 };
    const r = computeRentalCost(card, 1);
    expect(r.billedDays).toBe(3);
    expect(r.totalMinor).toBe(30000);
  });

  it('the minimum charge floors the total even when the computed cost is lower', () => {
    const card = { ...CARD, dailyRateMinor: 100, minChargeMinor: 5000 };
    const r = computeRentalCost(card, 1);
    expect(r.baseCostMinor).toBe(100);
    expect(r.totalMinor).toBe(5000);
  });

  it('a zero-discount card at any tier still just charges daily rate x days', () => {
    const flatCard: RateCardPricingInput = { dailyRateMinor: 5000, minRentalDays: 1, minChargeMinor: 0, tier7DiscountPercent: 0, tier30DiscountPercent: 0, tier90DiscountPercent: 0 };
    const r = computeRentalCost(flatCard, 45);
    expect(r.totalMinor).toBe(5000 * 45);
  });
});
