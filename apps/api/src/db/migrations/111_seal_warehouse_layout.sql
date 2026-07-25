-- 111_seal_warehouse_layout.sql
-- Real warehouse layout/space-planning support — the previous "heat grid"
-- page (108_seal_location_capacity.sql) only modeled a flat lot-count vs
-- capacity_units ratio with no vertical dimension and no floor plan
-- position. This adds the two things actually requested: multi-floor
-- (ground + mezzanine levels) and vertical stacking tiers within a single
-- location, plus a grid position so a location can be placed on a real 2D
-- floor plan for planning/mapping rather than just listed.

ALTER TABLE seal_locations ADD COLUMN floor_level INTEGER NOT NULL DEFAULT 0;      -- 0 = ground, 1 = mezzanine 1, 2 = mezzanine 2, ...
ALTER TABLE seal_locations ADD COLUMN max_stack_tiers INTEGER NOT NULL DEFAULT 1;  -- vertical layers this location can hold (1 = no stacking)
ALTER TABLE seal_locations ADD COLUMN grid_row INTEGER;                            -- position on the floor's 2D layout grid — null until placed
ALTER TABLE seal_locations ADD COLUMN grid_col INTEGER;

-- Which vertical tier within its current_location_id a lot occupies.
-- Total slots at a location = capacity_units * max_stack_tiers; a lot's
-- tier is a placement detail, not a capacity multiplier on its own.
ALTER TABLE seal_lots ADD COLUMN stack_tier INTEGER NOT NULL DEFAULT 1;
