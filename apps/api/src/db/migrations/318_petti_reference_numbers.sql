-- Petti transaction reference numbers.
--
-- Deposits, withdrawal requests, and transfers had no human-readable
-- identifier at all — only an opaque UUID `id`, plus an optional free-text
-- `reference` a user might type on a deposit (nothing on withdrawals or
-- transfers). There was nothing to write on a physical voucher, quote in a
-- reconciliation conversation, or search by. This adds a real sequential
-- `ref` per tenant, per transaction type: DEP-0001, WD-0001, TRF-0001.
--
-- Deliberately NOT count(*)-based like petti_wallets' own PW-#### numbering
-- (createWallet in petti.service.ts) — that pattern already caused a real
-- production bug elsewhere in this codebase once (GL entry numbering, see
-- the gl_entry_number_collision_fix precedent): COUNT(*) + 1 collides the
-- moment any row is deleted, because the count drops but the highest number
-- already issued doesn't. petti_counters below is a single atomic
-- UPDATE ... RETURNING, race-safe under concurrent inserts with no gap or
-- collision risk, and is reused by nextPettiRef() for all three types (and
-- retrofitted onto wallet creation too, replacing that same COUNT(*) bug).
CREATE TABLE IF NOT EXISTS petti_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  counter_type VARCHAR(20) NOT NULL, -- 'wallet' | 'deposit' | 'withdrawal' | 'transfer'
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, counter_type)
);

ALTER TABLE petti_deposits ADD COLUMN IF NOT EXISTS ref VARCHAR(20);
ALTER TABLE petti_withdrawal_requests ADD COLUMN IF NOT EXISTS ref VARCHAR(20);
ALTER TABLE petti_transfers ADD COLUMN IF NOT EXISTS ref VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_petti_deposits_ref ON petti_deposits(tenant_id, ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_petti_withdrawals_ref ON petti_withdrawal_requests(tenant_id, ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_petti_transfers_ref ON petti_transfers(tenant_id, ref) WHERE ref IS NOT NULL;

-- Backfill: number existing rows in creation order, per tenant, and seed
-- petti_counters so the next real insert continues from there rather than
-- restarting at 1 and colliding with what backfill just assigned.
DO $$
DECLARE
  t RECORD;
  r RECORD;
  n INTEGER;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM petti_deposits LOOP
    n := 1;
    FOR r IN SELECT id FROM petti_deposits WHERE tenant_id = t.tenant_id AND ref IS NULL ORDER BY created_at ASC LOOP
      UPDATE petti_deposits SET ref = 'DEP-' || lpad(n::text, 4, '0') WHERE id = r.id;
      n := n + 1;
    END LOOP;
    INSERT INTO petti_counters (tenant_id, counter_type, next_seq) VALUES (t.tenant_id, 'deposit', n)
      ON CONFLICT (tenant_id, counter_type) DO UPDATE SET next_seq = GREATEST(petti_counters.next_seq, EXCLUDED.next_seq);
  END LOOP;

  FOR t IN SELECT DISTINCT tenant_id FROM petti_withdrawal_requests LOOP
    n := 1;
    FOR r IN SELECT id FROM petti_withdrawal_requests WHERE tenant_id = t.tenant_id AND ref IS NULL ORDER BY requested_at ASC LOOP
      UPDATE petti_withdrawal_requests SET ref = 'WD-' || lpad(n::text, 4, '0') WHERE id = r.id;
      n := n + 1;
    END LOOP;
    INSERT INTO petti_counters (tenant_id, counter_type, next_seq) VALUES (t.tenant_id, 'withdrawal', n)
      ON CONFLICT (tenant_id, counter_type) DO UPDATE SET next_seq = GREATEST(petti_counters.next_seq, EXCLUDED.next_seq);
  END LOOP;

  FOR t IN SELECT DISTINCT tenant_id FROM petti_transfers LOOP
    n := 1;
    FOR r IN SELECT id FROM petti_transfers WHERE tenant_id = t.tenant_id AND ref IS NULL ORDER BY created_at ASC LOOP
      UPDATE petti_transfers SET ref = 'TRF-' || lpad(n::text, 4, '0') WHERE id = r.id;
      n := n + 1;
    END LOOP;
    INSERT INTO petti_counters (tenant_id, counter_type, next_seq) VALUES (t.tenant_id, 'transfer', n)
      ON CONFLICT (tenant_id, counter_type) DO UPDATE SET next_seq = GREATEST(petti_counters.next_seq, EXCLUDED.next_seq);
  END LOOP;

  -- Seed the wallet counter too, from whatever PW-#### codes already exist
  -- in chart_of_accounts, so createWallet's retrofit (petti.service.ts)
  -- continues the real sequence instead of restarting at 1 and hitting the
  -- collision-retry path on its very first call.
  FOR t IN SELECT DISTINCT tenant_id FROM petti_wallets LOOP
    SELECT COALESCE(MAX(substring(coa.code from 'PW-(\d+)')::integer), 0) + 1 INTO n
      FROM petti_wallets w JOIN chart_of_accounts coa ON coa.id = w.gl_account_id
      WHERE w.tenant_id = t.tenant_id AND coa.code ~ '^PW-\d+$';
    INSERT INTO petti_counters (tenant_id, counter_type, next_seq) VALUES (t.tenant_id, 'wallet', n)
      ON CONFLICT (tenant_id, counter_type) DO UPDATE SET next_seq = GREATEST(petti_counters.next_seq, EXCLUDED.next_seq);
  END LOOP;
END $$;
