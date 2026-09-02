-- Ondi feature-gap pass, continued — dynamic/rule-based groups. The
-- benchmark doc's own gap list: "Groups are static, no SCIM inbound —
-- org-groups.ts is explicit: membership is static, dynamic groups is a
-- documented follow-up." That file only exists in the disconnected fork
-- (services/ondi-api) — the real integrated system has no group concept at
-- all yet, only per-user custom-role grants (ondi_org_roles /
-- ondi_org_role_members, see org-rbac.ts). This is that concept, built
-- fresh, plus real rule-based auto-membership on top — not a port of the
-- fork's code.
--
-- Deliberately does NOT touch how permissions are checked (hasOrgPermission
-- in org-rbac.ts still only ever reads ondi_org_role_members) — a group is
-- a bulk-management layer that writes ordinary role-grant rows, tagged with
-- where they came from, rather than a second authorization concept the
-- security-critical permission check would need to learn about.

CREATE TABLE IF NOT EXISTS ondi_org_groups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  -- 'dynamic' groups carry a rule; membership is computed, not typed in by
  -- hand. Kept intentionally narrow — see evaluateGroupRule() in
  -- oneid.routes.ts — to attributes this platform can actually confirm on
  -- `users` (role, active), not a speculative department/team/location
  -- field that doesn't reliably exist or reach the UI for every tenant yet.
  membership_type  TEXT NOT NULL DEFAULT 'static' CHECK (membership_type IN ('static', 'dynamic')),
  rule             JSONB,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_org_groups_name ON ondi_org_groups(tenant_id, name);

CREATE TABLE IF NOT EXISTS ondi_org_group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES ondi_org_groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'rule' members were added by evaluating the group's rule and get
  -- removed the same way, the moment they stop matching. 'manual' members
  -- survive a recalculation even on a dynamic group — an admin's explicit
  -- add always overrides the rule, never silently reverted by it.
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rule')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_org_group_members_pair ON ondi_org_group_members(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ondi_org_group_members_user ON ondi_org_group_members(user_id);

CREATE TABLE IF NOT EXISTS ondi_org_group_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES ondi_org_groups(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES ondi_org_roles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_org_group_roles_pair ON ondi_org_group_roles(group_id, role_id);

-- Provenance on an existing table, additive-only (nullable, no backfill
-- needed — every row that already exists was a direct/manual grant, which
-- is exactly what NULL means here). CASCADE: deleting a group revokes
-- everything it granted rather than leaving orphaned, un-attributed access
-- behind — the security-conservative direction.
ALTER TABLE ondi_org_role_members ADD COLUMN IF NOT EXISTS granted_via_group_id UUID REFERENCES ondi_org_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ondi_org_role_members_group ON ondi_org_role_members(granted_via_group_id) WHERE granted_via_group_id IS NOT NULL;

ALTER TABLE ondi_org_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_groups FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_groups'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_groups
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE ondi_org_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_group_members FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_group_members'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_group_members
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE ondi_org_group_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_group_roles FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_group_roles'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_group_roles
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
