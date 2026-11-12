-- Ondi acting as SAML Identity Provider. Each row is a tenant-owned,
-- explicitly registered Service Provider; assertions are issued only to its
-- exact entity ID and ACS URL after a signed AuthnRequest and user approval.
CREATE TABLE IF NOT EXISTS ondi_saml_sp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  entity_id TEXT NOT NULL,
  acs_url TEXT NOT NULL,
  signing_certificate TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ondi_saml_sp_clients_tenant
  ON ondi_saml_sp_clients(tenant_id, enabled, created_at DESC);

ALTER TABLE ondi_saml_sp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_saml_sp_clients FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_isolation_ondi_saml_sp_clients'
      AND polrelid = 'ondi_saml_sp_clients'::regclass
  ) THEN
    CREATE POLICY tenant_isolation_ondi_saml_sp_clients
      ON ondi_saml_sp_clients
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
