-- Platform defaults are read explicitly through dbPlatform; tenant sessions
-- must never gain write access to null-tenant retention policies.
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_retention_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON data_retention_policies;
CREATE POLICY tenant_isolation_policy ON data_retention_policies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE crm_territory_members FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_marketplace_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_territories FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_automations FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_assignment_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE crm_sales_quotas FORCE ROW LEVEL SECURITY;
