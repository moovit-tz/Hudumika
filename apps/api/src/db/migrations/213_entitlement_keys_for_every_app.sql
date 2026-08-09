-- Half the platform could not be sold, gated, or switched off.
--
-- entitlements.ts opens by stating that feature keys correspond one-to-one with
-- app ids. They had drifted badly:
--
--   * Eight apps had no feature key at all — SEAL, Inventory, Studio, CRM,
--     Bliss, Calendar, Tasks and Store. isAppEnabled() treats an unknown key as
--     enabled, so they were permanently on for every tenant on every plan, and
--     a tenant admin had no way to turn one off.
--
--   * The database already granted `onesite` and `inventory`, neither of which
--     the FeatureKey union declared — grants for features the type said did not
--     exist.
--
-- Every key is granted to every existing package here, so no tenant loses an
-- app it can use today: this migration makes the apps *governable*, it does not
-- re-price anything. Which tier keeps which is a commercial decision, made
-- afterwards by removing rows.
--
-- Lens is deliberately absent. It is internal tooling gated on SUPER_ADMIN
-- (INTERNAL_APP_IDS in LauncherApps.tsx), not a feature a tenant's plan grants
-- or a tenant admin toggles.

INSERT INTO package_features (package_code, feature_key)
SELECT p.code, f.key
FROM packages p
CROSS JOIN (VALUES
  ('seal'), ('inventory'), ('studio'), ('crm'),
  ('bliss'), ('calendar'), ('tasks'), ('store'), ('onesite')
) AS f(key)
WHERE NOT EXISTS (
  SELECT 1 FROM package_features pf
  WHERE pf.package_code = p.code AND pf.feature_key = f.key
);

COMMENT ON TABLE package_features IS
  'Which features each package grants. Keys correspond 1:1 with app ids (packages/types/src/entitlements.ts) — adding an app means adding its key here, or it is ungovernable and silently always-on.';
