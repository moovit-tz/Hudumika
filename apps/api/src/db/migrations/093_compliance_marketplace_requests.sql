-- Tenant-scoped: a "post this requirement to ComplyOS" job raised from the
-- Trade Compliance Wizard's results step. Any clearing/logistics company that
-- declared "permits acquisition" as a service during onboarding is a
-- potential match — a consultant/law firm claims a request by writing
-- claimed_by/claimed_at, same open->claimed->closed lifecycle as a job board.
CREATE TABLE IF NOT EXISTS compliance_marketplace_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  procedure_id       UUID NOT NULL REFERENCES trade_procedures(id),
  procedure_name     TEXT NOT NULL,
  requirement_notes  TEXT,
  contact_name       TEXT,
  contact_email      TEXT,
  contact_phone      TEXT,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'closed')),
  claimed_by         TEXT,
  claimed_at         TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_marketplace_requests_tenant ON compliance_marketplace_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_marketplace_requests_status ON compliance_marketplace_requests(status, created_at DESC);
