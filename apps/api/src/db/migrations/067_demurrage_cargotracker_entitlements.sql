-- Migration 067: Demurrage and CargoTracker (AWB/BL tracking) become
-- standalone, independently-entitled apps, split out of ClearOS.
--
-- Both were previously reachable only inside ClearOS's own nav
-- (/clearos/demurrage, /clearos/tracker) and demurrage.routes.ts was gated
-- on the blanket 'clearos' feature key; tracker.routes.ts had no
-- entitlement gate at all. This seeds the two new feature keys across all
-- plan tiers (matching every existing app's default-allow seed from
-- migration 060) and registers both as active apps, so requireEntitlement()
-- and GET /v1/entitlements work for them from day one.

INSERT INTO package_features (package_code, feature_key)
SELECT p, f
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
CROSS JOIN unnest(ARRAY['demurrage','cargotracker']) AS f
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
SELECT unnest(ARRAY['demurrage','cargotracker']), 'active'
ON CONFLICT (app_id) DO NOTHING;
