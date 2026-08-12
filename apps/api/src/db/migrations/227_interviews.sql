-- Recruitment interview scheduling: a scheduled interview for a candidate.

CREATE TABLE IF NOT EXISTS hr_interviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_id   UUID NOT NULL REFERENCES hr_candidates(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  mode           VARCHAR(12) NOT NULL DEFAULT 'VIDEO',
  status         VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_interviews_mode_valid   CHECK (mode IN ('PHONE', 'VIDEO', 'ONSITE')),
  CONSTRAINT hr_interviews_status_valid CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_hr_interviews_candidate ON hr_interviews(tenant_id, candidate_id, scheduled_at);
