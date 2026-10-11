-- Migration 587: Per-user project bookmarks (favorites).
-- Same pattern as project_pins (325): existence of a row = bookmarked.

CREATE TABLE IF NOT EXISTS project_bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_bookmarks_user ON project_bookmarks(user_id, tenant_id);

ALTER TABLE project_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_bookmarks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON project_bookmarks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
