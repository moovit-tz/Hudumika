-- Migration 555: auto-assignment rules for CRM leads
-- When a new lead is created matching a rule, it is automatically assigned to
-- the rule's assignee. Rules are checked in priority order (lower number = higher
-- priority); the first match wins.
-- match_type governs how conditions are combined (all = AND, any = OR).
-- conditions is JSONB: [{ field: 'source'|'industry'|'location'|'priority', op: 'eq'|'contains', value: '...' }]

CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  priority     INT NOT NULL DEFAULT 10,
  subject_type TEXT NOT NULL DEFAULT 'lead' CHECK (subject_type IN ('lead', 'deal')),
  match_type   TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
  conditions   JSONB NOT NULL DEFAULT '[]',
  assign_to    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_assign_rules_tenant ON crm_assignment_rules(tenant_id, active, priority);

ALTER TABLE crm_assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_assignment_rules_tenant ON crm_assignment_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
