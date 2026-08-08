-- Attendance that becomes hours, and hours that become pay.
--
-- hr_attendance stores a status and two clock times and derives nothing from
-- them. There is no worked total, no overtime, and no record of how somebody
-- clocked, so 240 rows of attendance cannot answer "how many hours did this
-- person work in July", which is the only question the module exists for. A
-- "LATE" mark is likewise a judgement somebody typed rather than a computation:
-- shifts carry no grace period, so nothing defines late.
--
-- Overtime does not exist at all, and it is the part that costs money. Under
-- the ELRA it is paid at 1.5x the normal hourly rate, and at 2x for work on a
-- weekly rest day or a public holiday. Which multiplier applies is not a
-- property of the hours — it is a property of the date, and the holiday
-- calendar built earlier is what knows the answer. That link is the point of
-- this migration: without it somebody working Eid is quietly paid time and a
-- half instead of double.
--
-- The cap is 50 hours in a rolling four-week cycle. Not "12 hours a week",
-- which is the figure most systems encode and is not what the Act says — 12
-- hours is the maximum length of a working day, inclusive of breaks.

ALTER TABLE hr_shifts
  -- Minutes after start_time before an arrival counts as late. Without it,
  -- "late" is whatever the person entering the record decided that morning.
  ADD COLUMN IF NOT EXISTS grace_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_default    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active        BOOLEAN NOT NULL DEFAULT true;

-- Only one default, or "the default shift" is ambiguous exactly when it is
-- needed — for somebody with no explicit assignment.
CREATE UNIQUE INDEX IF NOT EXISTS hr_shifts_one_default
  ON hr_shifts (tenant_id) WHERE is_default;

ALTER TABLE hr_attendance
  ADD COLUMN IF NOT EXISTS shift_id         UUID REFERENCES hr_shifts(id) ON DELETE SET NULL,
  -- Derived from the clock times and the shift, never typed. NULL means not
  -- yet computed — distinct from zero, which means present and worked nothing.
  ADD COLUMN IF NOT EXISTS worked_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER,
  -- How the record came to exist. An HR officer defending a disputed absence
  -- needs to know whether a machine recorded it or somebody typed it.
  ADD COLUMN IF NOT EXISTS method           VARCHAR(16) NOT NULL DEFAULT 'MANUAL';

ALTER TABLE hr_attendance DROP CONSTRAINT IF EXISTS hr_attendance_method_valid;
ALTER TABLE hr_attendance ADD CONSTRAINT hr_attendance_method_valid
  CHECK (method IN ('MANUAL', 'WEB', 'MOBILE', 'BIOMETRIC', 'IMPORT'));

ALTER TABLE hr_attendance DROP CONSTRAINT IF EXISTS hr_attendance_minutes_sane;
ALTER TABLE hr_attendance ADD CONSTRAINT hr_attendance_minutes_sane
  CHECK ((worked_minutes IS NULL OR (worked_minutes >= 0 AND worked_minutes <= 1440))
     AND (overtime_minutes IS NULL OR (overtime_minutes >= 0 AND overtime_minutes <= 1440)));

-- ---------------------------------------------------------------------------
-- Overtime, as something somebody approves.
--
-- Separate from attendance because it is a decision, not an observation. Hours
-- worked are a fact; hours *paid* at a premium are an authorisation, and
-- somebody has to give it before it reaches a payslip.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_overtime_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  hours          NUMERIC(5,2) NOT NULL,
  -- NORMAL is a working day; the other two attract double time. Derived from
  -- the calendar rather than chosen, so nobody can select the cheaper one.
  kind           VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  -- Stored, not looked up at payment time: the rate that applied on the day
  -- worked is a fact about that day, and a later rate change must not rewrite
  -- what somebody earned.
  rate_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.50,
  reason         TEXT,
  status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  requested_by   UUID REFERENCES users(id),
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  decision_note  TEXT,
  /** Set once the hours have been carried into a payroll run. */
  paid_in_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_overtime_kind_valid
    CHECK (kind IN ('NORMAL', 'REST_DAY', 'PUBLIC_HOLIDAY')),
  CONSTRAINT hr_overtime_status_valid
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT hr_overtime_hours_sane
    CHECK (hours > 0 AND hours <= 12),
  CONSTRAINT hr_overtime_multiplier_sane
    CHECK (rate_multiplier >= 1 AND rate_multiplier <= 3),
  -- An approval with no approver is not an approval.
  CONSTRAINT hr_overtime_approved_has_approver
    CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  -- A rejection without a reason is unanswerable by the person rejected.
  CONSTRAINT hr_overtime_rejected_has_reason
    CHECK (status <> 'REJECTED' OR (decision_note IS NOT NULL AND length(btrim(decision_note)) > 0)),
  -- One claim per person per day. Two would each pass the four-week cap check
  -- and together exceed it.
  CONSTRAINT hr_overtime_one_per_day UNIQUE (tenant_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS hr_overtime_by_person
  ON hr_overtime_requests (tenant_id, user_id, date);
CREATE INDEX IF NOT EXISTS hr_overtime_pending
  ON hr_overtime_requests (tenant_id, status) WHERE status = 'PENDING';

ALTER TABLE hr_overtime_requests ENABLE ROW LEVEL SECURITY;
