-- Leave that knows what somebody is owed.
--
-- hr_leaves recorded requests and nothing else: a type as free text, a day
-- count sent by the client, and a status. There was no entitlement anywhere, so
-- nobody could be told how much leave they had left and every approver was
-- deciding blind. Approving a request has, until now, meant approving an
-- unknown quantity of an unknown allowance.
--
-- Two things about Tanzanian leave that a naive model gets wrong, both of them
-- expensive:
--
-- 1. The leave cycle runs from the employment anniversary, not the calendar
--    year. Somebody who joined in September has a cycle of September–August.
--    A system that resets everyone on 1 January hands a September joiner a
--    fresh 28 days after four months, and takes days off someone who joined in
--    December. Hence `cycle_start`/`cycle_end` on each balance row rather than
--    a `year` column.
--
-- 2. Not every entitlement is annual. Annual leave and paternity run on a
--    12-month cycle; sick leave and maternity run on 36 months. Storing a
--    "days per year" figure — which is what the product this was compared
--    against does — makes 126 days of sick leave into 378 over three years,
--    three times the statutory entitlement. Hence `cycle_months`.
--
-- Sick leave is also not paid at one rate: the first 63 days are full pay and
-- the next 63 are half. `full_pay_days` carries that, so payroll can pay it
-- correctly instead of assuming every approved day is worth a full day's wage.

-- Needed before any of the above can be computed. hr_employments has the right
-- shape but holds zero rows, so the date is put where the engine can reach it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS hire_date DATE;

-- Backfilled from account creation, which is the only evidence available. It is
-- a reasonable proxy and it is not the same thing — a person hired years before
-- this system existed has a cycle that starts on the wrong day, and the only
-- fix is for someone to enter the real date.
UPDATE users SET hire_date = created_at::date WHERE hire_date IS NULL;

CREATE TABLE IF NOT EXISTS hr_leave_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code              VARCHAR(24)  NOT NULL,
  name              VARCHAR(120) NOT NULL,
  days_entitled     NUMERIC(6,2) NOT NULL,
  -- 12 for annual and paternity, 36 for sick and maternity.
  cycle_months      INTEGER      NOT NULL DEFAULT 12,
  -- Days paid in full before the rate drops. NULL means every day is full pay.
  full_pay_days     NUMERIC(6,2),
  -- The rate for days beyond full_pay_days, as a percentage.
  reduced_pay_pct   NUMERIC(5,2),
  paid              BOOLEAN      NOT NULL DEFAULT true,
  -- 0 means what it says: unused days are lost at the end of the cycle.
  carry_forward_max NUMERIC(6,2) NOT NULL DEFAULT 0,
  requires_document BOOLEAN      NOT NULL DEFAULT false,
  -- 'ALL', or restricted where the statute itself restricts it.
  applies_to        VARCHAR(16)  NOT NULL DEFAULT 'ALL',
  min_service_months INTEGER     NOT NULL DEFAULT 0,
  -- True where the entitlement comes from statute rather than company policy.
  -- A tenant may exceed a statutory minimum but should know when it is editing
  -- one.
  statutory         BOOLEAN      NOT NULL DEFAULT false,
  active            BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_types_unique UNIQUE (tenant_id, code),
  CONSTRAINT hr_leave_types_cycle_valid CHECK (cycle_months > 0 AND cycle_months <= 120),
  CONSTRAINT hr_leave_types_days_sane CHECK (days_entitled >= 0),
  CONSTRAINT hr_leave_types_applies_valid CHECK (applies_to IN ('ALL', 'FEMALE', 'MALE')),
  -- A reduced rate is meaningless without a point at which it starts.
  CONSTRAINT hr_leave_types_reduced_needs_threshold
    CHECK (reduced_pay_pct IS NULL OR full_pay_days IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS hr_leave_balances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id  UUID NOT NULL REFERENCES hr_leave_types(id) ON DELETE CASCADE,
  -- The cycle this row is about, anchored to the person's hire date.
  cycle_start    DATE NOT NULL,
  cycle_end      DATE NOT NULL,
  entitled       NUMERIC(6,2) NOT NULL DEFAULT 0,
  carried_forward NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- Derived from approved requests, never typed.
  taken          NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- Requests awaiting a decision. Held against the balance so two pending
  -- requests cannot each be approved against the same remaining days.
  pending        NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- A manual correction, which must be explained. An unexplained adjustment to
  -- somebody's leave is indistinguishable from an error.
  adjustment     NUMERIC(6,2) NOT NULL DEFAULT 0,
  adjustment_note TEXT,
  recomputed_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_leave_balances_unique UNIQUE (tenant_id, user_id, leave_type_id, cycle_start),
  CONSTRAINT hr_leave_balances_cycle_sane CHECK (cycle_end > cycle_start),
  CONSTRAINT hr_leave_balances_adjustment_explained
    CHECK (adjustment = 0 OR (adjustment_note IS NOT NULL AND length(btrim(adjustment_note)) > 0))
);

CREATE INDEX IF NOT EXISTS hr_leave_balances_lookup
  ON hr_leave_balances (tenant_id, user_id, cycle_start);

-- Link a request to its type, so a balance can be derived at all. Kept nullable
-- because existing rows carry free-text types that may not map to anything.
ALTER TABLE hr_leaves
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES hr_leave_types(id),
  -- Half-pay days within an approved sick-leave request, for payroll.
  ADD COLUMN IF NOT EXISTS full_pay_days NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS reduced_pay_days NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS hr_leaves_type_lookup
  ON hr_leaves (tenant_id, user_id, leave_type_id, status);

ALTER TABLE hr_leave_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_balances ENABLE ROW LEVEL SECURITY;
