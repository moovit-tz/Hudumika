-- 108_seal_location_capacity.sql
-- Adds a nominal slot capacity to seal_locations so the zone/bin occupancy
-- heat grid (spec §10.4 S3) has something real to compute a percentage
-- from. Occupancy = count of lots currently at that location / capacity —
-- a lot count, not a volume/weight model (spec's own length_mm/width_mm/
-- height_mm/max_weight_kg dimensional model is out of scope for this pass;
-- this is the simplest honest metric the existing schema already supports).
ALTER TABLE seal_locations ADD COLUMN capacity_units INTEGER NOT NULL DEFAULT 10;
