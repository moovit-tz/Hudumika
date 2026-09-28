-- Purpose-aware audit log for sensitive field reads.
-- Records *who* accessed *which* sensitive columns on *whose* record,
-- with a purpose tag for each access — separate from the auth-event
-- SHA-256 chain (ondi_auth_events) which covers identity operations.
-- Only HIGH and CRITICAL sensitivity fields trigger a row here.

CREATE TABLE pii_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Who made the access.
  accessor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accessor_type TEXT NOT NULL DEFAULT 'USER'
    CHECK (accessor_type IN ('USER', 'API_KEY', 'AGENT', 'SERVICE')),
  -- api_key prefix, agent_identity id, or service name.
  accessor_ref TEXT,
  -- Whose data was read (null for org-level records like payroll_runs).
  subject_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_table TEXT NOT NULL,
  subject_record_id TEXT NOT NULL,
  -- The actual column names that were read.
  fields_accessed TEXT[] NOT NULL,
  data_domain TEXT NOT NULL REFERENCES pii_data_domains(id),
  sensitivity_level TEXT NOT NULL,
  -- Caller-supplied purpose tag (e.g. 'HR_REVIEW', 'PAYROLL_RUN', 'SELF_SERVICE').
  purpose TEXT,
  route TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pii_access_log_tenant_time ON pii_access_log (tenant_id, created_at DESC);
CREATE INDEX idx_pii_access_log_subject ON pii_access_log (subject_id, created_at DESC) WHERE subject_id IS NOT NULL;
CREATE INDEX idx_pii_access_log_accessor ON pii_access_log (accessor_id, created_at DESC) WHERE accessor_id IS NOT NULL;
CREATE INDEX idx_pii_access_log_domain ON pii_access_log (tenant_id, data_domain, created_at DESC);

ALTER TABLE pii_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pii_access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pii_access_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
