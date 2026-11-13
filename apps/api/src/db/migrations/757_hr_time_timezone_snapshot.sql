-- Preserve the payroll calendar context used when a time interval begins.
-- Historical entries remain NULL because their original work timezone cannot
-- be inferred safely from a tenant's current preference.
ALTER TABLE hr_time_entries
  ADD COLUMN IF NOT EXISTS work_timezone VARCHAR(100);

COMMENT ON COLUMN hr_time_entries.work_timezone IS
  'IANA timezone snapshot at interval start; NULL on legacy rows with unknown context.';
