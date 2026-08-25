-- Migration 320: M8 of the standalone Projects app — a real project-level
-- activity feed. Mirrors task_activity_log's shape (283_tasks_collaboration.sql)
-- for project-level events (status changes, membership changes); the
-- project's Activity tab UNIONs this with task_activity_log rows for tasks
-- filed under the project (via tasks.project_id) at read time, in
-- application code, so task activity surfaces in the project feed without
-- duplicating any row.

CREATE TABLE IF NOT EXISTS project_activity_log (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL,
  action      TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_log_project ON project_activity_log(project_id);

ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON project_activity_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
