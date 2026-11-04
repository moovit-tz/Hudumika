-- ClearOS commercialization, step 1: unbundle it from every tier's free
-- grant and make it a real standalone product, priced as a flat add-on
-- (not usage-metered — the user's explicit choice over ClearOS's own
-- per-declaration metering, which would need separate draft/active-state
-- work on the declarations pipeline first).
--
-- Before this migration, 'clearos' was granted free via package_features to
-- starter, growth, enterprise, business-tzs, scale-tzs and the still-draft
-- logistics-tzs — i.e. every active package except starter-tzs. Unbundling
-- it without grandfathering would silently revoke access from every
-- existing tenant on those plans, which is exactly the kind of "existing
-- subscriber preservation" break the commercial architecture explicitly
-- rules out. So every tenant currently on one of those plans gets a real
-- tenant_product_subscriptions row today, priced at 0, that keeps their
-- access forever regardless of future catalog changes.

-- 1. The real priced add-on. is_active = false deliberately: this is not a
--    tier a tenant picks at signup (it never appears in GET /v1/packages or
--    the onboarding package list, both of which filter on is_active), only
--    a price carrier referenced from tenant_product_subscriptions.package_code
--    via the product-subscription flow (POST /v1/billing/products/:key/subscribe).
INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('clearos-addon', 'ClearOS', 'TZS', 49000, 490000, 49000, 490000, false, 900)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('clearos-addon', 'clearos')
ON CONFLICT DO NOTHING;

-- 2. The zero-cost grandfather carrier. Same shape, price 0, so
--    generatePeriodInvoice's existing `if (subAmount > 0)` guard produces no
--    invoice line at all for tenants on this row — invisible and free,
--    exactly matching what they already had.
INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('clearos-grandfathered', 'ClearOS (grandfathered)', 'TZS', 0, 0, 0, 0, false, 901)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('clearos-grandfathered', 'clearos')
ON CONFLICT DO NOTHING;

-- 3. Grandfather every tenant currently entitled to 'clearos' via one of the
--    plans that's about to lose the free grant. started_at = tenants.created_at,
--    same convention as migration 683's hudumika_business backfill, so these
--    rows read as having always existed rather than appearing today.
INSERT INTO tenant_product_subscriptions (tenant_id, commercial_product_id, package_code, status, started_at)
SELECT t.id, cp.id, 'clearos-grandfathered', 'active', t.created_at
FROM tenants t
JOIN commercial_products cp ON cp.product_key = 'clearos'
WHERE t.plan IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs')
ON CONFLICT (tenant_id, commercial_product_id) DO NOTHING;

-- 4. Remove the free grant from every plan that had it. starter-tzs never
--    had it, so this is a no-op for that row.
DELETE FROM package_features
WHERE feature_key = 'clearos'
  AND package_code IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs');

-- 5. Flip ClearOS from internal/usage_metered placeholder (migration 682) to
--    a real, flat-priced, standalone-purchasable product.
UPDATE commercial_products
SET standalone_purchasable = true,
    readiness_state = 'pilot',
    default_billing_method = 'flat_tier',
    updated_at = now()
WHERE product_key = 'clearos';
