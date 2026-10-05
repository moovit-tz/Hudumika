-- Migration 559: seal_advanced entitlement + inventory→seal migration
--
-- The standalone Inventory app has been merged into SEAL. SEAL now has two
-- tiers:
--
--   base 'seal'          → standard warehouse inventory (stock, items, transfers,
--                          counts, lots) — available from the growth plan upward.
--
--   'seal_advanced'      → bonded warehouse / ICD / CFS / customs overlay on top of
--                          the base; enables the THE LEDGER nav section, customs
--                          duties/guarantees, and examination management in SealShell.
--                          Available from scale and enterprise.
--
-- Steps:
--   1. Grant 'seal_advanced' to scale and enterprise plans.
--   2. Convert any tenant whose plan had 'inventory' to now have 'seal'
--      (inventory redirects to /seal in the frontend; 'inventory' as a key is
--      no longer meaningful).
--   3. Remove the now-dead 'inventory' rows from package_features and app_status.

-- ── 1. Grant seal_advanced to scale + enterprise ───────────────────────────

INSERT INTO package_features (package_code, feature_key)
VALUES ('scale', 'seal_advanced'), ('enterprise', 'seal_advanced')
ON CONFLICT (package_code, feature_key) DO NOTHING;

-- Also ensure base 'seal' is granted on growth (it was granted to all plans
-- in migration 213, but guard against any plan added since then).
INSERT INTO package_features (package_code, feature_key)
SELECT p.code, 'seal'
FROM packages p
WHERE p.code IN ('growth', 'scale', 'enterprise')
  AND NOT EXISTS (
    SELECT 1 FROM package_features pf
    WHERE pf.package_code = p.code AND pf.feature_key = 'seal'
  );

-- ── 2. Tenant-level overrides: inventory → seal ────────────────────────────
-- tenant_settings stores an 'enabled-apps' override map as JSONB.
-- If a tenant explicitly enabled or disabled 'inventory', carry the same
-- intent over to 'seal' (unless 'seal' is already set).

UPDATE tenant_settings
SET settings = jsonb_set(
  settings,
  '{enabled-apps,seal}',
  settings->'enabled-apps'->'inventory'
)
WHERE settings->'enabled-apps' ? 'inventory'
  AND NOT (settings->'enabled-apps' ? 'seal');

-- Remove the now-stale 'inventory' key from all overrides.
UPDATE tenant_settings
SET settings = jsonb_set(
  settings,
  '{enabled-apps}',
  (settings->'enabled-apps') - 'inventory'
)
WHERE settings->'enabled-apps' ? 'inventory';

-- ── 3. Remove dead 'inventory' rows ────────────────────────────────────────

DELETE FROM package_features WHERE feature_key = 'inventory';

-- Remove inventory from app_status so it no longer appears in the SuperAdmin
-- App Status page or in the GET /v1/entitlements betaApps list.
DELETE FROM app_status WHERE app_id = 'inventory';

-- Add app_status row for seal_advanced so a SuperAdmin can set maintenance/beta
-- flags on the advanced tier independently of base seal.
INSERT INTO app_status (app_id, status, is_beta)
VALUES ('seal_advanced', 'active', false)
ON CONFLICT (app_id) DO NOTHING;
