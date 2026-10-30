-- Keep the readable action short; preserve correction evidence separately.
ALTER TABLE hr_activity_log ADD COLUMN metadata jsonb;
