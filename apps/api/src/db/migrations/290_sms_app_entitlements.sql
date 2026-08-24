-- Migration 290: Seed package features and app status for the SMS app.
--
-- The SMS app (migrations 288/289) was registered as an AppId everywhere
-- (packages/types, WorkspaceApp.tsx, AppSidebar.tsx, LauncherApps.tsx,
-- WorkspaceHome.tsx, navConfigs.ts, SuperAdmin.tsx) but never granted a
-- package_features row — step 4 of entitlement.ts's precedence, "does the
-- tenant's plan grant this feature." With no row for any package, every
-- tenant was silently denied regardless of plan; only SUPER_ADMIN (which
-- bypasses entitlement checks entirely) or a manual per-tenant
-- enabled-apps override ever saw the app. Same fix shape as migration
-- 268_sign_app_entitlements.sql, which caught the identical gap for 'sign'.
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'sms'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status) VALUES ('sms', 'active')
ON CONFLICT (app_id) DO NOTHING;
