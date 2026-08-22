-- Migration 283: Real collaboration primitives for the Tasks app.
--
-- Tasks has always been strictly personal — every row scoped to exactly
-- one (tenant_id, user_id) pair, with no way to represent a second person
-- at all (see tasks.routes.ts's own header comment). This is the minimum
-- needed to coordinate work across people: assign a task to a colleague,
-- comment on it (with @mentions), and get a real audit trail — without
-- inventing an org-chart/manager concept the platform doesn't have
-- (migration 276_petti_workflows.sql already documents that hr_employments'
-- manager_id was dropped and nothing reliably resolves "my manager"), so a
-- task is assigned to a specific, EntityPicker-tagged colleague, the same
-- pattern sign_stamp_requests.approver_id already uses.
--
-- List/project sharing (seeing a colleague's whole list, not just one
-- assigned task) is a bigger, separate visibility rework and is
-- deliberately out of scope here.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
-- due stayed DATE-only (matches Google Tasks' own due-date column); this
-- adds an optional time-of-day without touching the existing due semantics
-- anywhere a bare date is enough.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TIME;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(tenant_id, assignee_id) WHERE assignee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS todo_comments (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  mentions   JSONB NOT NULL DEFAULT '[]', -- [{user_id, name}], same shape as task_comments.mentions (migration 016)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todo_comments_task ON todo_comments(task_id, created_at);
