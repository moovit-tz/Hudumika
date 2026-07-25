-- 113_seal_storage_billing.sql
-- FinOps link — the original spec deliberately deferred "no billing" from
-- Increment 1 (106_seal_bonded_warehouse.sql's header note) and it was
-- never picked up since; this closes that gap. A per-compartment daily
-- storage tariff + flat handling fee, and a per-lot "billed through"
-- watermark so repeated invoice generation never double-bills the same
-- days — the same reproducibility discipline the duty engine already
-- follows (spec §5.7).

ALTER TABLE seal_compartments ADD COLUMN storage_fee_per_day NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE seal_compartments ADD COLUMN storage_fee_currency CHAR(3) NOT NULL DEFAULT 'TZS';
ALTER TABLE seal_compartments ADD COLUMN handling_fee_flat NUMERIC(12,4) NOT NULL DEFAULT 0;

-- Null = never billed; accrual starts from warehoused_on. Set to the
-- invoice's bill-through date every time a storage invoice is generated.
ALTER TABLE seal_lots ADD COLUMN storage_billed_through DATE;
