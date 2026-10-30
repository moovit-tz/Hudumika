-- Phase F: Canonical permit and regulatory requirement engine.
-- Extends ComplyOS's existing tables (comply_certificates, comply_obligations,
-- comply_renewals) rather than replacing them. Adds entity/site scope,
-- versioned requirement definitions, fee structures, and lifecycle tracking.

-- ── 1. Scope columns on existing certificates ──────────────────────────────
-- Link permits to the shared org model. NULL = tenant-wide (legacy behavior).
ALTER TABLE comply_certificates
  ADD COLUMN IF NOT EXISTS entity_id     UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id       UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS holder_name   TEXT,
  ADD COLUMN IF NOT EXISTS holder_type   TEXT CHECK (holder_type IS NULL OR holder_type IN ('entity', 'site', 'product', 'asset', 'activity')),
  ADD COLUMN IF NOT EXISTS jurisdiction  TEXT NOT NULL DEFAULT 'TZ',
  ADD COLUMN IF NOT EXISTS authority     TEXT,
  ADD COLUMN IF NOT EXISTS assurance     TEXT NOT NULL DEFAULT 'unverified'
    CHECK (assurance IN ('verified', 'self_declared', 'unverified', 'expired_verification')),
  ADD COLUMN IF NOT EXISTS verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by   TEXT,
  ADD COLUMN IF NOT EXISTS industry_key  TEXT;

CREATE INDEX IF NOT EXISTS idx_comply_certs_entity ON comply_certificates(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comply_certs_site ON comply_certificates(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comply_certs_jurisdiction ON comply_certificates(jurisdiction);

-- ── 2. Versioned requirement definitions ────────────────────────────────────
-- Platform-scoped (no tenant_id). Defines what permits/requirements apply
-- for a given jurisdiction + industry + activity. Each definition has a
-- version so changes don't retroactively invalidate historical compliance.
CREATE TABLE IF NOT EXISTS comply_requirement_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  jurisdiction      TEXT NOT NULL DEFAULT 'TZ',
  name              TEXT NOT NULL,
  description       TEXT,
  legal_instrument  TEXT,
  source_url        TEXT,
  industry_key      TEXT,
  activity_type     TEXT,
  holder_type       TEXT CHECK (holder_type IS NULL OR holder_type IN ('entity', 'site', 'product', 'asset', 'activity')),
  agency_code       TEXT,
  frequency         TEXT NOT NULL DEFAULT 'annual'
    CHECK (frequency IN ('once', 'annual', 'semi_annual', 'quarterly', 'monthly', 'on_demand')),
  mandatory         BOOLEAN NOT NULL DEFAULT true,
  required_evidence JSONB NOT NULL DEFAULT '[]',
  applicability     JSONB NOT NULL DEFAULT '{}',
  dependencies      TEXT[] NOT NULL DEFAULT '{}',
  exemptions        JSONB NOT NULL DEFAULT '[]',
  version           INT NOT NULL DEFAULT 1,
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to      DATE,
  review_state      TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_state IN ('draft', 'under_review', 'reviewed', 'published', 'superseded', 'withdrawn')),
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, jurisdiction, version)
);

CREATE INDEX IF NOT EXISTS idx_req_defs_jurisdiction ON comply_requirement_definitions(jurisdiction, industry_key);
CREATE INDEX IF NOT EXISTS idx_req_defs_agency ON comply_requirement_definitions(agency_code);

-- ── 3. Fee and penalty definitions ──────────────────────────────────────────
-- Per requirement, per jurisdiction. Separates estimate vs official assessment
-- vs settled cost. Supports grace periods and caps where the law provides them.
CREATE TABLE IF NOT EXISTS comply_fee_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_def_id  UUID NOT NULL REFERENCES comply_requirement_definitions(id) ON DELETE CASCADE,
  fee_type            TEXT NOT NULL CHECK (fee_type IN ('application', 'renewal', 'late_penalty', 'annual', 'inspection', 'other')),
  name                TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'TZS',
  amount              NUMERIC,
  formula             TEXT,
  formula_inputs      JSONB NOT NULL DEFAULT '{}',
  grace_days          INT,
  cap_amount          NUMERIC,
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  source_reference    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_defs_req ON comply_fee_definitions(requirement_def_id);

