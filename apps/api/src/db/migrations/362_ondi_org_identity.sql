-- Ondi M5: org identity — KYB (business verification), custom roles/groups
-- layered on top of users.role (not replacing it — every existing
-- requireRole() call site keeps working unchanged), and self-service
-- access requests against those roles.
--
-- Deliberately does NOT reuse or touch the pre-existing `organizations`/
-- `organization_users` tables (230_organizations.sql) — those model a real,
-- different thing: a cross-tenant customer-portal identity (a company that
-- is a *customer* of several tenants at once), not "the tenant modeled as
-- an org." Every table below keys directly off `tenants`/`tenant_id`,
-- matching the migration plan's own "one Ondi identity = one tenant_id"
-- decision, with no new tenant-like concept introduced.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kyb_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (kyb_status IN ('not_started', 'pending', 'verified', 'rejected'));

-- A tenant's own business-registration document (certificate of
-- incorporation, business licence) — same Gemini-OCR pattern as personal
-- KYC (ondi_kyc_submissions), different target (the tenant itself, not a
-- user) and a different reviewer: a tenant can't self-certify its own
-- business identity, so this is reviewed by the platform SuperAdmin, not a
-- tenant admin (see oneid.routes.ts's KYC approve for the contrast).
CREATE TABLE IF NOT EXISTS ondi_org_kyb (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  submitted_by          UUID NOT NULL REFERENCES users(id),
  document_storage_key  TEXT NOT NULL,
  extracted_company_name TEXT,
  extracted_registry_number TEXT,
  extracted_entity_type  TEXT,
  extracted_status       TEXT,
  extracted_incorporation_date DATE,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  reviewed_by            UUID REFERENCES users(id),
  reviewed_at            TIMESTAMPTZ,
  rejection_reason       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_org_kyb_tenant ON ondi_org_kyb(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ondi_org_kyb_queue ON ondi_org_kyb(status, created_at);

ALTER TABLE ondi_org_kyb ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_kyb FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_kyb'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_kyb
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Custom roles: a tenant admin can name a role ("KYC Reviewer", "Finance
-- Approver") and grant it a set of fine-grained permission keys — additive
-- to users.role, which every existing route still checks unchanged.
-- permissions is a plain array of permission-key strings (e.g.
-- ["kyc.review"]) rather than a second table: the permission catalog is
-- small and code-defined (see lib/org-rbac.ts), not admin-extensible, so a
-- join table would add a layer of indirection with no real flexibility
-- behind it.
CREATE TABLE IF NOT EXISTS ondi_org_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE ondi_org_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_roles FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_roles'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_roles
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ondi_org_role_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES ondi_org_roles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ondi_org_role_members_user ON ondi_org_role_members(tenant_id, user_id);

ALTER TABLE ondi_org_role_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_role_members FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_role_members'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_role_members
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Self-service: a member asks for a role they don't hold, instead of
-- always needing an admin to remember to grant it.
CREATE TABLE IF NOT EXISTS ondi_org_access_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id       UUID NOT NULL REFERENCES ondi_org_roles(id) ON DELETE CASCADE,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_org_access_requests_queue ON ondi_org_access_requests(tenant_id, status, created_at);

ALTER TABLE ondi_org_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_access_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_access_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_access_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
