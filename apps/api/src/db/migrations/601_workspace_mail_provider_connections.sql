BEGIN;
CREATE TABLE tenant_mail_provider_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('cpanel','google','microsoft')),
 config_ciphertext text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,kind)
);
ALTER TABLE tenant_mail_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_mail_provider_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_mail_provider_connections
 USING(tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
