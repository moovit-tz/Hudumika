-- Migration 454: rule-based lead scoring — the "Intelligence" gap.
-- Every top-10 CRM auto-prioritizes the queue with a numeric fit score;
-- here there was nothing. Rule-based first (an admin sets "QUALIFIED
-- stage → +20", "value over 10M → +15"), evaluated on read against the
-- lead's own columns plus its activity count — no stored score column to
-- keep in sync, no ML, just a transparent sum an admin can reason about.
-- A model-based version can come later once there's enough closed-deal
-- history; the activity timeline (449) is where that training data now
-- accumulates.

CREATE TABLE crm_lead_scoring_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  field      TEXT NOT NULL,
  op         TEXT NOT NULL,
  value      TEXT,
  points     INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_lead_scoring_tenant ON crm_lead_scoring_rules(tenant_id, position);

ALTER TABLE crm_lead_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_scoring_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_lead_scoring_rules
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
