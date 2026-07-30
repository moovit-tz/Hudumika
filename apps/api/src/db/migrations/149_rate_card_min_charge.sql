-- Migration 149: minimum charge on rate-card items.
--
-- LCL and Air rates are quoted per unit of measure (per CBM, per kg) rather
-- than per container, and carriers apply a floor so a very small consignment
-- still pays a viable minimum. Without this column an LCL shipment of 0.4 CBM
-- would compute a handling charge of a couple of dollars, which no operator
-- actually charges.
--
-- Nullable on purpose: NULL means "no floor applies", which is the correct
-- state for every per-container FCL row. It is NOT the same as 0, and the
-- service must treat the two differently — 0 would be a real (if useless)
-- floor, NULL means don't apply one at all.

ALTER TABLE clearos_rate_card_items
  ADD COLUMN IF NOT EXISTS min_charge NUMERIC(14,2);

COMMENT ON COLUMN clearos_rate_card_items.min_charge IS
  'Optional floor in rate_currency for per-CBM/per-kg rates (LCL, Air). NULL = no minimum applies.';
