-- Finance remains one Hudumika application. Package grants determine which
-- capabilities a workspace may use; this table stores only the tenant's
-- optional activation choices and never duplicates billing/subscriptions.
CREATE TABLE IF NOT EXISTS tenant_finance_capabilities (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  capability_key  VARCHAR(100) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  enabled_by      UUID,
  enabled_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_finance_capabilities_tenant
  ON tenant_finance_capabilities(tenant_id);

ALTER TABLE tenant_finance_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_finance_capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON tenant_finance_capabilities
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Basic Finance follows the existing FinOps grant. Advanced grants use the
-- current Hudumika package codes; commercial packaging remains editable via
-- package_features and is not hard-coded in application logic.
INSERT INTO package_features (package_code, feature_key)
SELECT DISTINCT package_code, 'finance.core'
FROM package_features WHERE feature_key = 'finops'
ON CONFLICT DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
SELECT p, f
FROM unnest(ARRAY['finance','professional','scale','enterprise']) AS p
CROSS JOIN unnest(ARRAY[
  'finance.accounting.advanced','finance.budgets','finance.fixed_assets',
  'finance.multi_currency','finance.inventory','finance.procurement','finance.pos',
  'finance.warehouse','finance.manufacturing','finance.professional_services',
  'finance.project_accounting','finance.consolidation'
]) AS f
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status)
SELECT key, 'active' FROM unnest(ARRAY[
  'finance.core','finance.accounting.advanced','finance.budgets','finance.fixed_assets',
  'finance.multi_currency','finance.inventory','finance.procurement','finance.pos',
  'finance.warehouse','finance.manufacturing','finance.professional_services',
  'finance.project_accounting','finance.consolidation'
]) AS key
ON CONFLICT (app_id) DO NOTHING;
