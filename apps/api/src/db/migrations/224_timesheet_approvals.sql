-- Weekly timesheet submission + manager approval for NexusHR.
-- One row per user per period; an employee submits a period for review and a
-- manager approves or rejects it. Worked-minutes is snapshotted at submit time
-- so a later edit can't silently change what was approved.

CREATE TABLE IF NOT EXISTS hr_timesheet_approvals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  status               VARCHAR(16) NOT NULL DEFAULT 'SUBMITTED',
  total_worked_minutes INTEGER NOT NULL DEFAULT 0,
  session_count        INTEGER NOT NULL DEFAULT 0,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_timesheet_approval_status_valid
    CHECK (status IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT hr_timesheet_approval_unique_period
    UNIQUE (tenant_id, user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_hr_timesheet_approvals_review
  ON hr_timesheet_approvals(tenant_id, status, period_start);

CREATE INDEX IF NOT EXISTS idx_hr_timesheet_approvals_user
  ON hr_timesheet_approvals(tenant_id, user_id, period_start);
