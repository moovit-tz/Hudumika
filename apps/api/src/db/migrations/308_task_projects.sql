-- Migration 308: Projects & Milestones — the first real project-management
-- entities in this platform. No table anywhere maps to a shared, kanban/
-- milestone-bearing "project" (the one other `*_projects` table, migration
-- 209's onsite_projects, is a flat color-coded folder for infrastructure
-- resources — name/description/color only, no status/dates/members). Gated
-- behind the 'tasks.advanced' entitlement (306) — HuduStarter tenants keep
-- simple-todo Tasks only.
--
-- Unlike task_lists (strictly personal — one user_id owner, migration 079's
-- own header), a project is tenant-shared by design: project_members is a
-- real multi-person roster, not a single owner + list_shares grant.

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#0d7a6b',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  owner_id    UUID NOT NULL,
  start_date  DATE,
  target_date DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

CREATE TABLE IF NOT EXISTS project_members (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS milestones (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL;
-- Visible only to the assignee + task owner + project owner, even within a
-- shared project whose other members could otherwise see it — the "Private
-- Task" toggle from the reference UI. Meaningless (and ignored) on a
-- personal, non-project task, which nobody but the owner/assignee/list-share
-- can see anyway.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'project_members', 'milestones']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
