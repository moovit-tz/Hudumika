-- Migration 556: CRM territory management
-- Territories are named regions/segments for routing leads and deals to reps.
-- Each territory has an optional set of match criteria (JSONB, same shape as
-- crm_assignment_rules conditions) and a list of member reps.

CREATE TABLE IF NOT EXISTS crm_territories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  criteria    JSONB NOT NULL DEFAULT '[]',   -- [{field, op, value}] same schema as assignment rules
  color       VARCHAR(7),                    -- optional hex color for UI
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_territories_name ON crm_territories(tenant_id, name);
CREATE INDEX        IF NOT EXISTS idx_crm_territories_tenant ON crm_territories(tenant_id, active);

CREATE TABLE IF NOT EXISTS crm_territory_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES crm_territories(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (territory_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_territory_members_territory ON crm_territory_members(territory_id);
CREATE INDEX IF NOT EXISTS idx_crm_territory_members_user ON crm_territory_members(tenant_id, user_id);

-- Leads & deals can be tagged to a territory
ALTER TABLE leads ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES crm_territories(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS territory_id UUID REFERENCES crm_territories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_territory ON leads(territory_id) WHERE territory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_territory ON deals(territory_id) WHERE territory_id IS NOT NULL;

ALTER TABLE crm_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_territories_tenant ON crm_territories
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE crm_territory_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_territory_members_tenant ON crm_territory_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
