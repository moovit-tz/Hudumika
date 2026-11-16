-- Axis worker records: workers without a login, and an effective-dated job
-- history (assignments).
--
-- `users` stays the one person record (migration 206 removed a second,
-- unused person model and the reasoning still holds). What was missing:
--
--   * Not every worker signs in. A casual labourer, a driver on a shared
--     tablet or a contractor paid through payroll still needs a record,
--     attendance, leave and pay. `can_login = false` marks such a worker; they
--     have no usable password and may have no email. Sign-in paths refuse them
--     (auth.routes.ts recordLogin / refresh / accept-invite).
--
--   * A person's job changed by overwriting users.department_id,
--     designation_id, location_id and the org-chart parent, so transfers,
--     promotions, rehires and terminations left no history. hr_assignments
--     keeps every job a person has held, each with effective dates, the reason
--     it started and ended, who approved it and — for corrections — the row it
--     replaced. Rows are never deleted: a correction voids the old row with a
--     reason and inserts its replacement.
--
--     The primary assignment that is current today is projected back onto
--     users.department_id / designation_id / location_id and the org chart,
--     so every existing screen and permission check (reporting lines,
--     timesheet review) keeps working unchanged.
--
-- Rollback: drop hr_assignments and the two users columns' changes only after
-- confirming no worker has can_login = false or a NULL email; those rows would
-- violate the old NOT NULL constraint.

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_login BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_login_needs_email') THEN
    ALTER TABLE users ADD CONSTRAINT users_login_needs_email CHECK (can_login = false OR email IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- EMPLOYEE / CONTRACTOR / CASUAL / INTERN: how this person works in this job.
  worker_type      TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (worker_type IN ('EMPLOYEE', 'CONTRACTOR', 'CASUAL', 'INTERN')),
  is_primary       BOOLEAN NOT NULL DEFAULT true,
  legal_entity_id  UUID REFERENCES hr_legal_entities(id) ON DELETE RESTRICT,
  location_id      UUID REFERENCES locations(id) ON DELETE RESTRICT,
  department_id    UUID REFERENCES hr_departments(id) ON DELETE RESTRICT,
  designation_id   UUID REFERENCES hr_designations(id) ON DELETE RESTRICT,
  manager_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  job_title        TEXT,
  fte              NUMERIC(4, 3) NOT NULL DEFAULT 1 CHECK (fte > 0 AND fte <= 1),
  start_date       DATE NOT NULL,
  end_date         DATE,
  start_reason     TEXT NOT NULL CHECK (start_reason IN ('HIRE', 'TRANSFER', 'PROMOTION', 'REHIRE', 'ADDITIONAL', 'CORRECTION', 'BACKFILL')),
  end_reason       TEXT CHECK (end_reason IN ('TRANSFER', 'PROMOTION', 'RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'DEATH', 'REDUNDANCY', 'OTHER')),
  -- PENDING: proposed by a manager, waiting for HR; ACTIVE: in force (may be
  -- future-dated); VOIDED: replaced by a correction or rejected — kept for audit.
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'VOIDED')),
  notes            TEXT,
  corrects_id      UUID REFERENCES hr_assignments(id) ON DELETE RESTRICT,
  void_reason      TEXT,
  voided_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at        TIMESTAMPTZ,
  requested_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK ((end_date IS NULL) = (end_reason IS NULL)),
  CHECK (status <> 'VOIDED' OR (void_reason IS NOT NULL AND voided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_hr_assignments_person ON hr_assignments(tenant_id, user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_hr_assignments_manager ON hr_assignments(tenant_id, manager_id) WHERE status = 'ACTIVE';
-- One open-ended primary job per person. Overlaps between dated rows are
-- checked by the service under a row lock on the person (no btree_gist here).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_assignments_open_primary
  ON hr_assignments(user_id) WHERE is_primary AND status = 'ACTIVE' AND end_date IS NULL;

ALTER TABLE hr_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_assignments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_assignments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Backfill: every active staff member gets one assignment describing the job
-- they hold today, starting on their hire date (or account creation when no
-- hire date was ever entered). Their manager comes from the org chart. Former
-- staff are not backfilled: when they left was never recorded, and inventing
-- an end date would be worse than leaving their history empty.
INSERT INTO hr_assignments (tenant_id, user_id, worker_type, is_primary, location_id, department_id, designation_id,
                            manager_id, start_date, start_reason, status, notes, approved_at)
SELECT u.tenant_id, u.id,
       CASE c.contract_type WHEN 'CASUAL' THEN 'CASUAL' WHEN 'INTERNSHIP' THEN 'INTERN' ELSE 'EMPLOYEE' END,
       true, u.location_id, u.department_id, u.designation_id,
       (SELECT p.user_id FROM org_chart_nodes n JOIN org_chart_nodes p ON p.id = n.parent_id
         WHERE n.tenant_id = u.tenant_id AND n.user_id = u.id AND p.user_id IS NOT NULL LIMIT 1),
       COALESCE(u.hire_date::date, u.created_at::date), 'BACKFILL', 'ACTIVE',
       'Created from the employee record when job history was introduced.', now()
FROM users u
LEFT JOIN LATERAL (
  SELECT contract_type FROM hr_contracts hc WHERE hc.user_id = u.id AND hc.tenant_id = u.tenant_id
  ORDER BY hc.start_date DESC LIMIT 1
) c ON true
WHERE u.active = true
  AND u.role NOT IN ('CUSTOMER', 'ORG', 'GUEST')
  AND NOT EXISTS (SELECT 1 FROM hr_assignments a WHERE a.user_id = u.id);
