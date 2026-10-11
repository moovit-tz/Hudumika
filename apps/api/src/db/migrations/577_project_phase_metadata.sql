-- Persist gate review configuration alongside the existing phase schedule.
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
