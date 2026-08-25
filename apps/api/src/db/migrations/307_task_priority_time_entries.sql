-- Migration 307: real `priority` column + real time tracking for Tasks.
--
-- Both were already displayed in the frontend (TasksApp.tsx priority
-- badges/filters/Kanban columns, and the "Start Timer"/"Total time logged"
-- widget) but silently fake: taskCreateSchema/taskPatchSchema never declared
-- either field, so a client PATCH carrying them was dropped by zod before
-- reaching the DB, and every reload reset both to their frontend defaults.
-- This fixes both for every tenant/tier — it's a bug fix, not new advanced
-- capability, so it isn't behind the tasks.advanced entitlement (306).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Real start/stop time entries, mirroring hr_time_entries' shape
-- (010_hr_time_tracking.sql) rather than shipment_time_entries' free-form
-- log (008) — the frontend's TaskTimerWidget is a genuine start/stop
-- stopwatch, not a manual hours-typed-in field.
CREATE TABLE IF NOT EXISTS task_time_entries (
  id               UUID PRIMARY KEY,
  tenant_id        UUID NOT NULL,
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_task ON task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_tenant ON task_time_entries(tenant_id);
-- At most one open (ended_at IS NULL) entry per task at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_time_entries_one_open_per_task
  ON task_time_entries(task_id) WHERE ended_at IS NULL;

ALTER TABLE task_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON task_time_entries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
