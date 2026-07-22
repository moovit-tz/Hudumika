-- 064_vehicle_telemetry_cargo.sql
-- Extends the fleet schema with the fields needed for a richer vehicle
-- card/registration form: static classification (fuel type, fleet group),
-- per-trip cargo attributes (what's being hauled right now), and live
-- telemetry (battery/ignition) carried on each GPS ping alongside
-- speed/heading — mirrors how those already work.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS fuel_type  VARCHAR(20),   -- DIESEL | PETROL | ELECTRIC | HYBRID
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);  -- fleet/operational grouping label

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS cargo_type        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cargo_weight_kg   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cargo_temp_c      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS load_capacity_pct NUMERIC(5,2);

ALTER TABLE vehicle_positions
  ADD COLUMN IF NOT EXISTS battery_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ignition    VARCHAR(10);  -- ON | OFF
