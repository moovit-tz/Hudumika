-- Enterprise Identity & Governance — gates the advanced Ondi capabilities
-- that were real and shipped (SAML SSO federation, JIT-expiring role
-- grants, SIEM webhook export) but only ever gated by role, never by plan.
-- Any tenant on any tier could configure real federated SSO for free.
-- 'SSO/SCIM costs more' is one of the most standard levers in SaaS pricing
-- and was sitting unused on top of functionality that already existed.
--
-- One umbrella feature key, not three: package_addons.feature_key is a
-- single string per row, and these three capabilities are always sold as
-- one coherent "enterprise identity" story, not three separate purchase
-- decisions. Bundled into 'enterprise' for free (today all four tiers
-- share an identical package_features set — 'enterprise' has zero real
-- feature differentiation beyond a higher usage cap; this finally gives it
-- one, matching how every real SaaS bundles SSO into its top tier), and
-- purchasable as an add-on for starter/growth/scale.
--
-- Prefixed 'ondi.', not 'oneid.': the product was rebranded OneID → Ondi
-- (every route/URL already reads /ondi/... and /v1/ondi/...) — a new
-- identifier added after the rebrand takes the current name. The base
-- 'oneid' feature key itself was renamed to 'ondi' shortly after this
-- migration, in a later one — see the migration that renames it for the
-- full rebrand (app_status, package_features, report_runs, and the
-- relevant tenant_settings JSONB paths).

INSERT INTO package_features (package_code, feature_key)
VALUES ('enterprise', 'ondi.governance')
ON CONFLICT DO NOTHING;

INSERT INTO package_addons (code, name, description, feature_key, monthly_price, annual_price, color, sort_order) VALUES
('ondi-governance', 'Enterprise Identity & Governance',
 'Real SAML SSO federation, time-boxed just-in-time role grants, and SIEM webhook export for your security team — on top of whatever plan you''re already on. Included free on Enterprise.',
 'ondi.governance', 15, 126.00, '#4253d1', 2)
ON CONFLICT (code) DO NOTHING;
