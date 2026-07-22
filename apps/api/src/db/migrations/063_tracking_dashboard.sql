-- 063_tracking_dashboard.sql
-- Add fields to support the Fleet Dashboard KPIs and detailed vehicle cards.

-- Drivers: Add avatar_url for the driver profiles on the vehicle cards.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='avatar_url') THEN
        ALTER TABLE drivers ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- Vehicles: Add current_load_pct to support the load status progress bar directly.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='current_load_pct') THEN
        ALTER TABLE vehicles ADD COLUMN current_load_pct INTEGER;
    END IF;
END $$;

-- Set random current_load_pct for existing vehicles so the UI looks populated
UPDATE vehicles SET current_load_pct = floor(random() * 100) WHERE current_load_pct IS NULL;

-- Set mock avatars for the seeded Tanzanian drivers
UPDATE drivers SET avatar_url = 'https://i.pravatar.cc/150?u=juma' WHERE name = 'Juma Kassim';
UPDATE drivers SET avatar_url = 'https://i.pravatar.cc/150?u=ally' WHERE name = 'Ally Salim';
UPDATE drivers SET avatar_url = 'https://i.pravatar.cc/150?u=peter' WHERE name = 'Peter Mshana';
UPDATE drivers SET avatar_url = 'https://i.pravatar.cc/150?u=david' WHERE name = 'David Ochieng';
UPDATE drivers SET avatar_url = 'https://i.pravatar.cc/150?u=john' WHERE name = 'John Doe' AND avatar_url IS NULL;

-- Make sure vehicles without driver have mock driver images for UI demo
UPDATE vehicles SET driver_name = 'Marcus Klein' WHERE driver_name IS NULL AND id IN (SELECT id FROM vehicles LIMIT 1);
UPDATE vehicles SET driver_name = 'Sofia Alvarez' WHERE driver_name IS NULL AND id IN (SELECT id FROM vehicles OFFSET 1 LIMIT 1);
UPDATE vehicles SET driver_name = 'Daniel Novak' WHERE driver_name IS NULL AND id IN (SELECT id FROM vehicles OFFSET 2 LIMIT 1);

-- Note: We do not create a separate dashboard_kpis table because KPIs (Total shipments, active fleet, etc)
-- should ideally be calculated from live data (e.g. COUNT(*) from shipments, COUNT(*) from vehicles where status = 'ACTIVE').
