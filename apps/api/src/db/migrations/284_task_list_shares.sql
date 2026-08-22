-- Migration 284: Share a task list with specific colleagues.
--
-- Phase 1 (migration 283) gave a single task a second person via assignment.
-- This gives a whole LIST a second person — the other half of "Blocking"
-- from the Tasks enterprise audit: a manager can't see a team's workload
-- via one-task-at-a-time assignment alone, and there was no shared
-- workspace concept at all. Same EntityPicker-tagged-colleague pattern as
-- assignment and sign_stamp_requests — not an org-chart, which this
-- platform doesn't reliably have.
--
-- Two roles only: viewer (read-only) and editor (can add/work tasks on the
-- list, same restricted field set an assignee already gets — can't
-- reassign, move, or delete someone else's task). List ownership itself
-- never transfers; sharing only ever adds readers/co-workers.

CREATE TABLE IF NOT EXISTS task_list_shares (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  list_id    UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  shared_by  UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_list_shares_user ON task_list_shares(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_task_list_shares_list ON task_list_shares(list_id);
