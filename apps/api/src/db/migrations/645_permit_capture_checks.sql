-- Phase G: Cross-app permit capture pipeline and shared check contract.
-- Implements the shared capture→scan→classify→review→register→check flow.

-- ── 1. Permit capture candidates ────────────────────────────────────────────
-- A candidate is a document/attachment from ANY app that MIGHT be a permit.
-- Flows: upload/import → scan/classify → review → register (link to cert) or dismiss.
CREATE TABLE IF NOT EXISTS comply_permit_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_app      TEXT NOT NULL,
  source_record_type TEXT,
  source_record_id   UUID,
  source_attachment_id UUID,
  source_file_name    TEXT NOT NULL,
  source_file_url     TEXT,
  source_version      INT NOT NULL DEFAULT 1,

  -- Classification results (from scan/OCR or manual)
  classification   TEXT NOT NULL DEFAULT 'pending'
    CHECK (classification IN ('pending', 'permit', 'renewal', 'not_permit', 'needs_review', 'duplicate')),
  confidence       NUMERIC,
  classifier_type  TEXT CHECK (classifier_type IS NULL OR classifier_type IN ('manual', 'ocr', 'ai', 'rule')),

  -- Extracted claims (untrusted until reviewed)
  holder_claim     TEXT,
  issuer_claim     TEXT,
  jurisdiction_claim TEXT,
  permit_number_claim TEXT,
  expiry_claim     DATE,
  issued_claim     DATE,

  -- Provenance
  captured_by      UUID REFERENCES users(id),
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  review_notes     TEXT,

  -- Resolution
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanning', 'classified', 'under_review', 'registered', 'dismissed', 'duplicate', 'failed')),
  linked_cert_id   UUID REFERENCES comply_certificates(id) ON DELETE SET NULL,
  linked_cycle_id  UUID REFERENCES comply_lifecycle_cycles(id) ON DELETE SET NULL,

  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comply_permit_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_permit_candidates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_permit_candidates'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_permit_candidates
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_candidates_tenant_status ON comply_permit_candidates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_candidates_source ON comply_permit_candidates(source_app, source_record_id);
CREATE INDEX IF NOT EXISTS idx_candidates_permit_number ON comply_permit_candidates(permit_number_claim) WHERE permit_number_claim IS NOT NULL;

-- Dedup: same source file from same record shouldn't create two candidates
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_source_identity
  ON comply_permit_candidates(tenant_id, source_app, source_record_id, source_attachment_id, source_version);

-- ── 2. Permit check results ─────────────────────────────────────────────────
-- Shared check contract: any app asks "is this entity/site/activity permitted?"
-- and gets a structured response. Results are cached/logged.
CREATE TABLE IF NOT EXISTS comply_permit_checks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requesting_app    TEXT NOT NULL,
  requesting_record_type TEXT,
  requesting_record_id   UUID,
  check_type        TEXT NOT NULL DEFAULT 'status'
    CHECK (check_type IN ('status', 'clearance', 'pre_activity', 'audit')),

  -- Scope of what's being checked
  entity_id         UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  site_id           UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  jurisdiction      TEXT NOT NULL DEFAULT 'TZ',
  requirement_code  TEXT,
  cert_id           UUID REFERENCES comply_certificates(id) ON DELETE SET NULL,

  -- Result
  result            TEXT NOT NULL DEFAULT 'unknown'
    CHECK (result IN ('valid', 'expired', 'expiring', 'missing', 'revoked', 'suspended', 'pending', 'unknown', 'not_applicable')),
  reasons           TEXT[] NOT NULL DEFAULT '{}',
  assurance_level   TEXT NOT NULL DEFAULT 'unverified',
  rules_version     INT,
  freshness         TEXT NOT NULL DEFAULT 'live'
    CHECK (freshness IN ('live', 'cached', 'stale', 'unavailable')),

  -- Impact policy
  impact_action     TEXT NOT NULL DEFAULT 'warn'
    CHECK (impact_action IN ('block', 'require_review', 'warn', 'log_only', 'none')),
  impact_notes      TEXT,

  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by        UUID REFERENCES users(id),
  expires_at        TIMESTAMPTZ
);

ALTER TABLE comply_permit_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_permit_checks FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_permit_checks'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_permit_checks
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_checks_tenant ON comply_permit_checks(tenant_id, requesting_app);
CREATE INDEX IF NOT EXISTS idx_checks_cert ON comply_permit_checks(cert_id) WHERE cert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checks_entity ON comply_permit_checks(entity_id) WHERE entity_id IS NOT NULL;

-- ── 3. App coverage register ────────────────────────────────────────────────
-- Per-app declaration of which permit intake/check paths apply to it.
-- Platform-scoped (managed by SUPER_ADMIN or the implementation).
CREATE TABLE IF NOT EXISTS comply_app_coverage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          TEXT NOT NULL,
  intake_path     TEXT NOT NULL DEFAULT 'none'
    CHECK (intake_path IN ('upload', 'import', 'scan', 'api_sync', 'manual', 'none', 'not_applicable')),
  check_path      TEXT NOT NULL DEFAULT 'none'
    CHECK (check_path IN ('pre_activity', 'clearance', 'status', 'audit', 'none', 'not_applicable')),
  coverage_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (coverage_status IN ('implemented', 'planned', 'not_applicable', 'excluded')),
  evidence_notes  TEXT,
  last_verified   DATE,
  verified_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id)
);

-- Seed the coverage register with all Hudumika apps
INSERT INTO comply_app_coverage (app_id, intake_path, check_path, coverage_status, evidence_notes) VALUES
  ('clearos',      'upload',  'clearance',    'planned', 'Customs declarations require valid permits'),
  ('cargotracker', 'upload',  'pre_activity', 'planned', 'Freight bookings may require carrier licenses'),
  ('hudufreight',  'upload',  'pre_activity', 'planned', 'Fleet operations require vehicle/driver permits'),
  ('seal',         'upload',  'status',       'planned', 'Inventory/warehouse may need sector permits'),
  ('nexushr',      'import',  'status',       'planned', 'Employee credentials and professional licenses'),
  ('crm',          'upload',  'status',       'planned', 'Customer/supplier compliance verification'),
  ('finops',       'manual',  'audit',        'planned', 'Financial regulatory compliance checks'),
  ('projects',     'upload',  'pre_activity', 'planned', 'Project permits and approvals'),
  ('tasks',        'none',    'none',         'not_applicable', 'Task app has no permit intake or check path'),
  ('calendar',     'none',    'none',         'not_applicable', 'Calendar has no permit intake or check path'),
  ('email',        'none',    'none',         'not_applicable', 'Email attachment scanning deferred'),
  ('drive',        'scan',    'none',         'planned', 'Cloud/Drive may scan uploaded documents for permits'),
  ('bliss',        'none',    'none',         'not_applicable', 'Chat/Calls have no permit intake path'),
  ('notes',        'none',    'none',         'not_applicable', 'Notes have no permit intake path'),
  ('admin',        'none',    'audit',        'planned', 'Admin dashboard compliance audit view'),
  ('complyos',     'upload',  'status',       'implemented', 'Core compliance app — fully integrated'),
  ('store',        'none',    'none',         'not_applicable', 'Store/marketplace has no direct permit path'),
  ('sms',          'none',    'none',         'not_applicable', 'SMS has no permit intake path'),
  ('studio',       'none',    'none',         'not_applicable', 'Workflow builder has no permit intake path'),
  ('ondi',         'none',    'audit',        'planned', 'Identity/SSO compliance audit')
ON CONFLICT (app_id) DO NOTHING;
