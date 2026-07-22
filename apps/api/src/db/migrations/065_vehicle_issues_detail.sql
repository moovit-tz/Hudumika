-- 065_vehicle_issues_detail.sql
-- Extends vehicle_issues with the fields needed for a full Issue Detail page
-- (assignment, due tracking, odometer snapshots at report/resolution time)
-- so an issue can be tracked end-to-end, not just opened/resolved.

ALTER TABLE vehicle_issues
  ADD COLUMN IF NOT EXISTS assigned_to        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_odometer_km    NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS odometer_km        NUMERIC(10,1),   -- snapshot at report time
  ADD COLUMN IF NOT EXISTS resolved_odometer_km NUMERIC(10,1), -- snapshot at resolution time
  ADD COLUMN IF NOT EXISTS source             VARCHAR(50) NOT NULL DEFAULT 'Manual'; -- Manual | Driver Report | Inspection

CREATE INDEX IF NOT EXISTS idx_vehicle_issues_assigned ON vehicle_issues(assigned_to);
