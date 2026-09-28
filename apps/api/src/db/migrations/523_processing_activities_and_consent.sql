-- GDPR Article 30 processing activity register and explicit consent records.
-- processing_activities: the platform's record of why each category of data
--   is processed, under what lawful basis, by whom and for how long.
-- consent_records: immutable evidence for activities that use CONSENT as their
--   lawful basis, with withdrawal history preserved (never deleted, status updated).

CREATE TABLE processing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lawful_basis TEXT NOT NULL CHECK (lawful_basis IN (
    'CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION',
    'VITAL_INTERESTS', 'PUBLIC_TASK', 'LEGITIMATE_INTERESTS'
  )),
  -- References pii_category values from pii_field_registry.
  data_categories TEXT[] NOT NULL DEFAULT '{}',
  -- References pii_data_domains.id values.
  data_domains TEXT[] NOT NULL DEFAULT '{}',
  -- External recipients / processors.
  recipients TEXT[] NOT NULL DEFAULT '{}',
  -- Null = no automated retention enforcement.
  retention_days INTEGER,
  is_automated BOOLEAN NOT NULL DEFAULT false,
  dpia_required BOOLEAN NOT NULL DEFAULT false,
  dpia_completed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_activities_tenant ON processing_activities (tenant_id, is_active);

ALTER TABLE processing_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON processing_activities
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Consent records for activities with lawful_basis = 'CONSENT'.
-- Withdrawal never removes a row — it transitions status to WITHDRAWN and
-- sets withdrawn_at, so the historical grant is preserved as evidence.
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES processing_activities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'WITHDRAWN', 'EXPIRED')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  -- ip, user_agent, locale, method ('web_form', 'api', 'registration', 'import').
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Bumped whenever the activity version changes and re-consent is needed.
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX consent_records_active_unique
  ON consent_records (user_id, activity_id, version);
CREATE INDEX idx_consent_records_tenant_user ON consent_records (tenant_id, user_id, status);
CREATE INDEX idx_consent_records_activity ON consent_records (activity_id, status);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON consent_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
