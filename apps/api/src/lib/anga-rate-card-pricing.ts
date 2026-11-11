/**
 * ANGA rental rate-card pricing — ported verbatim from the standalone
 * Gereji app's lib/anga/rate-card-pricing.ts. Pure, no I/O. Duration-tier
 * discount is a step function over the whole billed duration.
 */
export type RateCardPricingInput = {
  dailyRateMinor: number;
  minRentalDays: number;
  minChargeMinor: number;
  tier7DiscountPercent: number;
  tier30DiscountPercent: number;
  tier90DiscountPercent: number;
};

export type RentalCost = {
  billedDays: number;
  appliedDiscountPercent: number;
  baseCostMinor: number;
  totalMinor: number;
};

export function computeRentalCost(rateCard: RateCardPricingInput, requestedDays: number): RentalCost {
  const billedDays = Math.max(requestedDays, rateCard.minRentalDays);

  const appliedDiscountPercent =
    billedDays >= 90 ? rateCard.tier90DiscountPercent :
    billedDays >= 30 ? rateCard.tier30DiscountPercent :
    billedDays >= 7 ? rateCard.tier7DiscountPercent :
    0;

  const baseCostMinor = Math.round(rateCard.dailyRateMinor * billedDays * (1 - appliedDiscountPercent / 100));
  const totalMinor = Math.max(rateCard.minChargeMinor, baseCostMinor);

  return { billedDays, appliedDiscountPercent, baseCostMinor, totalMinor };
}
