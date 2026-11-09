-- Migration 730: loyalty points (S07 of the industry-readiness backlog) —
-- confirmed entirely absent before this pass (zero code/table hits
-- anywhere). Scope of THIS migration/pass: customers automatically EARN
-- points on a completed POS sale, at a per-tenant configurable rate,
-- booked as a real GL liability at the moment they're earned (standard
-- loyalty-program accounting — points are a real future obligation, not a
-- marketing footnote). Redeeming points as a tender at checkout is a
-- deliberate, named follow-up, NOT built this pass — the enum below
-- reserves 'redeem' so that follow-up needs no further CHECK-constraint
-- migration (a real pain point hit earlier this session with
-- pos_payments.method).

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2170', 'Loyalty Points Liability', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5910', 'Loyalty Points Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants t WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- One row per tenant — the program's own configuration. Disabled by
-- default: a tenant that never visits the settings page earns nobody any
-- points, same "off until explicitly turned on" convention other
-- per-tenant financial toggles in this codebase already use.
CREATE TABLE IF NOT EXISTS loyalty_programs (
  tenant_id                  UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled                    BOOLEAN NOT NULL DEFAULT false,
  points_per_currency_unit   NUMERIC(10,4) NOT NULL DEFAULT 0.01 CHECK (points_per_currency_unit >= 0),
  redemption_value_per_point NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (redemption_value_per_point > 0),
  updated_by                 UUID,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_programs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON loyalty_programs;
CREATE POLICY tenant_isolation_policy ON loyalty_programs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- A customer's points balance is always derived live from this table
-- (sum of earn/adjust_add/refund minus redeem/adjust_subtract/
-- void_writeoff/reversal), the same "never a mutable counter" convention
-- customer_credits/gift_cards/petti_wallets/fintech wallets all use.
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id),
  type             TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust_add', 'adjust_subtract', 'void_writeoff', 'reversal', 'refund')),
  points           NUMERIC(14,2) NOT NULL CHECK (points > 0),
  value             NUMERIC(16,2) NOT NULL,
  sale_id          UUID REFERENCES pos_sales(id),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by       UUID,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_transactions_customer ON loyalty_transactions (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS loyalty_transactions_sale ON loyalty_transactions (sale_id);

-- The inline CHECK above only takes effect on a fresh CREATE — this ALTER
-- keeps an already-created table's constraint in sync on a re-run too
-- (same lesson as the pos_payments.method fix: CREATE TABLE IF NOT EXISTS
-- is a no-op against an existing table, constraint and all).
ALTER TABLE loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_type_check;
ALTER TABLE loyalty_transactions ADD CONSTRAINT loyalty_transactions_type_check
  CHECK (type IN ('earn', 'redeem', 'adjust_add', 'adjust_subtract', 'void_writeoff', 'reversal', 'refund'));

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON loyalty_transactions;
CREATE POLICY tenant_isolation_policy ON loyalty_transactions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
