-- Real add-ons — purchasable independent of which base package a tenant is
-- on, the same "Get more with add-ons" concept every major SaaS billing
-- page has next to its plan tiers. Onsite moves here from being its own
-- competing fourth base package (onsite-standalone, migration 244) — it
-- targets a narrow slice of tenants (agencies, web hosts/cloud infra
-- teams, IT providers) who need it ALONGSIDE whatever plan they're already
-- on, not instead of one, the same way Google Workspace sells AI access or
-- extra storage as an add-on rather than a separate plan tier.

CREATE TABLE IF NOT EXISTS package_addons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  -- The entitlement feature key this add-on grants, checked in
  -- middleware/entitlement.ts alongside package_features.
  feature_key   VARCHAR(100) NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  color         VARCHAR(20),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO package_addons (code, name, description, feature_key, monthly_price, annual_price, color, sort_order) VALUES
('onsite', 'Onsite',
 'For agencies, web hosts, cloud infrastructure teams, and IT providers who manage hosting or technical operations for other businesses — add real multi-client site and server management on top of whatever plan you''re already on.',
 'onsite', 9, 75.60, '#e8461a', 1)
ON CONFLICT (code) DO NOTHING;

-- Tenants that have purchased/been granted an add-on — the entitlement
-- check's new source (checkEntitlement/tenantHasEntitlement in
-- middleware/entitlement.ts), alongside package_features. One row per
-- (tenant, addon); status lets a cancelled add-on stop granting access
-- without losing the purchase history.
CREATE TABLE IF NOT EXISTS tenant_addons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  addon_code   VARCHAR(50) NOT NULL REFERENCES package_addons(code),
  status       VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, addon_code)
);
CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant ON tenant_addons(tenant_id, status);

ALTER TABLE tenant_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_addons FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_addons'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_addons
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Guarantee the AgencyHost "detached client" recovery plan (onsite-standalone,
-- migration 244 / onsite-plan.routes.ts's POST /activate-standalone) still
-- grants 'onsite' via the existing package_features check regardless of its
-- prior state — idempotent, a no-op if this row already existed.
INSERT INTO package_features (package_code, feature_key) VALUES ('onsite-standalone', 'onsite')
ON CONFLICT (package_code, feature_key) DO NOTHING;

-- Leave three purchasable base packages — Onsite is now an add-on above,
-- not a fourth competing tier. Soft-deactivate only (is_active=false;
-- GET /v1/packages already filters to active ones), never a delete, so
-- platform_transactions history and any tenant still actually on this plan
-- (tenants.plan = 'onsite-standalone') keep working exactly as before —
-- only new-signup/catalog visibility changes.
UPDATE packages SET is_active = false, updated_at = now() WHERE code = 'onsite-standalone';
