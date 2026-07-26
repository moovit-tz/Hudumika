-- 128_crm_leads.sql
-- Real backing table for the CRM Leads pipeline (apps/web/src/pages/Leads.tsx).
-- The page previously called a /v1/leads API that never existed on the
-- backend, silently falling back to a hardcoded FALLBACK_LEADS array
-- whenever the (nonexistent) API returned empty or errored.
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company         TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  contact_email   TEXT,
  contact_phone   TEXT,
  source          TEXT NOT NULL DEFAULT 'Web Form',
  stage           TEXT NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST')),
  value           NUMERIC(14,2) NOT NULL DEFAULT 0,
  priority        TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  assigned_to     TEXT,
  expected_close  DATE,
  notes           TEXT,
  industry        TEXT,
  location        TEXT,
  website         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id, created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_leads ON leads
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
