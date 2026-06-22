-- Migration 015: Add project_id and project_ref to hr_time_entries
-- Links check-in time entries to shipment cases

ALTER TABLE hr_time_entries ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE hr_time_entries ADD COLUMN IF NOT EXISTS project_ref VARCHAR(200);
