-- Migration 243: AgencyHost M1 — agency-managed client tenants
--
-- A client of an agency (e.g. a web agency hosting sites for its own
-- customers) is a real, independent Hudumika tenant from the moment it's
-- created — never a sub-record living inside the agency's own tenant. That's
-- what lets a client detach, or move to a different agency, by changing one
-- relationship row instead of migrating every website/domain/deployment row
-- across tenant_id boundaries under this platform's enforced RLS.
--
-- No RLS on this table, deliberately: it spans two tenants by design, and
-- every other table in this schema that does the same (organizations/
-- organization_users, hr_invitations) skips RLS entirely and relies on
-- dbPlatform + explicit application-layer checks instead — there is no
-- precedent anywhere in this codebase for a dual-tenant OR-predicate RLS
-- policy, and this doesn't introduce the first one.

CREATE TABLE agency_managed_tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_tenant_id  UUID NOT NULL REFERENCES tenants(id),
  client_tenant_id  UUID NOT NULL REFERENCES tenants(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'detached')),
  attached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  detached_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  detached_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A client can have many historical (detached) relationships, but only one
-- active one at a time — the thing that makes "move to a different agency"
-- an ordinary attach, not a special case.
CREATE UNIQUE INDEX idx_agency_managed_tenants_active_client
  ON agency_managed_tenants(client_tenant_id) WHERE status = 'active';
CREATE INDEX idx_agency_managed_tenants_agency ON agency_managed_tenants(agency_tenant_id);

-- A freshly-created client tenant needs a `tenants.plan` value (NOT NULL
-- column) that grants nothing on its own. 'starter' would be wrong here —
-- migration 060_entitlements.sql grants it a full platform bundle (clearos,
-- finops, cloud, complyos, tracking, plus onsite) — using it would silently
-- hand every client tenant access to apps that contradict "customers not
-- interested in other products." This package deliberately gets zero
-- package_features rows: while an agency_managed_tenants row is active,
-- entitlement to 'onsite' specifically is granted by middleware/entitlement.ts
-- checking that relationship directly, not by this package. The moment the
-- relationship is marked 'detached', there is nothing left to fall back to —
-- which is exactly the point (a detached client needs a real plan).
INSERT INTO packages (code, name, monthly_price, annual_price, max_users, features, is_active, sort_order)
VALUES ('agency-managed', 'Agency-Managed (internal)', 0, 0, 5, '[]'::jsonb, false, 0)
ON CONFLICT (code) DO NOTHING;
