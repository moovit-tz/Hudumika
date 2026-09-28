-- 518_workflow_automations.sql
-- Backend persistence for the AI Automations builder. Previously all
-- workflow definitions were stored only in localStorage — clearing the
-- browser or switching devices permanently destroyed them. Each row is
-- one workflow tab (name + ReactFlow nodes + edges), scoped per-user
-- within a tenant so automations are personal workspaces, not shared.
CREATE TABLE IF NOT EXISTS workflow_automations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  name        VARCHAR(200) NOT NULL DEFAULT 'Automation',
  nodes       JSONB NOT NULL DEFAULT '[]',
  edges       JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_automations_tenant_user
  ON workflow_automations(tenant_id, user_id);

ALTER TABLE workflow_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workflow_automations ON workflow_automations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