-- ── 4. Permit lifecycle cycles ──────────────────────────────────────────────
-- One row per application/renewal/cancellation/surrender cycle. Links to
-- the certificate and tracks the full lifecycle with audit fields.
CREATE TABLE IF NOT EXISTS comply_lifecycle_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cert_id             UUID REFERENCES comply_certificates(id) ON DELETE SET NULL,
  requirement_def_id  UUID REFERENCES comply_requirement_definitions(id) ON DELETE SET NULL,
  cycle_type          TEXT NOT NULL CHECK (cycle_type IN ('application', 'renewal', 'amendment', 'cancellation', 'surrender', 'transfer')),
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_documents', 'pending_review', 'submitted', 'under_authority_review', 'approved', 'issued', 'rejected', 'cancelled', 'failed')),
  owner_id            UUID REFERENCES users(id),
  delegate_id         UUID REFERENCES users(id),
  entity_id           UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  site_id             UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  jurisdiction        TEXT NOT NULL DEFAULT 'TZ',
  agency_code         TEXT,
  prerequisites       JSONB NOT NULL DEFAULT '[]',
  deadline            DATE,
  budget_estimate     NUMERIC,
  budget_currency     TEXT DEFAULT 'TZS',
  actual_cost         NUMERIC,
  submission_ref      TEXT,
  submission_date     DATE,
  authority_ref       TEXT,
  outcome_date        DATE,
  outcome_notes       TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comply_lifecycle_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_lifecycle_cycles FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_lifecycle_cycles'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_lifecycle_cycles
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lifecycle_tenant ON comply_lifecycle_cycles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_cert ON comply_lifecycle_cycles(cert_id);

-- ── 5. Evidence/document attachments per lifecycle cycle ─────────────────────
CREATE TABLE IF NOT EXISTS comply_lifecycle_evidence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id    UUID NOT NULL REFERENCES comply_lifecycle_cycles(id) ON DELETE CASCADE,
  file_id     UUID,
  file_name   TEXT NOT NULL,
  file_url    TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'document'
    CHECK (evidence_type IN ('document', 'receipt', 'photo', 'screenshot', 'certificate', 'correspondence', 'other')),
  description TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comply_lifecycle_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_lifecycle_evidence FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_lifecycle_evidence'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_lifecycle_evidence
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lifecycle_evidence_cycle ON comply_lifecycle_evidence(cycle_id);

-- ── 6. Jurisdiction packs ───────────────────────────────────────────────────
-- Tracks which jurisdictions have reviewed requirement definitions and what
-- coverage level they're at. Platform-scoped (no tenant_id).
CREATE TABLE IF NOT EXISTS comply_jurisdiction_packs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction      TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  country_code      TEXT NOT NULL,
  subnational_code  TEXT,
  coverage_level    TEXT NOT NULL DEFAULT 'partial'
    CHECK (coverage_level IN ('comprehensive', 'substantial', 'partial', 'minimal', 'stub')),
  last_reviewed     DATE,
  reviewed_by       TEXT,
  source_notes      TEXT,
  requirement_count INT NOT NULL DEFAULT 0,
  missing_areas     TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the Tanzania pack based on existing obligation rules
INSERT INTO comply_jurisdiction_packs (jurisdiction, name, country_code, coverage_level, requirement_count, missing_areas)
VALUES ('TZ', 'Tanzania (Mainland)', 'TZ', 'partial', 0, ARRAY['mining', 'energy', 'telecom', 'education', 'real_estate'])
ON CONFLICT (jurisdiction) DO NOTHING;
