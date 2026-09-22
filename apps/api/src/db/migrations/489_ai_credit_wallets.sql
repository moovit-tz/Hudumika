-- AI credit wallets — per-tenant metered billing for platform-default AI
-- usage (the agentic platform build, see docs/architecture/
-- HUDUMIKA_AGENTIC_IMPLEMENTATION_2026-09-19.html and migration 488).
--
-- Design decision (user, 2026-09-20): a tenant's own BYOK key
-- (tenant_settings.settings['int-ai']) always wins when configured AND
-- their plan tier allows bringing one (packages.byok_ai_allowed) — today
-- that's the "Hudu Advanced" tier (code='enterprise') only. Every other
-- tenant draws from a monthly AI-credits allowance (packages.
-- monthly_ai_credits) billed to the platform; once exhausted, platform AI
-- is unavailable until the next calendar month (same real-time "blocked at
-- zero" mechanic Petti's wallet uses) or until the tenant configures their
-- own key on an eligible plan.
--
-- Deliberately NOT modeled on Petti's real GL-backed wallet
-- (petti_wallets/petti_deposits, migration 261) — that's real cash
-- requiring double-entry accounting. AI credits are a usage allowance, not
-- currency movement, so a balance is derived from a lightweight debit
-- ledger instead: balance = plan's monthly_ai_credits - SUM(debits this
-- calendar period). No "grant" row is ever inserted — the allowance is
-- read live off the tenant's current plan every time, so a mid-cycle plan
-- change takes effect immediately rather than needing a backfill.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS monthly_ai_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS byok_ai_allowed BOOLEAN NOT NULL DEFAULT false;

-- Seed a real starting allowance per active tier rather than leaving every
-- plan at the column default of 0 (which would make platform AI dead for
-- every existing tenant the moment this migration runs). Numbers are a
-- first cut, editable per tier from here on via SuperAdmin ▸ Packages
-- (packages.routes.ts's existing PATCH /:code, extended to accept these
-- two new fields) — not meant to be precise pricing.
UPDATE packages SET monthly_ai_credits = 10  WHERE code = 'free';
UPDATE packages SET monthly_ai_credits = 50  WHERE code = 'starter';
UPDATE packages SET monthly_ai_credits = 200 WHERE code = 'growth';
UPDATE packages SET monthly_ai_credits = 500 WHERE code = 'enterprise';
UPDATE packages SET monthly_ai_credits = 500 WHERE code = 'scale';
UPDATE packages SET byok_ai_allowed = true WHERE code = 'enterprise';

CREATE TABLE IF NOT EXISTS agent_credit_ledger (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 'YYYY-MM' (UTC), matching tenant_usage_counters' own period convention
  -- — a calendar-month allowance, no rollover.
  period     TEXT NOT NULL,
  -- Always negative (a debit) today — signed rather than an unsigned
  -- "amount" column so a future correction/refund entry (e.g. a run that
  -- errored before reaching the provider) can be recorded as a positive
  -- entry in the same ledger without a schema change.
  delta      INTEGER NOT NULL,
  run_id     UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_credit_ledger_tenant_period ON agent_credit_ledger(tenant_id, period);

ALTER TABLE agent_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_credit_ledger FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'agent_credit_ledger'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON agent_credit_ledger
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
