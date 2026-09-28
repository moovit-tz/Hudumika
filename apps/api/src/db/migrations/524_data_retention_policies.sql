-- Per-domain data retention policies.
-- A null tenant_id row is the platform-wide default for that domain.
-- Tenant-specific rows override the platform default for that tenant.
-- The retention job checks this table to decide how to handle expired records.

CREATE TABLE data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null = platform-wide default; non-null = override for this tenant only.
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  data_domain TEXT NOT NULL REFERENCES pii_data_domains(id),
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  action_on_expiry TEXT NOT NULL CHECK (action_on_expiry IN (
    'ANONYMISE', 'PSEUDONYMISE', 'DELETE', 'ARCHIVE'
  )),
  -- When true, the retention job skips this table (e.g. under legal hold).
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  -- Columns to anonymise / null out (used when action is ANONYMISE/PSEUDONYMISE).
  target_columns TEXT[] NOT NULL DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, table_name, data_domain)
);

CREATE INDEX idx_retention_policies_active ON data_retention_policies (data_domain, is_active);
CREATE INDEX idx_retention_policies_tenant ON data_retention_policies (tenant_id) WHERE tenant_id IS NOT NULL;
