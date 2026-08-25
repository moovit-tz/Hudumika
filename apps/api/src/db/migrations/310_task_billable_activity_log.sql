-- Migration 310: billable/hourly-rate fields + a real activity log
-- (tasks.advanced). Today's "Comments & Activity" tab in the frontend only
-- ever renders comments — domain events (todo.assigned/completed/commented)
-- are emitted server-side purely to drive notifications and are never
-- persisted anywhere a UI could read them back as a feed. This gives
-- Projects mode a real one.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS task_activity_log (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   UUID NOT NULL,
  action     TEXT NOT NULL, -- 'created' | 'status_changed' | 'priority_changed' | 'assigned' | 'completed' | 'commented' | 'moved_project' | ...
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_activity_log_task ON task_activity_log(task_id, created_at);

ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON task_activity_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
