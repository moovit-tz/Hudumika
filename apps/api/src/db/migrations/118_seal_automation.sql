-- 118_seal_automation.sql
-- SEAL-owned automation rules (trigger -> action). Confirmed during this
-- session's planning pass that both of the platform's existing workflow
-- engines (ClearOS's shipment-lifecycle step-graph, NexusHR's
-- subject_id/subject_type case engine) are architecturally unfit for SEAL's
-- triggers — this is a small, purpose-built table, not a third generic
-- engine. seal_automation_runs borrows NexusHR's subject_id/subject_type
-- shape structurally (025_nexushr_workflows.sql's hr_workflow_cases) for
-- "an automation firing is now open against this subject," without sharing
-- its table — so the same rule never re-fires against the same lot/
-- examination while a prior firing is still open.
CREATE TABLE seal_automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id  UUID REFERENCES seal_compartments(id) ON DELETE CASCADE, -- null = applies tenant-wide
  name            VARCHAR(200) NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('lot_flagged', 'storage_expiring', 'examination_pending', 'low_stock')),
  threshold_value NUMERIC(12,2), -- days for storage_expiring, qty for low_stock; unused by the other triggers
  action_type     TEXT NOT NULL CHECK (action_type IN ('create_task', 'create_ticket')),
  action_assignee VARCHAR(255), -- assigned_to for create_task; ignored for create_ticket
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_automation_rules_tenant ON seal_automation_rules(tenant_id);

ALTER TABLE seal_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_automation_rules ON seal_automation_rules
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_automation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id       UUID NOT NULL REFERENCES seal_automation_rules(id) ON DELETE CASCADE,
  subject_id    UUID NOT NULL, -- e.g. a seal_lots.id or seal_examinations.id
  subject_type  VARCHAR(50) NOT NULL, -- 'lot' | 'examination'
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  result_type   TEXT, -- 'task' | 'ticket'
  result_id     UUID, -- the created seal_tasks.id or support_tickets.id
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX idx_seal_automation_runs_tenant ON seal_automation_runs(tenant_id);
CREATE INDEX idx_seal_automation_runs_rule ON seal_automation_runs(rule_id, status);
-- At most one OPEN run per rule+subject (prevents re-firing while unresolved);
-- unlimited resolved history rows remain allowed for the same pair.
CREATE UNIQUE INDEX idx_seal_automation_runs_open_unique ON seal_automation_runs(rule_id, subject_id) WHERE status = 'open';

ALTER TABLE seal_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_automation_runs ON seal_automation_runs
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
