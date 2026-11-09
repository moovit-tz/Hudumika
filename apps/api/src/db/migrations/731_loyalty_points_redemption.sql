-- Migration 731: loyalty points redemption (S07 follow-up) — the other
-- half of migration 730. A customer can now spend previously-earned
-- points as a real POS tender, same mechanics as a gift card: the
-- redeemed value draws down the '2170' liability instead of debiting an
-- asset account.

ALTER TABLE pos_payments ADD COLUMN IF NOT EXISTS loyalty_points_redeemed NUMERIC(14,2);

-- Stores the EXACT points redeemed on the payment row rather than
-- recomputing them from pos_payments.amount at refund time via whatever
-- the program's redemption_value_per_point happens to be THEN — the rate
-- is tenant-editable (PUT /v1/loyalty/program), so recomputing could
-- silently restore the wrong number of points if it changed in between.
ALTER TABLE pos_payments DROP CONSTRAINT IF EXISTS pos_payments_method_check;
ALTER TABLE pos_payments ADD CONSTRAINT pos_payments_method_check CHECK (method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER', 'GIFT_CARD', 'LOYALTY_POINTS'));
