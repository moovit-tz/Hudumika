-- ============================================================
-- 102 — Register 'onesite' (the CMS/OneSite app) as a real
--        entitlement. It previously had zero backend registration
--        (no package_features grant, no app_status row), so
--        requireEntitlement('onesite') would 403 every tenant.
--        Mirrors the seeding pattern in 060_entitlements.sql.
-- ============================================================

INSERT INTO package_features (package_code, feature_key)
SELECT p, 'onesite'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
VALUES ('onesite', 'active')
ON CONFLICT (app_id) DO NOTHING;
