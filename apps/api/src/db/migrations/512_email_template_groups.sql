CREATE TABLE IF NOT EXISTS email_template_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'system')),
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope = 'personal' AND user_id IS NOT NULL) OR (scope = 'system' AND user_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_template_groups_personal ON email_template_groups(tenant_id, user_id, lower(name)) WHERE scope = 'personal';
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_template_groups_system ON email_template_groups(tenant_id, lower(name)) WHERE scope = 'system';
ALTER TABLE email_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_template_groups;
CREATE POLICY tenant_isolation_policy ON email_template_groups USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE email_quick_templates
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES email_template_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_system_template_layouts (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(100) NOT NULL,
  group_id UUID REFERENCES email_template_groups(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, template_key)
);
ALTER TABLE email_system_template_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_system_template_layouts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_system_template_layouts;
CREATE POLICY tenant_isolation_policy ON email_system_template_layouts USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
