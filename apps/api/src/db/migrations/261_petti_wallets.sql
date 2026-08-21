-- Petti — tenant petty-cash wallet app (new).
--
-- Multiple named wallets per tenant (e.g. "Fleet Petty Cash", "Ops Petty
-- Cash"), each backed by its own chart_of_accounts asset account so its
-- balance is a real, independently-reportable GL balance — not a counter
-- maintained in parallel to the ledger that could drift from it. Deposits
-- and disbursements both post real double-entry journal lines via
-- GLService.post(), same engine finance_expenses/gl.routes.ts already use.
--
-- Withdrawal is request -> approve/reject -> disburse, not a single-step
-- action — a request only becomes a real cash movement (GL posting +
-- finance_expenses row) at disburse time. This mirrors the same "typed
-- figure isn't authoritative until confirmed" caution the platform already
-- applies elsewhere (rate overrides, manual customs channels, etc.).
--
-- Deposits: method='manual' is the only path that actually works today — an
-- admin records that money already arrived (bank transfer, cash drop). No
-- real payment-gateway integration exists anywhere in this codebase yet
-- (apps/api/src/integrations/payments.ts is explicitly a simulator, "no
-- real gateway is wired up", used only for onboarding signup) — wiring a
-- live mobile-money/aggregator API requires real provider credentials tied
-- to an actual merchant account, a business decision, not something
-- buildable here. method='gateway' + the provider/tx_ref columns exist so a
-- real adapter can be dropped in later without a schema change; see
-- petti.service.ts's PaymentGatewayAdapter seam.
--
-- Disbursements bridge into "the expenses tool" by inserting a real row
-- into finance_expenses (076_finance_expenses.sql) rather than a parallel
-- table — a petty-cash withdrawal shows up in FinOps's own Expenses page
-- exactly like a manually-typed one, automatically, with no separate view
-- to build or keep in sync.

CREATE TABLE IF NOT EXISTS petti_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  currency VARCHAR(5) NOT NULL DEFAULT 'TZS',
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active | closed
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_petti_wallets_tenant ON petti_wallets(tenant_id);

CREATE TABLE IF NOT EXISTS petti_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES petti_wallets(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | gateway
  gateway_provider TEXT,
  gateway_tx_ref TEXT,
  reference TEXT,
  note TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petti_deposits_tenant ON petti_deposits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_petti_deposits_wallet ON petti_deposits(wallet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS petti_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES petti_wallets(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'MISCELLANEOUS',
  purpose TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | disbursed
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  disbursed_by UUID,
  disbursed_at TIMESTAMPTZ,
  finance_expense_id UUID REFERENCES finance_expenses(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_petti_withdrawals_tenant ON petti_withdrawal_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_petti_withdrawals_wallet ON petti_withdrawal_requests(wallet_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_petti_withdrawals_status ON petti_withdrawal_requests(tenant_id, status);

ALTER TABLE petti_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_wallets FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_wallets'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_wallets
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE petti_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_deposits FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_deposits'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_deposits
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE petti_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_withdrawal_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_withdrawal_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_withdrawal_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- New app entitlement, seeded across every plan tier like every other base
-- app (060_entitlements.sql's own seed comment: "nothing is plan-restricted
-- at the app level yet" — matching that default-allow baseline rather than
-- inventing a different default for just this one app).
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'petti'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status) VALUES ('petti', 'active')
ON CONFLICT (app_id) DO NOTHING;
