-- 053_sso_providers.sql
-- Ondi (Identity & Access): SSO/identity-provider configuration registry.
-- This is a config store, not a live federation implementation — actually
-- validating SAML/OIDC assertions and handling IdP redirect flows is a
-- separate, larger effort. This table lets a tenant register/enable a
-- provider entry (client id/secret/metadata) for future federation work.

CREATE TABLE sso_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_type VARCHAR(20) NOT NULL,   -- 'GOOGLE' | 'MICROSOFT' | 'SAML' | 'OIDC'
    name VARCHAR(200) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',   -- client_id, client_secret, metadata_url, etc.
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sso_providers_tenant ON sso_providers(tenant_id);

ALTER TABLE sso_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sso_providers ON sso_providers
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
