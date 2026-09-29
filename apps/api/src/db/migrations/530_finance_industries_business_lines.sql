-- Finance industries are configuration presets; business lines are reporting
-- dimensions. Neither table represents a package, add-on, or legal entity.
CREATE TABLE IF NOT EXISTS tenant_finance_profiles (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  industries JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_business_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(40) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_finance_business_lines_tenant
  ON finance_business_lines(tenant_id, active, name);

ALTER TABLE tenant_finance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_finance_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_finance_profiles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE finance_business_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_business_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON finance_business_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
