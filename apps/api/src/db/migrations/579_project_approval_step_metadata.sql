-- Preserve review-step labels while keeping canonical assignment and decision columns.
ALTER TABLE project_approval_steps ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
