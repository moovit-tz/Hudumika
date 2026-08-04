-- Migration 171: finish the onepi -> nexushr rename inside tenant_settings.
--
-- 170 renamed the entitlement/feature keys and guessed the override lived at
-- settings->'enabled-apps'. It does not. The two real locations are:
--   branding.apps.onepi      — the app's brand colour
--   workspaces[]             — the app switcher entries, {id, path, ...}
-- 170's UPDATE was a no-op against a path that did not exist, so this finishes
-- the job rather than repeating it.

-- 1. branding.apps.onepi -> branding.apps.nexushr, value preserved.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings #- '{branding,apps,onepi}',
      '{branding,apps,nexushr}',
      settings #> '{branding,apps,onepi}'
    )
WHERE settings #> '{branding,apps,onepi}' IS NOT NULL;

-- 2. The workspaces array: rewrite only the element whose id is 'onepi',
--    leaving every other element byte-identical and in its original order.
UPDATE tenant_settings
SET settings = jsonb_set(
      settings,
      '{workspaces}',
      (
        SELECT jsonb_agg(
                 CASE WHEN elem->>'id' = 'onepi'
                      THEN elem || jsonb_build_object('id', 'nexushr', 'path', '/nexushr')
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
        WHERE e->>'id' = 'onepi'
      );
