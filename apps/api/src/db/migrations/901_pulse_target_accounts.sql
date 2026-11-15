-- Pulse account-based marketing: companies (customers) marketing and sales
-- are going after together.
--
-- An account's people are its Contacts (contacts.company_id), its CRM leads
-- (same organisation party, or the same company name) and the customer record
-- itself. The engagement score (0–100) is recalculated hourly from what those
-- people actually did in the last 30 days — Pulse opens and clicks, website
-- forms, open deals — and the owner is told when an account goes hot (60+).

CREATE TABLE IF NOT EXISTS pulse_target_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tier          SMALLINT NOT NULL DEFAULT 2 CHECK (tier BETWEEN 1 AND 3),
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  score         INTEGER NOT NULL DEFAULT 0,
  score_detail  JSONB NOT NULL DEFAULT '{}'::jsonb,
  scored_at     TIMESTAMPTZ,
  hot_since     TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_target_accounts_tenant ON pulse_target_accounts(tenant_id, score DESC);

ALTER TABLE pulse_target_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_target_accounts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'pulse_target_accounts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON pulse_target_accounts USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
