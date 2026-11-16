-- Axis: every change to recorded time keeps the original, the person who made
-- it, the reason, and what it means for payroll that was already approved.
--
-- Before this, a correction overwrote hr_clock_sessions / hr_attendance in
-- place. The manual-session path copied the old values into hr_activity_log's
-- JSON, and the attendance and bulk-attendance paths kept nothing at all.
-- Approved timesheets were already locked (migration 633); a payroll run that
-- was approved or paid was not connected to later corrections in any way.
--
-- A row here is written in the same transaction as the change. The record and
-- the reason can't be edited or deleted afterwards; only the payroll review
-- fields can be filled in, once, by someone other than the person who made
-- the change.

CREATE TABLE IF NOT EXISTS hr_time_corrections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id),          -- whose time
  work_date        DATE NOT NULL,
  record_type      TEXT NOT NULL CHECK (record_type IN ('SESSION', 'ATTENDANCE')),
  record_id        UUID NOT NULL,
  before_values    JSONB NOT NULL,
  after_values     JSONB NOT NULL,
  reason           TEXT NOT NULL CHECK (length(btrim(reason)) >= 10),
  corrected_by     UUID NOT NULL REFERENCES users(id),
  corrected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The approved or paid payroll run whose period contains work_date, if any.
  payroll_run_id   UUID REFERENCES payroll_runs(id),
  payroll_run_status TEXT,
  review_status    TEXT NOT NULL DEFAULT 'NOT_NEEDED'
                   CHECK (review_status IN ('NOT_NEEDED', 'PENDING', 'REVIEWED')),
  review_outcome   TEXT CHECK (review_outcome IN ('NO_PAY_CHANGE', 'ADJUST_NEXT_RUN')),
  review_note      TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  CONSTRAINT hr_time_corrections_review_needs_run CHECK (review_status = 'NOT_NEEDED' OR payroll_run_id IS NOT NULL),
  CONSTRAINT hr_time_corrections_review_complete CHECK (
    (review_status = 'REVIEWED') = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_outcome IS NOT NULL)),
  CONSTRAINT hr_time_corrections_independent_review CHECK (reviewed_by IS NULL OR reviewed_by <> corrected_by)
);

CREATE INDEX IF NOT EXISTS idx_hr_time_corrections_person ON hr_time_corrections (tenant_id, user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_hr_time_corrections_pending ON hr_time_corrections (tenant_id, review_status) WHERE review_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_hr_time_corrections_record ON hr_time_corrections (tenant_id, record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs (tenant_id, period_start, period_end);

ALTER TABLE hr_time_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_time_corrections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_time_corrections;
CREATE POLICY tenant_isolation_policy ON hr_time_corrections
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE OR REPLACE FUNCTION hr_time_corrections_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Removing the whole workspace is the only way a correction goes away.
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_time_corrections_append_only', MESSAGE = 'Time corrections are permanent';
  END IF;
  IF (NEW.tenant_id, NEW.user_id, NEW.work_date, NEW.record_type, NEW.record_id, NEW.before_values, NEW.after_values,
      NEW.reason, NEW.corrected_by, NEW.corrected_at, NEW.payroll_run_id, NEW.payroll_run_status)
     IS DISTINCT FROM
     (OLD.tenant_id, OLD.user_id, OLD.work_date, OLD.record_type, OLD.record_id, OLD.before_values, OLD.after_values,
      OLD.reason, OLD.corrected_by, OLD.corrected_at, OLD.payroll_run_id, OLD.payroll_run_status)
     OR OLD.review_status <> 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_time_corrections_append_only', MESSAGE = 'Time corrections are permanent; only a pending payroll review can be completed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_time_corrections_append_only ON hr_time_corrections;
CREATE TRIGGER trg_hr_time_corrections_append_only
  BEFORE UPDATE OR DELETE ON hr_time_corrections
  FOR EACH ROW EXECUTE FUNCTION hr_time_corrections_append_only();

-- Rollback (only before any correction has been recorded you need to keep):
--   DROP TABLE hr_time_corrections; DROP FUNCTION hr_time_corrections_append_only();
--   DROP INDEX IF EXISTS idx_payroll_runs_period;
