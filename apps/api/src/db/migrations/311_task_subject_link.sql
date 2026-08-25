-- Migration 311: "Related To" polymorphic linking (tasks.advanced) — the
-- same subject_type/subject_id convention notes.routes.ts, hr_workflow_cases,
-- and several others already use (see 265_notes_app.sql), not a new pattern.
-- No FK — like every other subject_type/subject_id pair in this platform,
-- the referenced table varies by subject_type, which Postgres FKs can't
-- express.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subject_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subject_id UUID;
CREATE INDEX IF NOT EXISTS idx_tasks_subject ON tasks(subject_type, subject_id);
