-- Clock-in sessions and break tracking for NexusHR timesheets.

CREATE TABLE IF NOT EXISTS hr_clock_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  clock_in_at         TIMESTAMPTZ NOT NULL,
  clock_out_at        TIMESTAMPTZ,
  project_name        VARCHAR(128),
  status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  total_break_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes      INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_clock_session_status_valid
    CHECK (status IN ('ACTIVE', 'ON_BREAK', 'COMPLETED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS hr_clock_breaks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES hr_clock_sessions(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_clock_sessions_user_date
  ON hr_clock_sessions(tenant_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_hr_clock_sessions_active
  ON hr_clock_sessions(tenant_id, user_id, status) WHERE status IN ('ACTIVE', 'ON_BREAK');
