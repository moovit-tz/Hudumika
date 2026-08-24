-- Petti wallet-to-wallet transfers — moving petty cash between two of a
-- tenant's own wallets (e.g. rebalancing "Ops Petty Cash" into "Fleet Petty
-- Cash") without it ever leaving tenant custody, so it must never touch Bank
-- Account 1010 or an expense account the way a deposit/disbursement does.
-- One balanced journal entry per transfer (Dr destination wallet account /
-- Cr source wallet account), same GLService.post() engine and single-entry
-- shape petti.service.ts's recordDeposit already uses — not the two-entry
-- AR/AP shape gl.service.ts's postIntercompanyTransaction uses, since that's
-- for genuinely different accounting entities and both wallets here share
-- one chart of accounts.
CREATE TABLE IF NOT EXISTS petti_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_wallet_id UUID NOT NULL REFERENCES petti_wallets(id) ON DELETE RESTRICT,
  to_wallet_id UUID NOT NULL REFERENCES petti_wallets(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL,
  note TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petti_transfers_tenant ON petti_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_petti_transfers_from ON petti_transfers(from_wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_petti_transfers_to ON petti_transfers(to_wallet_id, created_at DESC);

ALTER TABLE petti_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_transfers FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_transfers'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_transfers
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
