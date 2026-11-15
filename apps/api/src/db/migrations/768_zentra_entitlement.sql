-- Zentra becomes a plan feature.
--
-- It shipped (migration 762) with no feature key, and isAppEnabled() treats
-- an unknown key as enabled, so every workspace on every plan saw it. The
-- key is now declared in packages/types/src/entitlements.ts and the API
-- gates /v1/zentra/* with requireEntitlement('zentra') (platform oversight
-- stays SuperAdmin-only, and SuperAdmins bypass entitlements anyway).
--
-- Granted to the higher tiers, the same ones LexCore reaches, plus the
-- privacy pack (Zentra is audit and risk evidence). Adjust per package in
-- SuperAdmin ▸ Packages.

INSERT INTO package_features (package_code, feature_key)
SELECT p, 'zentra'
FROM unnest(ARRAY['enterprise', 'scale', 'scale-tzs', 'professional', 'business-tzs', 'finance', 'legal-tzs', 'privacy-tzs']) AS p
WHERE EXISTS (SELECT 1 FROM package_features pf WHERE pf.package_code = p)
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status, is_beta, commercially_available)
VALUES ('zentra', 'active', false, true)
ON CONFLICT (app_id) DO NOTHING;
