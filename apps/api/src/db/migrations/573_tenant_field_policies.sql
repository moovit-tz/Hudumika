CREATE TABLE tenant_field_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource    text NOT NULL,
  field_group text NOT NULL,
  allowed_roles text[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, resource, field_group)
);

ALTER TABLE tenant_field_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_field_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_field_policies_tenant ON tenant_field_policies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX idx_tenant_field_policies_tenant ON tenant_field_policies (tenant_id);
