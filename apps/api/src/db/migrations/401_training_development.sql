-- Training & Development — confirmed entirely absent in the production-
-- readiness audit: no catalogue, no enrollment, no certification-expiry
-- tracking anywhere in the platform. A course catalogue any employee can
-- browse and self-enroll in (same self-or-manager precedent as Benefits
-- enrollment, hr-benefits.routes.ts), with certification expiry surfaced
-- the same way hr_documents.expiry_date already is (documents.routes.ts's
-- expiry-radar) — the "link certifications to compliance workflows" the
-- audit asked for.

CREATE TABLE IF NOT EXISTS hr_training_courses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  category          VARCHAR(100),
  provider          VARCHAR(150),
  duration_hours    NUMERIC(6,1),
  is_certification  BOOLEAN NOT NULL DEFAULT false,
  -- How long a certificate earned from this course stays valid, in months.
  -- Null means it doesn't expire (a one-off skills workshop, say).
  validity_months   INTEGER,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_training_courses_tenant ON hr_training_courses(tenant_id, active);

CREATE TABLE IF NOT EXISTS hr_training_enrollments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id               UUID NOT NULL REFERENCES hr_training_courses(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                  VARCHAR(20) NOT NULL DEFAULT 'ENROLLED',
  enrolled_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  score                   NUMERIC(5,2),
  notes                   TEXT,
  -- Set at completion time for a certification course (enrolled_at's course
  -- validity_months from completed_at) — stored rather than always
  -- recomputed, so a later change to the course's own validity_months
  -- doesn't retroactively rewrite what was actually earned.
  certificate_expiry_date DATE,
  certificate_document_id UUID REFERENCES hr_documents(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_training_enrollments_status_valid CHECK (status IN
    ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
  CONSTRAINT hr_training_enrollments_unique UNIQUE (tenant_id, course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_training_enrollments_user ON hr_training_enrollments(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_hr_training_enrollments_expiry ON hr_training_enrollments(tenant_id, certificate_expiry_date) WHERE certificate_expiry_date IS NOT NULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_training_courses', 'hr_training_enrollments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
