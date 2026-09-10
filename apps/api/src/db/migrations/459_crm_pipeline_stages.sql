-- Migration 459: configurable, per-tenant deal pipeline stages.
--
-- 447_crm_deals.sql fixed a `stage` CHECK constraint to exactly
-- QUALIFICATION/PROPOSAL/NEGOTIATION/WON/LOST — real progress over the old
-- one-object-carries-everything model, but every top-10 CRM (Salesforce,
-- HubSpot, Zoho, Pipedrive, Dynamics 365) lets a tenant define its own
-- pipeline stages, rename them, reorder them, and add more than one
-- "won"/"lost" terminal stage (e.g. "Won — signed" vs "Won — verbal").
--
-- crm_pipeline_stages makes that real: `key` is what deals.stage actually
-- stores (so every existing deal row stays valid with zero data migration —
-- the five defaults below use the exact same keys the old CHECK constraint
-- allowed), `is_won`/`is_lost` replace the hardcoded 'WON'/'LOST' string
-- comparisons deals.routes.ts and Pipeline.tsx used for closing logic.
--
-- deals.stage's CHECK constraint is dropped — validity is enforced in
-- application code against a tenant's live stage list instead (same
-- app-level-validation shape as contact_labels/crm_custom_field_defs), not
-- a static DB enum, since the whole point is that the list changes.

CREATE TABLE crm_pipeline_stages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'blue',  -- one of the platform's semantic tint tokens (gold/blue/teal/green/red/purple) — never a hex code, see CLAUDE.md
  position   INTEGER NOT NULL DEFAULT 0,
  is_won     BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost    BOOLEAN NOT NULL DEFAULT FALSE,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
CREATE INDEX idx_crm_pipeline_stages_tenant ON crm_pipeline_stages(tenant_id, position);

ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_pipeline_stages
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Backfill: every tenant that has ever created a deal (or could — any
-- tenant with the 'crm' entitlement) gets the same five stages the CHECK
-- constraint used to hardcode, in the same order, so today's kanban board
-- renders identically before anyone touches the new settings page.
INSERT INTO crm_pipeline_stages (tenant_id, key, label, color, position, is_won, is_lost)
SELECT t.id, s.key, s.label, s.color, s.position, s.is_won, s.is_lost
FROM tenants t
CROSS JOIN (VALUES
  ('QUALIFICATION', 'Qualification', 'gold',  0, FALSE, FALSE),
  ('PROPOSAL',      'Proposal',      'blue',  1, FALSE, FALSE),
  ('NEGOTIATION',   'Negotiation',   'teal',  2, FALSE, FALSE),
  ('WON',           'Won',           'green', 3, TRUE,  FALSE),
  ('LOST',          'Lost',          'red',   4, FALSE, TRUE)
) AS s(key, label, color, position, is_won, is_lost)
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Drop the fixed enum — deals.stage is now validated in application code
-- against the tenant's own crm_pipeline_stages.key set.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
