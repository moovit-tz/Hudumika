-- Migration 060: Package entitlements + per-app maintenance status
--
-- Two independent gates, both consumed by the new requireEntitlement()
-- preHandler (apps/api/src/middleware/entitlement.ts):
--   1. app_status       — global per-app kill switch for maintenance/deploys.
--   2. package_features — which feature keys a tenant's plan tier grants.
--
-- package_features.package_code stores TenantPlan values directly (starter,
-- operations, growth, professional, finance, scale, enterprise — see
-- packages/types/src/user.ts), NOT the 3-row `packages` self-serve catalog
-- table (starter/professional/enterprise only) — those are different
-- concepts that happen to share some names. tenants.plan is the only column
-- that actually varies across all 7 tiers today.

CREATE TABLE IF NOT EXISTS package_features (
  package_code VARCHAR(50) NOT NULL,
  feature_key  VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (package_code, feature_key)
);

CREATE TABLE IF NOT EXISTS app_status (
  app_id     VARCHAR(100) PRIMARY KEY,
  status     VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
  message    TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: every plan tier gets every base app feature. This matches today's
-- actual runtime behavior (requireAppEnabled defaults to allow — nothing is
-- plan-restricted at the app level yet), so switching the fallback from
-- "always allow" to "package_features lookup" doesn't regress any tenant.
-- Superadmins can later narrow this per package via the new
-- /v1/superadmin/packages/:code/features endpoint.
INSERT INTO package_features (package_code, feature_key)
SELECT p, f
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
CROSS JOIN unnest(ARRAY['ai','clearos','cloud','complyos','contacts','email','finops','oneid','onepi','tracking']) AS f
ON CONFLICT DO NOTHING;

-- Fine-grained tracking sub-features already gated today by requirePlanTier
-- (apps/api/src/middleware/planGate.ts) on top of the base 'tracking' app
-- gate — preserved exactly so this migration doesn't loosen existing access.
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'tracking.reports'
FROM unnest(ARRAY['professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO package_features (package_code, feature_key) VALUES
  ('enterprise', 'tracking.cargo-loading'),
  ('enterprise', 'tracking.warehouse'),
  ('enterprise', 'tracking.analytics')
ON CONFLICT DO NOTHING;

-- Seed app_status rows for the apps gated today, all active by default.
INSERT INTO app_status (app_id, status)
SELECT unnest(ARRAY['ai','clearos','cloud','complyos','contacts','email','finops','oneid','onepi','tracking']), 'active'
ON CONFLICT (app_id) DO NOTHING;
