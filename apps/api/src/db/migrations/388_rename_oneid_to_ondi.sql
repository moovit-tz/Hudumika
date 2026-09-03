-- Finish the OneID -> Ondi rebrand at the data layer. Every user-facing
-- route has read /ondi/... for a long time; the base entitlement/app id
-- itself, seeded by migration 060, never got the same rename.
--
-- Same precedent and same lesson as 170_rename_onepi_to_nexushr.sql /
-- 171_rename_onepi_settings_paths.sql: 170 renamed app_status and
-- package_features but guessed tenant_settings held the override only at
-- enabled-apps.<id>; it doesn't only live there, and 171 had to come back
-- for branding.apps.<id> and workspaces[].id too. This migration writes
-- all of those paths in one pass instead of repeating that two-step
-- mistake, each idempotently guarded so re-running it (or running it
-- against a fresh DB with no 'oneid' data at all) is a clean no-op.

UPDATE app_status       SET app_id      = 'ondi' WHERE app_id      = 'oneid';
UPDATE package_features SET feature_key = 'ondi' WHERE feature_key = 'oneid';

-- History keeps pointing at the app it was actually run for; the app just
-- has a different name now, same reasoning 170 used for report_runs.
UPDATE report_runs      SET app_id      = 'ondi' WHERE app_id      = 'oneid';

-- Per-tenant "enabled-apps" override — rename the key, keep its value, so a
-- tenant who explicitly switched Ondi off (or on, overriding a plan that
-- doesn't include it) stays exactly as they set it.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings #- '{enabled-apps,oneid}',
      '{enabled-apps,ondi}',
      settings #> '{enabled-apps,oneid}'
    )
WHERE settings #> '{enabled-apps,oneid}' IS NOT NULL;

-- Per-tenant brand-colour override for the app tile.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings #- '{branding,apps,oneid}',
      '{branding,apps,ondi}',
      settings #> '{branding,apps,oneid}'
    )
WHERE settings #> '{branding,apps,oneid}' IS NOT NULL;

-- The app-switcher entries array: rewrite only the element whose id is
-- 'oneid', leaving every other element (and their order) untouched. `path`
-- is deliberately left alone here — the app's real route has been
-- /ondi/personal for as long as this array has existed, so any live entry
-- already has the correct path and only its `id` needs to change.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings,
      '{workspaces}',
      (
        SELECT jsonb_agg(
                 CASE WHEN elem->>'id' = 'oneid'
                      THEN elem || jsonb_build_object('id', 'ondi')
                      ELSE elem
                 END
                 ORDER BY ord
               )
        FROM jsonb_array_elements(settings->'workspaces') WITH ORDINALITY AS t(elem, ord)
      )
    )
WHERE jsonb_typeof(settings->'workspaces') = 'array'
  AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(settings->'workspaces') e
        WHERE e->>'id' = 'oneid'
      );
