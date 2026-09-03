-- Disciplinary / case management — confirmed entirely absent in the audit
-- (no HR case tracking, PIPs, or grievance workflow anywhere). Deliberately
-- MGMT_ROLES-only, not employee-self-visible: this is HR/manager working
-- data about a person, not a personal record they browse the way they do
-- their own payslips or leave balance — a real design decision, not an
-- oversight, and worth revisiting explicitly if that's ever wanted.
CREATE TABLE IF NOT EXISTS hr_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_type       TEXT NOT NULL CHECK (case_type IN ('verbal_warning','written_warning','pip','suspension','termination','grievance','other')),
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  opened_by       UUID REFERENCES users(id),
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_cases_employee ON hr_cases(tenant_id, employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hr_cases_status ON hr_cases(tenant_id, status);

ALTER TABLE hr_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_cases FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_cases'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_cases
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- The case's own timeline — notes, status changes, meetings held.
CREATE TABLE IF NOT EXISTS hr_case_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id    UUID NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id),
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_case_notes_case ON hr_case_notes(case_id, created_at);

ALTER TABLE hr_case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_case_notes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_case_notes'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_case_notes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
