-- Phase E: Administrator hierarchy and consistent visibility.
-- Adds organizational scope to custom role grants and an impersonation
-- audit trail for platform operators acting on tenant data.

-- ── 1. Scope columns on role grants ────────────────────────────────────────
-- A NULL scope = tenant-wide (the existing behavior). A set scope restricts
-- the grant's effect to records under that entity or site. The enforcement
-- is in org-rbac.ts's hasOrgPermission() and the new hasScopedPermission().
ALTER TABLE ondi_org_role_members
  ADD COLUMN IF NOT EXISTS scope_entity_id UUID REFERENCES tenant_entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_site_id   UUID REFERENCES tenant_sites(id) ON DELETE CASCADE;

-- If both are set, the site takes precedence (a site is narrower than an entity).
-- A CHECK ensures you don't set site without entity:
ALTER TABLE ondi_org_role_members
  ADD CONSTRAINT chk_scope_hierarchy
    CHECK (scope_site_id IS NULL OR scope_entity_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_ondi_role_members_scope_entity
  ON ondi_org_role_members(tenant_id, scope_entity_id)
  WHERE scope_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ondi_role_members_scope_site
  ON ondi_org_role_members(tenant_id, scope_site_id)
  WHERE scope_site_id IS NOT NULL;

-- ── 2. Platform operator impersonation audit ───────────────────────────────
-- Every time a SUPER_ADMIN acts on tenant data through the platform context,
-- we record the real operator, the affected tenant, the action taken, and
-- the reason. This is separate from the app's general activity log because
-- these actions cross the tenant boundary and need their own audit surface.
CREATE TABLE IF NOT EXISTS platform_operator_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID NOT NULL REFERENCES users(id),
  affected_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  reason          TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_operator_audit_tenant
  ON platform_operator_audit(affected_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_operator_audit_operator
  ON platform_operator_audit(operator_id, created_at DESC);

-- No RLS on this table — it's platform-scoped, only accessible via dbPlatform
-- by SUPER_ADMIN. Tenant users never see it.

-- ── 3. User-to-entity/site assignment ──────────────────────────────────────
-- Beyond custom role scope, users themselves can be assigned to one or more
-- entities/sites. This is the "where do I work" mapping that scoped views
-- filter on, separate from "what permissions do I have there" above.
CREATE TABLE IF NOT EXISTS user_org_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id   UUID REFERENCES tenant_entities(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES tenant_sites(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  assigned_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_assignment_target CHECK (entity_id IS NOT NULL OR site_id IS NOT NULL),
  UNIQUE (tenant_id, user_id, entity_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_assignments_user
  ON user_org_assignments(tenant_id, user_id);

ALTER TABLE user_org_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_org_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'user_org_assignments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON user_org_assignments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
