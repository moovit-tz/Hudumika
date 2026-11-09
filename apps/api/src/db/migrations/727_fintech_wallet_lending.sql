-- Fintech & Financial Services (backlog item 29), scoped per the business's
-- own answer: a real wallet/payment role, operating ON TOP OF Selcom and
-- AzamPay's own licensed rails — this platform is not itself a licensed
-- payment institution. Per the backlog's own explicit P0: "distinguish
-- operational subledger from authoritative FinOps GL and reconcile them" —
-- every wallet transaction below is an operational record that ALSO posts
-- a real GLService journal entry (gl_entry_id), never a parallel ledger
-- that quietly diverges from the books.

-- Backfill the two new standard GL accounts (gl.service.ts's STANDARD_COA)
-- into every existing tenant, same convention as migration 486.
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2720', 'Customer Wallet Liability', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '4600', 'Fintech Transaction Fee Income', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Verified customer checks (P1) — a wallet cannot be opened for a customer
-- with no passed KYC check. Kept separate from `customers` itself since a
-- customer may exist platform-wide for non-fintech reasons long before
-- ever being KYC'd for a wallet.
CREATE TABLE IF NOT EXISTS fintech_kyc_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  level            TEXT NOT NULL DEFAULT 'basic' CHECK (level IN ('basic', 'enhanced')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  document_refs    JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_by       UUID,
  checked_at       TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fintech_kyc_checks_customer_idx ON fintech_kyc_checks (tenant_id, customer_id, status);
ALTER TABLE fintech_kyc_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_kyc_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_kyc_checks
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS fintech_wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id),
  currency      TEXT NOT NULL DEFAULT 'TZS',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  frozen_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, currency)
);
ALTER TABLE fintech_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_wallets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_wallets
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- The authoritative operational subledger. Deliberately NO stored balance
-- column on the wallet itself — available/reserved balance is always
-- derived by summing this table plus fintech_wallet_holds, the same
-- "derived-balance" discipline already proven in Petti's wallet service,
-- so a missed update can never leave a stale balance sitting in a column.
-- gl_entry_id links every posted transaction to its real GLService journal
-- entry — the actual subledger/GL reconciliation point the backlog names.
CREATE TABLE IF NOT EXISTS fintech_wallet_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id            UUID NOT NULL REFERENCES fintech_wallets(id),
  type                 TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee', 'reversal')),
  amount               NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'TZS',
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed', 'reversed')),
  provider             TEXT NOT NULL DEFAULT 'internal' CHECK (provider IN ('selcom', 'azampay', 'internal')),
  provider_reference   TEXT,
  related_transaction_id UUID REFERENCES fintech_wallet_transactions(id),
  gl_entry_id          UUID REFERENCES journal_entries(id),
  failed_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at            TIMESTAMPTZ,
  failed_at            TIMESTAMPTZ,
  reversed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fintech_wallet_transactions_wallet_idx ON fintech_wallet_transactions (tenant_id, wallet_id, status);
-- Idempotency on provider-originated transactions: the same provider
-- reference (a Selcom/AzamPay transaction id) can never be recorded twice
-- for this tenant, regardless of how many times a webhook or poll replays it.
CREATE UNIQUE INDEX IF NOT EXISTS fintech_wallet_transactions_provider_ref_idx
  ON fintech_wallet_transactions (tenant_id, provider, provider_reference) WHERE provider_reference IS NOT NULL;
ALTER TABLE fintech_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_wallet_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_wallet_transactions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Reserved balance (P1: "available/reserved balances, authorization,
-- limits"). A hold reduces available balance without yet being a posted
-- transaction — captured (becomes a real debit transaction) or released
-- (frees the reservation), never silently forgotten.
CREATE TABLE IF NOT EXISTS fintech_wallet_holds (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id              UUID NOT NULL REFERENCES fintech_wallets(id),
  amount                 NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reason                 TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'captured')),
  captured_transaction_id UUID REFERENCES fintech_wallet_transactions(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fintech_wallet_holds_wallet_idx ON fintech_wallet_holds (tenant_id, wallet_id, status);
ALTER TABLE fintech_wallet_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_wallet_holds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_wallet_holds
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Provider settlement reconciliation (P1: "bank/provider settlement,
-- uncertain/failed transactions and recovery") — what Selcom/AzamPay
-- actually settled against what the subledger expected for a batch/period.
CREATE TABLE IF NOT EXISTS fintech_provider_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('selcom', 'azampay')),
  batch_reference TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  expected_amount NUMERIC(18,2) NOT NULL,
  settled_amount  NUMERIC(18,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'mismatched', 'investigating', 'resolved')),
  notes           TEXT,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, batch_reference)
);
ALTER TABLE fintech_provider_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_provider_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_provider_settlements
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Exception investigation (P1) — every uncertain/failed transaction and
-- every settlement mismatch becomes a real, trackable case, not a silent
-- log line.
CREATE TABLE IF NOT EXISTS fintech_exception_cases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_type             TEXT NOT NULL CHECK (case_type IN ('uncertain_transaction', 'failed_transaction', 'settlement_mismatch', 'kyc_flag')),
  wallet_transaction_id UUID REFERENCES fintech_wallet_transactions(id),
  settlement_id         UUID REFERENCES fintech_provider_settlements(id),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'escalated')),
  assigned_to           UUID,
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes      TEXT,
  resolved_by           UUID,
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fintech_exception_cases_status_idx ON fintech_exception_cases (tenant_id, status);
ALTER TABLE fintech_exception_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE fintech_exception_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fintech_exception_cases
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
