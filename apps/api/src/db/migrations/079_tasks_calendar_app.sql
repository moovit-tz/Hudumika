-- Migration 079: Real backend for the Tasks and Calendar apps.
--
-- Both apps are personal (per-user), not tenant-shared — each staff member
-- gets their own lists/tasks/events, the same way Google Tasks/Calendar work.
-- The frontend (apps/web/src/data/calendarStore.ts) always generates the
-- row id client-side and sends it on create, so optimistic local updates
-- never need server-side id reconciliation.

CREATE TABLE IF NOT EXISTS task_lists (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  user_id    UUID NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#0d7a6b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_lists_user ON task_lists(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  user_id      UUID NOT NULL,
  list_id      UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  due          DATE,
  starred      BOOLEAN NOT NULL DEFAULT FALSE,
  someday      BOOLEAN NOT NULL DEFAULT FALSE,
  status       TEXT NOT NULL DEFAULT 'none',
  tags         JSONB NOT NULL DEFAULT '[]',
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(tenant_id, user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);

CREATE TABLE IF NOT EXISTS task_subtasks (
  id         UUID PRIMARY KEY,
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task ON task_subtasks(task_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  description TEXT,
  location    TEXT,
  category    TEXT NOT NULL DEFAULT 'work',
  guests      JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(tenant_id, user_id, start_at);

CREATE TABLE IF NOT EXISTS user_app_settings (
  user_id               UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL,
  calendar_default_view TEXT NOT NULL DEFAULT 'month',
  week_starts_monday    BOOLEAN NOT NULL DEFAULT FALSE,
  tasks_default_view    TEXT NOT NULL DEFAULT 'today',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
