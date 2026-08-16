-- Migration 230: Platform-level Organization identity.
--
-- `customers` is scoped to one tenant — it's a clearing agent's own private
-- record of one of their clients. A real company served by more than one
-- clearing agent on this platform has always ended up as N disconnected
-- `customers` rows, one per tenant, with no shared identity and no way to
-- see "every shipment across every agent handling them" in one login.
--
-- `organizations` sits above `tenants` as a peer, not inside any one tenant
-- (no tenant_id column, deliberately). `organization_users` is its own,
-- separate login mechanism — a third identity type alongside staff `users`
-- and per-tenant `CUSTOMER`-role logins, following this codebase's existing
-- convention of one dedicated mechanism per identity type rather than one
-- table/endpoint branching three ways.
--
-- Both new FKs below are nullable: every existing customers/tenants row is
-- untouched until a staff member explicitly links it (see customers.routes.ts
-- PATCH allowlist) — no self-service org claiming in this slice, since an
-- unverified claim would be a real cross-tenant data exposure.

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255),
  tax_id     VARCHAR(100),  -- candidate natural key, NOT unique — same reasoning as
                             -- customers.registry_number (104_comply_brela_company_fields.sql):
                             -- pre-existing data can collide, dedup stays application-side.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_organization_users_org ON organization_users(organization_id);

ALTER TABLE customers ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_customers_organization ON customers(organization_id) WHERE organization_id IS NOT NULL;

-- Additive only, for a company that also runs its own tenant (e.g. for
-- ComplyOS/NexusHR) independent of being anyone's customer. The column lets
-- that be traced back to the same organization later; the onboarding flow
-- to set it is separate follow-on work, not part of this migration.
ALTER TABLE tenants ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
