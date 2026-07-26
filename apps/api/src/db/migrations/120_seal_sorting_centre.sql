-- 120_seal_sorting_centre.sql
-- Sorting Centre — the second warehouse type per the platform's own stated
-- phasing ("bonded warehouse approach first, then sorting centres and
-- fulfillment centres"). Deliberately reuses the existing lot/zone/location/
-- movement model rather than a parallel "parcel" system: a sorting-centre
-- compartment holds the same seal_lots rows everything else does, just
-- with different operational expectations (hours of dwell time, not days;
-- grouped by destination, not by customs status). The only new concepts
-- are (a) which real-world destination a lot/parcel is headed to next, and
-- (b) a zone_type for sortation lanes distinct from generic outbound
-- staging. Outbound dispatch reuses Increment 11b's fulfillment orders
-- unchanged — a "sort batch" IS a fulfillment order, just grouped by
-- destination_label instead of by customer.

ALTER TABLE seal_compartments DROP CONSTRAINT seal_compartments_warehouse_type_check;
ALTER TABLE seal_compartments ADD CONSTRAINT seal_compartments_warehouse_type_check
  CHECK (warehouse_type IN (
    'public_bonded','private_bonded','cfs','icd','virtual_icd','free_zone','duty_free_retail','excise',
    'sorting_centre'
  ));

ALTER TABLE seal_zones DROP CONSTRAINT seal_zones_zone_type_check;
ALTER TABLE seal_zones ADD CONSTRAINT seal_zones_zone_type_check
  CHECK (zone_type IN ('receiving','bulk','pick','vas','quarantine','outbound','yard','sort_lane'));

-- Where this lot/parcel is headed next (a city, hub code, or route
-- reference) — meaningful for sorting-centre lots, left null everywhere
-- else. A real field on the single source of truth for a lot, not a
-- second parallel "parcel" record.
ALTER TABLE seal_lots ADD COLUMN destination_label VARCHAR(200);
