-- Preserve client review requirements without claiming a completed client sign-off.
ALTER TABLE project_change_requests ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
