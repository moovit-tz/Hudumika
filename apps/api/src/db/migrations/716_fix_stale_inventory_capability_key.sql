-- Migration 716: industry_app_capabilities still referenced the dead
-- 'inventory' app_id for the automotive industry. Migration 559 renamed
-- 'inventory' to 'seal' platform-wide (package_features, app_status) but
-- this table — added later, migration ~672 — was seeded with the stale
-- name, so automotive's capability list silently pointed at a feature key
-- that no longer exists anywhere else in the system.

UPDATE industry_app_capabilities
SET app_id = 'seal', updated_at = now()
WHERE app_id = 'inventory' AND industry_key = 'automotive';
