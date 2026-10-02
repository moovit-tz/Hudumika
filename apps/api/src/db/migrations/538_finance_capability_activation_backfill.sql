-- Preserve every Finance capability tenants can use today before changing
-- missing activation rows to mean "available, but not enabled". This covers
-- package grants, purchased add-ons, and explicit SuperAdmin app overrides.
-- Future package upgrades intentionally receive no activation row: the tenant
-- chooses whether to enable the newly available operational module.
WITH configurable_capabilities(capability_key) AS (
  SELECT unnest(ARRAY[
    'finance.accounting.advanced','finance.budgets','finance.fixed_assets',
    'finance.multi_currency','finance.inventory','finance.procurement','finance.pos',
    'finance.warehouse','finance.manufacturing','finance.professional_services',
    'finance.project_accounting','finance.consolidation'
  ]::text[])
), existing_grants AS (
  SELECT t.id AS tenant_id, pf.feature_key AS capability_key
  FROM tenants t
  JOIN package_features pf ON pf.package_code = t.plan
  JOIN configurable_capabilities c ON c.capability_key = pf.feature_key

  UNION

  SELECT ta.tenant_id, pa.feature_key
  FROM tenant_addons ta
  JOIN package_addons pa ON pa.code = ta.addon_code AND pa.is_active = TRUE
  JOIN configurable_capabilities c ON c.capability_key = pa.feature_key
  WHERE ta.status = 'active'

  UNION

  SELECT ts.tenant_id, app_override.key
  FROM tenant_settings ts
  CROSS JOIN LATERAL jsonb_each_text(COALESCE(ts.settings->'enabled-apps', '{}'::jsonb)) AS app_override(key, value)
  JOIN configurable_capabilities c ON c.capability_key = app_override.key
  WHERE app_override.value = 'true'
)
INSERT INTO tenant_finance_capabilities (
  tenant_id, capability_key, enabled, enabled_by, enabled_at, updated_at
)
SELECT tenant_id, capability_key, TRUE, NULL, NOW(), NOW()
FROM existing_grants
ON CONFLICT (tenant_id, capability_key) DO NOTHING;
