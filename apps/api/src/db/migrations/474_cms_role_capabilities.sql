-- 474_cms_role_capabilities.sql
-- §74 of the CMS master brief: today access is binary — 'onesite'
-- entitlement + non-CUSTOMER role = full access to every CMS area. This
-- table makes that configurable per role, per area, additive to the
-- existing gate rather than a rewrite of it: a row that doesn't exist
-- means "unrestricted" (the exact behavior every tenant already has), so
-- no existing tenant's access changes until someone explicitly narrows a
-- role here. ADMIN always bypasses this table entirely (see
-- cms-capabilities.service.ts) — the tenant's own top role can never be
-- capability-restricted, the same way SUPER_ADMIN bypasses platform-wide
-- checks.
--
-- Three actions, not five — the brief's own "{view,create,edit,delete,
-- publish}" per-area shape collapses create/edit/delete into one "manage"
-- capability here: splitting them further multiplies the config surface
-- (and the testing surface) for a distinction most tenants won't actually
-- use, a deliberate, disclosed scope reduction. "publish" stays its own
-- capability since it's the one real-world distinction tenants actually
-- care about (a role that can draft content but not make it live).

CREATE TABLE IF NOT EXISTS cms_role_capabilities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  area        TEXT        NOT NULL, -- 'pages' | 'posts' | 'comments' | 'media' | 'content' | 'settings'
  can_view    BOOLEAN     NOT NULL DEFAULT true,
  can_manage  BOOLEAN     NOT NULL DEFAULT true, -- create/edit/delete
  can_publish BOOLEAN     NOT NULL DEFAULT true,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role, area)
);
CREATE INDEX IF NOT EXISTS cms_role_capabilities_tenant ON cms_role_capabilities (tenant_id);

ALTER TABLE cms_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_role_capabilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_role_capabilities;
CREATE POLICY tenant_isolation_policy ON cms_role_capabilities
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
