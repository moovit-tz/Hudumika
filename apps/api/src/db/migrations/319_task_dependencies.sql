-- Migration 319: M4 of the standalone Projects app — task dependencies.
-- Visualization-only for v1 (shown on the task table, Kanban card, and as
-- Gantt connector lines in a later milestone) — a dependency does NOT block
-- completing the depended-on-by task. Whether that should become a hard
-- block or a soft warning is a real product-behavior decision left for the
-- user to weigh in on once the Gantt view makes dependencies visible
-- end-to-end; not assumed here.

CREATE TABLE IF NOT EXISTS task_dependencies (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_tenant ON task_dependencies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON task_dependencies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
