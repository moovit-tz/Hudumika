-- Workforce planning: an approved headcount is a decision, not a count.
-- Nothing anywhere let a tenant say "Sales should have 12 people this year"
-- separately from how many it actually has or how many jobs are open for
-- it — the three numbers the audit brief explicitly said must never be
-- conflated. This is the first (approved headcount); the other two are
-- computed live off users.department_id (migration 398) and
-- hr_requisitions.department_id (migration 399), not stored here.

CREATE TABLE IF NOT EXISTS hr_headcount_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id       UUID NOT NULL REFERENCES hr_departments(id) ON DELETE CASCADE,
  fiscal_year         INTEGER NOT NULL,
  approved_headcount  INTEGER NOT NULL DEFAULT 0,
  budget_amount       NUMERIC(14,2),
  budget_currency     VARCHAR(10),
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_headcount_plans_unique UNIQUE (tenant_id, department_id, fiscal_year),
  CONSTRAINT hr_headcount_plans_nonneg CHECK (approved_headcount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_hr_headcount_plans_year ON hr_headcount_plans(tenant_id, fiscal_year);

DO $$
BEGIN
  ALTER TABLE hr_headcount_plans ENABLE ROW LEVEL SECURITY;
  ALTER TABLE hr_headcount_plans FORCE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_headcount_plans'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_headcount_plans
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
