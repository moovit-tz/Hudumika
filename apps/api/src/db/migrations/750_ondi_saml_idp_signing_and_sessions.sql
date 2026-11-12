-- Platform signing material is shared by every tenant, like Ondi's OIDC
-- issuer keys. Workspace-owned SAML service-provider records remain isolated
-- in ondi_saml_sp_clients (migration 749).
ALTER TABLE ondi_saml_sp_clients ADD COLUMN IF NOT EXISTS slo_url TEXT;
CREATE TABLE IF NOT EXISTS ondi_saml_idp_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid TEXT NOT NULL UNIQUE,
  certificate_pem TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'previous', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_saml_one_active_key
  ON ondi_saml_idp_signing_keys(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ondi_saml_idp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES ondi_saml_sp_clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name_id TEXT NOT NULL,
  session_index TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_saml_idp_sessions_tenant_user
  ON ondi_saml_idp_sessions(tenant_id, user_id, created_at DESC);

ALTER TABLE ondi_saml_idp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_saml_idp_sessions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_ondi_saml_idp_sessions'
      AND polrelid = 'ondi_saml_idp_sessions'::regclass) THEN
    CREATE POLICY tenant_isolation_ondi_saml_idp_sessions ON ondi_saml_idp_sessions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
