-- Payroll that can actually pay somebody.
--
-- hr_payroll has four numeric columns — basic_pay, allowances, deductions,
-- status — where "allowances" and "deductions" are each a single number. So
-- nothing records what was paid or why anything was withheld, and there is no
-- PAYE, social security, health insurance or employer levy anywhere. A payslip
-- cannot be produced from it and a return cannot be filed from it.
--
-- The shape here is taken from a working Tanzanian payroll, decoded from two of
-- its payslips and reconciled to the shilling on both. The order of operations
-- is the part worth writing down, because it is easy to get backwards and the
-- error is invisible until someone is underpaid:
--
--     taxable = gross - employee social security contribution
--     PAYE    = fixed_amount(band) + rate(band) x (taxable - band_lower)
--
-- Social security is a percentage of BASIC. Health insurance and the employer
-- levies are percentages of GROSS. Health insurance is NOT deducted before
-- PAYE — only contributions to an approved retirement fund are. Three different
-- bases in one calculation, which is exactly why this is data and not code.
--
-- Nothing here is Tanzania-specific in its structure. The bands are rows, the
-- schemes are rows, and the jurisdiction is a column — the same mechanism the
-- tax_codes work uses, for the same reason: the next country is a seed, not a
-- rewrite.

-- ---------------------------------------------------------------------------
-- Progressive tax bands.
--
-- Effective-dated because a band table that is edited in place cannot reproduce
-- a payslip issued last year, and a payslip that cannot be reproduced cannot be
-- defended in an audit.
--
-- fixed_amount is the cumulative tax at the bottom of the band. It is stored
-- rather than derived so that a jurisdiction whose published table does not
-- perfectly telescope can still be represented exactly as published.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_tax_bands (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction   VARCHAR(2)   NOT NULL,
  residency      VARCHAR(16)  NOT NULL DEFAULT 'RESIDENT',
  seq            INTEGER      NOT NULL,
  lower_bound    NUMERIC(16,2) NOT NULL,
  -- NULL is the open-ended top band. Absence is not zero: a NULL here means
  -- "no ceiling", and writing a large number instead would be a lie that
  -- eventually gets exceeded.
  upper_bound    NUMERIC(16,2),
  rate_pct       NUMERIC(7,4) NOT NULL,
  fixed_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  effective_from DATE         NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT payroll_tax_bands_residency_valid
    CHECK (residency IN ('RESIDENT', 'NON_RESIDENT')),
  CONSTRAINT payroll_tax_bands_range_sane
    CHECK (upper_bound IS NULL OR upper_bound > lower_bound),
  CONSTRAINT payroll_tax_bands_rate_sane
    CHECK (rate_pct >= 0 AND rate_pct <= 100),
  CONSTRAINT payroll_tax_bands_unique_seq
    UNIQUE (tenant_id, jurisdiction, residency, effective_from, seq)
);

CREATE INDEX IF NOT EXISTS payroll_tax_bands_lookup
  ON payroll_tax_bands (tenant_id, jurisdiction, residency, effective_from);

-- ---------------------------------------------------------------------------
-- Contribution and levy schemes.
--
-- One table for both sides because they differ only in which percentage is
-- non-zero: social security has both, the employer levies have only an employer
-- rate. Splitting them into two tables would duplicate every other column.
--
-- min_employees is the piece most likely to be hardcoded by mistake. The skills
-- levy applies only at 10 or more employees; a tenant that crosses that line
-- mid-year starts owing it, and must not have to notice that themselves. As a
-- column it is a rule the engine enforces; as an `if` in a service it is a bug
-- waiting for the threshold to change (it already did, from 4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_contribution_schemes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jurisdiction       VARCHAR(2)   NOT NULL,
  code               VARCHAR(24)  NOT NULL,
  name               VARCHAR(120) NOT NULL,
  employee_pct       NUMERIC(7,4) NOT NULL DEFAULT 0,
  employer_pct       NUMERIC(7,4) NOT NULL DEFAULT 0,
  -- Which figure the percentage is applied to. Getting this wrong is a silent
  -- mis-payment, never an error.
  calc_base          VARCHAR(16)  NOT NULL DEFAULT 'GROSS',
  -- Whether the employee's share comes off the income-tax base. True for an
  -- approved retirement fund; false for health insurance. This single flag is
  -- the difference between a correct payslip and a wrong one.
  reduces_tax_base   BOOLEAN      NOT NULL DEFAULT false,
  -- Headcount floor before the scheme applies at all (0 = always).
  min_employees      INTEGER      NOT NULL DEFAULT 0,
  -- Shown on the payslip, or an employer cost the employee never sees.
  on_payslip         BOOLEAN      NOT NULL DEFAULT true,
  active             BOOLEAN      NOT NULL DEFAULT true,
  effective_from     DATE         NOT NULL,
  effective_to       DATE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT payroll_schemes_base_valid
    CHECK (calc_base IN ('BASIC', 'GROSS', 'TAXABLE')),
  CONSTRAINT payroll_schemes_pct_sane
    CHECK (employee_pct >= 0 AND employee_pct <= 100
       AND employer_pct >= 0 AND employer_pct <= 100),
  CONSTRAINT payroll_schemes_unique
    UNIQUE (tenant_id, jurisdiction, code, effective_from)
);

