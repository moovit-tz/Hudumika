-- Migration 309: multi-person task collaboration (tasks.advanced) — the
-- plural "Assignees" + "Followers" pickers from the reference UI. The
-- existing single `tasks.assignee_id` (migration 283) stays exactly as it
-- is and keeps driving the "Assigned to me" smart view and simple-mode UI
-- unchanged; this is an additive roster for Projects mode, not a
-- replacement — migration 283's own header is explicit that Tasks "has
-- always been strictly personal" with no way to represent a second person,
-- and a single assignee_id still can't hold more than one.

CREATE TABLE IF NOT EXISTS task_collaborators (
  id        UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  task_id   UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('assignee', 'follower')),
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_task_collaborators_task ON task_collaborators(task_id);
CREATE INDEX IF NOT EXISTS idx_task_collaborators_user ON task_collaborators(tenant_id, user_id);

ALTER TABLE task_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_collaborators FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON task_collaborators
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
