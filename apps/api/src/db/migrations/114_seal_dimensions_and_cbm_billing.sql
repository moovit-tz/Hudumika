-- 114_seal_dimensions_and_cbm_billing.sql
-- Real physical dimensions + CBM-based storage billing (spec ask: "cost per
-- sqm per stored cbm"). 108_seal_location_capacity.sql deliberately deferred
-- the dimensional model in favor of an abstract capacity_units count; this
-- adds the real thing alongside it rather than replacing it — capacity_units
-- remains the fallback for any location/lot that never gets real dimensions
-- recorded (existing heat-grid/layout math keeps working unchanged).

-- A location's own footprint/volume, derived from its stored dimensions —
-- GENERATED so floor_area_sqm/volume_cbm can never drift from length/width/
-- height (same reproducibility discipline as the duty engine: the number is
-- always recomputed from its inputs, never hand-entered separately).
ALTER TABLE seal_locations ADD COLUMN length_m NUMERIC(8,3);
ALTER TABLE seal_locations ADD COLUMN width_m NUMERIC(8,3);
ALTER TABLE seal_locations ADD COLUMN height_m NUMERIC(8,3);
ALTER TABLE seal_locations ADD COLUMN floor_area_sqm NUMERIC(10,3)
  GENERATED ALWAYS AS (length_m * width_m) STORED;
ALTER TABLE seal_locations ADD COLUMN volume_cbm NUMERIC(12,4)
  GENERATED ALWAYS AS (length_m * width_m * height_m) STORED;

-- A lot's own physical volume/weight — what CBM-based storage billing
-- actually charges against (the space the STOCK occupies, not the location
-- it happens to sit in). Optional: a lot with no volume recorded simply
-- can't be billed by the per-CBM tier (the billing service surfaces this as
-- an explicit, honest error rather than silently defaulting to 0).
ALTER TABLE seal_lots ADD COLUMN volume_cbm NUMERIC(12,4);
ALTER TABLE seal_lots ADD COLUMN gross_weight_kg NUMERIC(12,3);

-- Per-compartment choice of storage-billing formula. A compartment bills
-- either a flat per-lot-per-day rate (storage_fee_per_day, existing) or a
-- per-CBM-per-day rate (new) — never both at once, so there's no ambiguity
-- about which number an invoice line traces to.
ALTER TABLE seal_compartments ADD COLUMN storage_fee_per_cbm_per_day NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE seal_compartments ADD COLUMN billing_method TEXT NOT NULL DEFAULT 'flat_per_lot'
  CHECK (billing_method IN ('flat_per_lot', 'per_cbm'));
