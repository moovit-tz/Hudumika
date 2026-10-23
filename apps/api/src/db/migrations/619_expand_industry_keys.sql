-- Widen the industry CHECK constraint on finance_industry_work to cover
-- all 24 verticals defined in the all-industries production programme.
-- Cannot modify mig 561 — it's already applied.

ALTER TABLE finance_industry_work DROP CONSTRAINT IF EXISTS finance_industry_work_industry_check;
ALTER TABLE finance_industry_work ADD CONSTRAINT finance_industry_work_industry_check
  CHECK (industry IN (
    'retail', 'wholesale', 'ecommerce',
    'manufacturing', 'food_beverage', 'printing',
    'warehousing',
    'professional_services', 'consulting', 'construction',
    'property', 'automotive',
    'hospitality', 'restaurant',
    'agriculture',
    'education', 'healthcare', 'pharmaceutical',
    'mining', 'energy',
    'telecom',
    'insurance', 'lending',
    'logistics'
  ));

-- Seed the new capability keys into package_features and app_status
-- so tenants on finance+ packages can activate them.
INSERT INTO package_features (package_code, feature_key)
SELECT p, f
FROM unnest(ARRAY['finance','professional','scale','enterprise']) AS p
CROSS JOIN unnest(ARRAY[
  'finance.ecommerce','finance.food_beverage','finance.construction',
  'finance.property','finance.automotive','finance.hospitality',
  'finance.restaurant','finance.agriculture','finance.education',
  'finance.healthcare','finance.pharmaceutical','finance.mining',
  'finance.energy','finance.telecom','finance.insurance',
  'finance.lending','finance.logistics'
]) AS f
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
SELECT key, 'active' FROM unnest(ARRAY[
  'finance.ecommerce','finance.food_beverage','finance.construction',
  'finance.property','finance.automotive','finance.hospitality',
  'finance.restaurant','finance.agriculture','finance.education',
  'finance.healthcare','finance.pharmaceutical','finance.mining',
  'finance.energy','finance.telecom','finance.insurance',
  'finance.lending','finance.logistics'
]) AS key
ON CONFLICT (app_id) DO NOTHING;
