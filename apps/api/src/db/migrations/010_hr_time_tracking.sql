-- HR Task Types
CREATE TABLE IF NOT EXISTS hr_tasks (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  category     VARCHAR(100) NOT NULL DEFAULT 'General',
  is_billable  BOOLEAN      NOT NULL DEFAULT false,
  color        VARCHAR(20)  NOT NULL DEFAULT '#0891b2',
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_tasks_tenant ON hr_tasks(tenant_id);

-- HR Time Entries (check-in, task tracking, billable time)
CREATE TABLE IF NOT EXISTS hr_time_entries (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id          UUID         REFERENCES hr_tasks(id) ON DELETE SET NULL,
  task_name        VARCHAR(200),
  is_billable      BOOLEAN      NOT NULL DEFAULT false,
  started_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_minutes INTEGER,
  is_extended      BOOLEAN      NOT NULL DEFAULT false,
  is_full_day      BOOLEAN      NOT NULL DEFAULT false,
  notes            TEXT,
  entry_type       VARCHAR(50)  NOT NULL DEFAULT 'TASK',  -- CHECK_IN, TASK, BREAK
  date             DATE         NOT NULL DEFAULT CURRENT_DATE,
  last_ack_at      TIMESTAMPTZ,                           -- last 30-min reminder acknowledgement
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_time_entries_tenant_user_date ON hr_time_entries(tenant_id, user_id, date);
CREATE INDEX IF NOT EXISTS hr_time_entries_tenant_date     ON hr_time_entries(tenant_id, date);
