-- Migration 325: M14 of the standalone Projects app — per-user project
-- pinning. Same reasoning as Notes' own per-user pin/archive retrofit
-- (282_notes_enterprise.sql): a project is tenant-shared, so pinning must
-- be per-(project,user), not a column on the project row itself (which
-- would pin it for the whole team). Existence of a row = pinned; no
-- archive concept needed here (that's not asked for on Projects).

CREATE TABLE IF NOT EXISTS project_pins (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE project_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_pins FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON project_pins
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