-- ---------------------------------------------------------------------------
-- Named earnings and deductions.
--
-- taxable matters: a non-taxable allowance is in gross for payment but out of
-- the tax base. Storing the flag with the type, rather than deciding per run,
-- is what stops two runs treating the same allowance differently.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_component_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          VARCHAR(24)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  direction     VARCHAR(12)  NOT NULL,
  taxable       BOOLEAN      NOT NULL DEFAULT true,
  statutory     BOOLEAN      NOT NULL DEFAULT false,
  default_amount NUMERIC(16,2),
  frequency     VARCHAR(16)  NOT NULL DEFAULT 'MONTHLY',
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT payroll_component_direction_valid
    CHECK (direction IN ('EARNING', 'DEDUCTION')),
  CONSTRAINT payroll_component_frequency_valid
    CHECK (frequency IN ('MONTHLY', 'ANNUAL', 'ONE_OFF')),
  CONSTRAINT payroll_component_types_unique UNIQUE (tenant_id, code)
);

-- What a specific person is paid or has withheld, over and above their basic.
CREATE TABLE IF NOT EXISTS payroll_employee_components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  component_type_id UUID NOT NULL REFERENCES payroll_component_types(id) ON DELETE CASCADE,
  amount         NUMERIC(16,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_emp_component_amount_sane CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS payroll_employee_components_lookup
  ON payroll_employee_components (tenant_id, user_id, effective_from);

-- ---------------------------------------------------------------------------
-- Runs and payslips.
--
-- A payslip stores its own computed figures rather than recomputing on read.
-- Rates change, bands change, and someone's allowances change; a payslip that
-- recomputes is a payslip that quietly rewrites history. What was paid is a
-- fact, and facts get stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(120) NOT NULL,
  period_year    INTEGER NOT NULL,
  period_month   INTEGER NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  jurisdiction   VARCHAR(2) NOT NULL DEFAULT 'TZ',
  status         VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  -- Headcount at the moment of calculation, because the levy thresholds depend
  -- on it and it must not drift after the fact.
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_gross    NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_net      NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Three totals that the competitor's screen collapses into one, wrongly:
  -- what the employer spends on top of pay, what it merely forwards on the
  -- employee's behalf, and the resulting cash out of the door.
  total_employee_deductions NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_employer_cost       NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_remitted            NUMERIC(16,2) NOT NULL DEFAULT 0,
  calculated_at  TIMESTAMPTZ,
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_status_valid
    CHECK (status IN ('DRAFT', 'CALCULATED', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED')),
  CONSTRAINT payroll_runs_month_valid CHECK (period_month BETWEEN 1 AND 12),
  -- An approved run must say who approved it. An approval with no approver is
  -- not an approval.
  CONSTRAINT payroll_runs_approved_has_approver
    CHECK (status NOT IN ('APPROVED', 'PAID') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT payroll_runs_unique_period UNIQUE (tenant_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS payroll_payslips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id         UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  residency      VARCHAR(16) NOT NULL DEFAULT 'RESIDENT',
  basic_pay      NUMERIC(16,2) NOT NULL DEFAULT 0,
  gross_pay      NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- The income-tax base after the retirement-fund deduction. Stored because it
  -- is the number an auditor asks about and re-deriving it needs the rates that
  -- applied on the day.
  taxable_pay    NUMERIC(16,2) NOT NULL DEFAULT 0,
  income_tax     NUMERIC(16,2) NOT NULL DEFAULT 0,
  employee_contributions NUMERIC(16,2) NOT NULL DEFAULT 0,
  other_deductions       NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_deductions       NUMERIC(16,2) NOT NULL DEFAULT 0,
  employer_contributions NUMERIC(16,2) NOT NULL DEFAULT 0,
  net_pay        NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Every line that made up the figures above, so a payslip can be explained
  -- line by line without re-running anything.
  lines          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_payslips_unique_person UNIQUE (run_id, user_id)
);

CREATE INDEX IF NOT EXISTS payroll_payslips_by_user
  ON payroll_payslips (tenant_id, user_id);

-- Statutory identity. Tax residency is here rather than in a profile blob
-- because it changes the calculation outright — a non-resident is a flat rate
-- with no free band — and a value the engine depends on should not live
-- somewhere it can be edited by accident.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tax_residency   VARCHAR(16),
  ADD COLUMN IF NOT EXISTS national_id     VARCHAR(40),
  ADD COLUMN IF NOT EXISTS tax_id          VARCHAR(40),
  ADD COLUMN IF NOT EXISTS social_security_no VARCHAR(40),
  ADD COLUMN IF NOT EXISTS health_insurance_no VARCHAR(40),
  ADD COLUMN IF NOT EXISTS basic_salary    NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS pay_currency    VARCHAR(3);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tax_residency_valid;
ALTER TABLE users ADD CONSTRAINT users_tax_residency_valid
  CHECK (tax_residency IS NULL OR tax_residency IN ('RESIDENT', 'NON_RESIDENT'));

ALTER TABLE payroll_tax_bands            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_contribution_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_component_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employee_components  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_payslips             ENABLE ROW LEVEL SECURITY;
