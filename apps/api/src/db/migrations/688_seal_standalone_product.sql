-- SEAL commercialization, mirroring migrations 685/687 exactly.
-- 'seal_advanced' (already Scale/Enterprise/scale-tzs-only, never given away
-- below Scale) is deliberately left untouched, same reasoning as
-- HuduFreight's tracking.* sub-keys in migration 687.

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('seal-addon', 'SEAL', 'TZS', 69000, 690000, 69000, 690000, false, 904)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('seal-addon', 'seal')
ON CONFLICT DO NOTHING;

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('seal-grandfathered', 'SEAL (grandfathered)', 'TZS', 0, 0, 0, 0, false, 905)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('seal-grandfathered', 'seal')
ON CONFLICT DO NOTHING;

INSERT INTO tenant_product_subscriptions (tenant_id, commercial_product_id, package_code, status, started_at)
SELECT t.id, cp.id, 'seal-grandfathered', 'active', t.created_at
FROM tenants t
JOIN commercial_products cp ON cp.product_key = 'seal'
WHERE t.plan IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs')
ON CONFLICT (tenant_id, commercial_product_id) DO NOTHING;

DELETE FROM package_features
WHERE feature_key = 'seal'
  AND package_code IN ('starter', 'growth', 'enterprise', 'business-tzs', 'scale-tzs', 'logistics-tzs');

UPDATE commercial_products
SET standalone_purchasable = true,
    readiness_state = 'pilot',
    default_billing_method = 'flat_tier',
    updated_at = now()
WHERE product_key = 'seal';
