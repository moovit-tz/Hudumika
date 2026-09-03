-- Benefits administration — confirmed entirely absent in the audit (no
-- health insurance or retirement-plan enrollment tracking anywhere).
-- Plans are tenant-defined; enrollment is real self-service (an employee
-- enrolls themself, same "MyHub"-style self-service precedent as payslips/
-- leave balances) with MGMT_ROLES able to manage on anyone's behalf too.
CREATE TABLE IF NOT EXISTS hr_benefit_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('health','retirement','life','other')),
  provider       TEXT,
  description    TEXT,
  employee_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
  employer_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'TZS',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE hr_benefit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_benefit_plans FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_benefit_plans'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_benefit_plans
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_benefit_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id        UUID NOT NULL REFERENCES hr_benefit_plans(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','waived','terminated')),
  dependents     INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminated_at  TIMESTAMPTZ,
  UNIQUE (tenant_id, employee_id, plan_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_benefit_enrollments_employee ON hr_benefit_enrollments(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_benefit_enrollments_plan ON hr_benefit_enrollments(tenant_id, plan_id);
ALTER TABLE hr_benefit_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_benefit_enrollments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_benefit_enrollments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_benefit_enrollments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
