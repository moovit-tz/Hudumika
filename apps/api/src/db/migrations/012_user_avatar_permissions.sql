-- Profile photo on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Role-based permission matrix
CREATE TABLE IF NOT EXISTS org_permissions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role         VARCHAR(50)  NOT NULL,
  resource     VARCHAR(100) NOT NULL,
  action       VARCHAR(50)  NOT NULL,
  allowed      BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, resource, action)
);

CREATE INDEX IF NOT EXISTS org_permissions_tenant_role ON org_permissions(tenant_id, role);
