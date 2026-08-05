-- Migration 170: the HR app's id becomes `nexushr`.
--
-- It has been called NexusHR in the UI for a long time while its feature key,
-- entitlement key and URL stayed `onepi`. That was cosmetic until now: OnePi
-- is becoming a separate KPI-management app, and two apps cannot share one
-- entitlement key — a tenant granted OnePi for KPIs would silently be granted
-- the entire HR module with it.
--
-- Four places hold the string, all updated here:
--   app_status.app_id                     (maintenance kill-switch)
--   package_features.feature_key          (which plans include it)
--   report_runs.app_id                    (historical report attribution)
--   tenant_settings.settings->'enabled-apps'  (per-tenant override)
--
-- Idempotent: every statement is a no-op on a second run.

UPDATE app_status       SET app_id      = 'nexushr' WHERE app_id      = 'onepi';
UPDATE package_features SET feature_key = 'nexushr' WHERE feature_key = 'onepi';

-- History keeps pointing at the app it was actually run for; the app just has
-- a different name now, so these are renamed rather than left dangling.
UPDATE report_runs      SET app_id      = 'nexushr' WHERE app_id      = 'onepi';

-- Per-tenant overrides live as a JSON object keyed by app id. Rename the key
-- and keep its value, so a tenant who explicitly switched HR off stays off.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings #- '{enabled-apps,onepi}',
      '{enabled-apps,nexushr}',
      settings #> '{enabled-apps,onepi}'
    )
WHERE settings #> '{enabled-apps,onepi}' IS NOT NULL;

-- OnePi is deliberately NOT recreated here as a KPI app. It gets its own row
-- when that app actually exists — an entitlement key for software nobody can
-- open is the kind of thing that later reads as a shipped feature.
