-- NexusHR recruitment: job openings and a candidate pipeline.
-- A candidate belongs to one opening and moves through stages; the board reads
-- candidates grouped by stage for a given opening.

CREATE TABLE IF NOT EXISTS hr_job_openings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title            VARCHAR(160) NOT NULL,
  department       VARCHAR(120),
  location         VARCHAR(120),
  employment_type  VARCHAR(32) NOT NULL DEFAULT 'FULL_TIME',
  status           VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  description      TEXT,
  openings_count   INTEGER NOT NULL DEFAULT 1,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_job_openings_status_valid
    CHECK (status IN ('OPEN', 'ON_HOLD', 'CLOSED')),
  CONSTRAINT hr_job_openings_type_valid
    CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY'))
);

CREATE TABLE IF NOT EXISTS hr_candidates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_opening_id   UUID NOT NULL REFERENCES hr_job_openings(id) ON DELETE CASCADE,
  name             VARCHAR(160) NOT NULL,
  email            VARCHAR(200),
  phone            VARCHAR(40),
  stage            VARCHAR(24) NOT NULL DEFAULT 'APPLIED',
  rating           SMALLINT,
  source           VARCHAR(60),
  notes            TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_candidates_stage_valid
    CHECK (stage IN ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED')),
  CONSTRAINT hr_candidates_rating_range
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
);

CREATE INDEX IF NOT EXISTS idx_hr_job_openings_tenant_status
  ON hr_job_openings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_candidates_pipeline
  ON hr_candidates(tenant_id, job_opening_id, stage);
