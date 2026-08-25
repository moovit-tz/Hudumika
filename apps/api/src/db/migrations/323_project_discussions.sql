-- Migration 323: M12 of the standalone Projects app — real project-level
-- Discussions, exact shape of todo_comments (283_tasks_collaboration.sql),
-- just keyed on project_id instead of task_id. Reuses the same
-- author_id/content/mentions-JSONB convention so the frontend's existing
-- MentionInput + comment-list UI pattern applies unchanged.

CREATE TABLE IF NOT EXISTS project_discussions (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL,
  content     TEXT NOT NULL,
  mentions    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_discussions_project ON project_discussions(project_id);

ALTER TABLE project_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_discussions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON project_discussions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
