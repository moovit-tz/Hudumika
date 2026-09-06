-- Turns the recruitment tracker into a real pipeline: a Requisition with an
-- approval workflow before a job can go OPEN, and an Application as its own
-- entity so one candidate can apply to more than one job without becoming
-- two unrelated identities.
--
-- Prior shape (migration 225): hr_candidates.job_opening_id was a single
-- required FK — a person applying to a second job needed a second, entirely
-- separate candidate row with no relationship to the first. hr_job_openings
-- had no approval concept at all; anything MGMT created was immediately a
-- live opening.

-- ── Requisitions: the approval gate before a job opening exists ──────────
CREATE TABLE IF NOT EXISTS hr_requisitions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                 VARCHAR(160) NOT NULL,
  department_id         UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  designation_id        UUID REFERENCES hr_designations(id) ON DELETE SET NULL,
  hiring_manager_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  openings_count        INTEGER NOT NULL DEFAULT 1,
  employment_type       VARCHAR(32) NOT NULL DEFAULT 'FULL_TIME',
  location              VARCHAR(120),
  description           TEXT,
  requirements          TEXT,
  salary_min            NUMERIC(14,2),
  salary_max            NUMERIC(14,2),
  salary_currency       VARCHAR(10),
  priority              VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  reason                VARCHAR(20) NOT NULL DEFAULT 'NEW_POSITION',
  replacement_for_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  rejected_reason       TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at          TIMESTAMPTZ,
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_requisitions_status_valid CHECK (status IN
    ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'OPEN', 'CLOSED', 'CANCELLED')),
  CONSTRAINT hr_requisitions_type_valid CHECK (employment_type IN
    ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY')),
  CONSTRAINT hr_requisitions_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  CONSTRAINT hr_requisitions_reason_valid CHECK (reason IN ('NEW_POSITION', 'REPLACEMENT', 'OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_hr_requisitions_tenant_status ON hr_requisitions(tenant_id, status);

-- A job opening now optionally traces back to the requisition that approved
-- it. Nullable: POST /recruitment/openings (direct creation, no requisition)
-- stays a legitimate lighter-weight path for a tenant that doesn't want the
-- approval step, not something this migration forces everyone through.
ALTER TABLE hr_job_openings ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES hr_requisitions(id) ON DELETE SET NULL;

-- ── Applications: candidate x job, many-to-many ──────────────────────────
-- The pipeline fields (stage/rating/notes) move here from hr_candidates,
-- because they describe one application to one job, not the person. A
-- candidate can now have several of these rows, one per job.
CREATE TABLE IF NOT EXISTS hr_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id     UUID NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  job_opening_id   UUID NOT NULL REFERENCES hr_job_openings(id) ON DELETE CASCADE,
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  source           VARCHAR(60),
  stage            VARCHAR(24) NOT NULL DEFAULT 'APPLIED',
  rating           SMALLINT,
  notes            TEXT,
  rejected_reason  TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_applications_stage_valid CHECK (stage IN
    ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')),
  CONSTRAINT hr_applications_rating_range CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  -- One application per candidate per job — re-applying to the same opening
  -- updates the existing row rather than creating a duplicate pipeline entry.
  CONSTRAINT hr_applications_unique_per_job UNIQUE (tenant_id, candidate_id, job_opening_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_applications_pipeline ON hr_applications(tenant_id, job_opening_id, stage);
CREATE INDEX IF NOT EXISTS idx_hr_applications_candidate ON hr_applications(tenant_id, candidate_id);

-- hr_candidates is now the person record only. job_opening_id/stage/rating
-- stay on the table (dropping columns with real data is not worth the risk
-- here) but are no longer required or written to by new code — the backfill
-- below moves every existing one into a real application, and the API stops
-- reading these columns as of this migration.
ALTER TABLE hr_candidates ALTER COLUMN job_opening_id DROP NOT NULL;

INSERT INTO hr_applications (tenant_id, candidate_id, job_opening_id, applied_at, source, stage, rating, notes, created_by, created_at, updated_at)
SELECT tenant_id, id, job_opening_id, created_at, source, stage, rating, notes, created_by, created_at, updated_at
FROM hr_candidates
WHERE job_opening_id IS NOT NULL
ON CONFLICT (tenant_id, candidate_id, job_opening_id) DO NOTHING;

-- Interviews move to being scoped by application (a candidate interviewing
-- for job A must not appear under job B's pipeline). candidate_id stays,
-- denormalized, so nothing that already joins on it breaks.
ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES hr_applications(id) ON DELETE CASCADE;
UPDATE hr_interviews i SET application_id = (
  SELECT a.id FROM hr_applications a WHERE a.candidate_id = i.candidate_id ORDER BY a.created_at ASC LIMIT 1
) WHERE i.application_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_interviews_application ON hr_interviews(tenant_id, application_id);

-- ── Offers: a real entity, not a stage label ─────────────────────────────
CREATE TABLE IF NOT EXISTS hr_offers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id        UUID NOT NULL REFERENCES hr_applications(id) ON DELETE CASCADE,
  position_title        VARCHAR(160) NOT NULL,
  compensation_amount   NUMERIC(14,2),
  compensation_currency VARCHAR(10),
  compensation_period   VARCHAR(10) NOT NULL DEFAULT 'MONTHLY',
  start_date            DATE,
  expiry_date           DATE,
  status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  -- Simple version chain rather than a full revision-history table: editing
  -- a DRAFT/PENDING_APPROVAL offer bumps `revision` in place; editing one
  -- already SENT instead creates a new row with supersedes_offer_id set and
  -- marks the old row SUPERSEDED, so what was actually sent to a candidate
  -- is never silently rewritten after the fact.
  revision              INTEGER NOT NULL DEFAULT 1,
  supersedes_offer_id   UUID REFERENCES hr_offers(id) ON DELETE SET NULL,
  decline_reason        TEXT,
  approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  viewed_at             TIMESTAMPTZ,
  responded_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_offers_status_valid CHECK (status IN
    ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED')),
  CONSTRAINT hr_offers_period_valid CHECK (compensation_period IN ('MONTHLY', 'ANNUAL'))
);
CREATE INDEX IF NOT EXISTS idx_hr_offers_application ON hr_offers(tenant_id, application_id);
CREATE INDEX IF NOT EXISTS idx_hr_offers_status ON hr_offers(tenant_id, status);

-- Real RLS from day one for the three new tables, same pattern as
-- 397_hr_core_rls.sql — not left for a future retrofit migration to find.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_requisitions', 'hr_applications', 'hr_offers'] LOOP
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
