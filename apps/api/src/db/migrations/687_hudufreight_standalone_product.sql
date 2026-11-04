-- HuduFreight commercialization, mirroring migration 685's ClearOS
-- treatment exactly, per the user's explicit choice to treat it the same
-- way: unbundle the free 'tracking' grant, flat-fee standalone product,
-- grandfather every tenant who already had it for free.
--
-- Scope note: only the base 'tracking' key is unbundled here. The
-- tier-gated sub-keys (tracking.analytics, tracking.cargo-loading,
-- tracking.reports, tracking.warehouse — already Scale-only, never given
-- away below Scale) are deliberately left untouched. Folding those into
-- this add-on too is a real follow-on product question (does buying
-- HuduFreight on top of Scale include them, or are they a further
-- upsell?) that wasn't part of what was asked here, so it's flagged, not
-- silently decided.

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('hudufreight-addon', 'HuduFreight', 'TZS', 69000, 690000, 69000, 690000, false, 902)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('hudufreight-addon', 'tracking')
ON CONFLICT DO NOTHING;

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('hudufreight-grandfathered', 'HuduFreight (grandfathered)', 'TZS', 0, 0, 0, 0, false, 903)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('hudufreight-grandfathered', 'tracking')
ON CONFLICT DO NOTHING;

INSERT INTO tenant_product_subscriptions (tenant_id, commercial_product_id, package_code, status, started_at)
SELECT t.id, cp.id, 'hudufreight-grandfathered', 'active', t.created_at
FROM tenants t
JOIN commercial_products cp ON cp.product_key = 'hudufreight'
WHERE t.plan IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs')
ON CONFLICT (tenant_id, commercial_product_id) DO NOTHING;

DELETE FROM package_features
WHERE feature_key = 'tracking'
  AND package_code IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs');

UPDATE commercial_products
SET standalone_purchasable = true,
    readiness_state = 'pilot',
    default_billing_method = 'flat_tier',
    updated_at = now()
WHERE product_key = 'hudufreight';
