-- Migration 729: gift cards (S07 of the industry-readiness backlog) — a
-- prepaid balance tied to a redeemable code, usable as a POS tender
-- method. Confirmed entirely absent before this pass (zero code/table
-- hits anywhere). A gift card's balance is always derived live from
-- gift_card_transactions (never a mutable counter), matching this
-- program's standing convention (customer_credits, petti_wallets,
-- fintech wallets all do the same).

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2160', 'Gift Card Liability', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS gift_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  customer_id UUID,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  expires_at  TIMESTAMPTZ,
  issued_by   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS gift_cards_customer ON gift_cards (tenant_id, customer_id);

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gift_cards;
CREATE POLICY tenant_isolation_policy ON gift_cards
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 'issue'/'reload'/'refund' increase the spendable balance; 'redeem' and
-- 'void_writeoff' decrease it. A card's balance is always
-- sum(issue+reload+refund) - sum(redeem+void_writeoff) over this table,
-- computed fresh, never cached.
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gift_card_id     UUID NOT NULL REFERENCES gift_cards(id),
  type             TEXT NOT NULL CHECK (type IN ('issue', 'reload', 'redeem', 'refund', 'void_writeoff')),
  amount           NUMERIC(16,2) NOT NULL,
  sale_id          UUID REFERENCES pos_sales(id),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gift_card_transactions_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS gift_card_transactions_card ON gift_card_transactions (gift_card_id);

ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gift_card_transactions;
CREATE POLICY tenant_isolation_policy ON gift_card_transactions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Which specific gift card a GIFT_CARD-method payment drew from — needed
-- to restore the right card's balance when that sale is later refunded or
-- partially returned. NULL for every other tender method.
ALTER TABLE pos_payments ADD COLUMN IF NOT EXISTS gift_card_id UUID REFERENCES gift_cards(id);

-- 531_finance_pos.sql's own CHECK constraint on pos_payments.method never
-- allowed a new tender kind to be added without widening it here too.
ALTER TABLE pos_payments DROP CONSTRAINT IF EXISTS pos_payments_method_check;
ALTER TABLE pos_payments ADD CONSTRAINT pos_payments_method_check CHECK (method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER', 'GIFT_CARD'));
