-- Migration 447: a real Deal/Opportunity object for the CRM — Gap #1 of
-- the CRM-vs-top-10 analysis (see the "Now" tier of the gap-analysis
-- roadmap). Every top-10 CRM (Salesforce, HubSpot, Zoho, Dynamics 365,
-- Pipedrive) separates the top-of-funnel Lead from the qualified,
-- in-progress Deal/Opportunity it becomes; here, leads.stage carried the
-- entire funnel end-to-end in one row with no distinct pipeline object to
-- report on, board, or automate against.
--
-- lead_id is nullable and ON DELETE SET NULL — a deal survives its
-- originating lead being deleted; it's provenance, not a hard dependency.
-- customer_id is separately nullable because a deal can start against an
-- EXISTING customer with no lead phase at all (an account manager's
-- upsell/renewal), which is exactly the case a single merged
-- lead-carries-everything model couldn't represent.
--
-- stage_changed_at is separate from updated_at (touched by any edit) so the
-- kanban board's "days in this stage" aging badge reflects real dwell time,
-- not the last time someone fixed a typo in the deal name.
--
-- RLS is applied in this same migration, not deferred to a later retrofit —
-- the lesson from 440/444/445's gap-fix migrations this same audit pass
-- turned up in Contacts, ClearOS's shipment tasks, and the org claim-code
-- table respectively.

CREATE TABLE deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  stage           TEXT NOT NULL DEFAULT 'QUALIFICATION'
                    CHECK (stage IN ('QUALIFICATION','PROPOSAL','NEGOTIATION','WON','LOST')),
  value           NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  probability     SMALLINT NOT NULL DEFAULT 50 CHECK (probability BETWEEN 0 AND 100),
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  source          TEXT,
  expected_close  DATE,
  closed_at       TIMESTAMPTZ,
  lost_reason     TEXT,
  notes           TEXT,
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_tenant   ON deals(tenant_id, created_at DESC);
CREATE INDEX idx_deals_stage    ON deals(tenant_id, stage);
CREATE INDEX idx_deals_customer ON deals(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_deals_lead     ON deals(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_deals_owner    ON deals(owner_id) WHERE owner_id IS NOT NULL;

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON deals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
