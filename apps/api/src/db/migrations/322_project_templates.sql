-- Migration 322: M11 of the standalone Projects app — real project
-- templates. A snapshot of a project's milestone-set + task-shape (names,
-- descriptions, priority, tags, milestone grouping), NOT a live project and
-- NOT tied to real dates — a template is reusable structure, so it
-- deliberately does not capture due_date/start_date, only relative
-- milestone/task grouping. "Save as template" reads an existing project
-- into this row; "New from template" reads it back out to seed a new
-- project's milestones/tasks.

CREATE TABLE IF NOT EXISTS project_templates (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  color        VARCHAR(30),
  billing_type TEXT,
  snapshot     JSONB NOT NULL DEFAULT '{}',
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON project_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
