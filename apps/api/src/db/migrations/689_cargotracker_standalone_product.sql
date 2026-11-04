-- CargoTracker commercialization, mirroring 685/687/688, with one real
-- difference: it was never bundled into business-tzs or logistics-tzs, only
-- growth/enterprise/starter(USD)/scale-tzs. So the grandfather list below is
-- narrower than the other three products' — a business-tzs tenant isn't
-- being grandfathered into something it never had; it's gaining the ability
-- to buy CargoTracker for the first time, same as a starter-tzs tenant
-- always could for the other three products.

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('cargotracker-addon', 'CargoTracker', 'TZS', 49000, 490000, 49000, 490000, false, 906)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('cargotracker-addon', 'cargotracker')
ON CONFLICT DO NOTHING;

INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, is_active, sort_order)
VALUES ('cargotracker-grandfathered', 'CargoTracker (grandfathered)', 'TZS', 0, 0, 0, 0, false, 907)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('cargotracker-grandfathered', 'cargotracker')
ON CONFLICT DO NOTHING;

INSERT INTO tenant_product_subscriptions (tenant_id, commercial_product_id, package_code, status, started_at)
SELECT t.id, cp.id, 'cargotracker-grandfathered', 'active', t.created_at
FROM tenants t
JOIN commercial_products cp ON cp.product_key = 'cargotracker'
WHERE t.plan IN ('starter', 'growth', 'enterprise', 'scale-tzs')
ON CONFLICT (tenant_id, commercial_product_id) DO NOTHING;

DELETE FROM package_features
WHERE feature_key = 'cargotracker'
  AND package_code IN ('starter', 'growth', 'enterprise', 'scale-tzs');

UPDATE commercial_products
SET standalone_purchasable = true,
    readiness_state = 'pilot',
    default_billing_method = 'flat_tier',
    updated_at = now()
WHERE product_key = 'cargotracker';
