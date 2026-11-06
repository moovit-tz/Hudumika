-- Migration 705: Developer Platform prepaid credits had no real payment
-- behind them at all.
--
-- POST /v1/developer/accounts/:id/billing/topup took a client-supplied
-- amount and added it straight to balance_credits -- any authenticated
-- account owner could mint unlimited real-looking spendable balance with
-- zero gateway charge. Compounded by a new personal account always being
-- seeded with a free 50,000 TZS balance on top. Fixing this the same way
-- ESB top-up already works (esb_checkout_requests, billing.routes.ts):
-- stage a checkout request first, verify directly with the payment
-- gateway, and only then credit the account -- a crafted tx_ref can't
-- credit an account that never staged it.

CREATE TABLE IF NOT EXISTS dev_billing_checkout_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id  UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  billing_account_id    UUID NOT NULL REFERENCES developer_billing_accounts(id) ON DELETE CASCADE,
  tx_ref                VARCHAR(200) NOT NULL UNIQUE,
  amount                NUMERIC(14,4) NOT NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'TZS',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  initiated_by          UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dev_billing_checkout_account ON dev_billing_checkout_requests(developer_account_id);

-- 'TOP_UP' didn't exist as its own event type — topUpCredits() was
-- (mis)labeling a credit addition as 'CREDIT_DEDUCTION' with a negative
-- amount, backwards from every other positive-in/negative-out ledger in
-- this codebase.
ALTER TABLE dev_billing_events DROP CONSTRAINT IF EXISTS dev_billing_events_event_type_check;
ALTER TABLE dev_billing_events ADD CONSTRAINT dev_billing_events_event_type_check
  CHECK (event_type IN ('CHARGE', 'INCLUDED_ALLOWANCE', 'CREDIT_DEDUCTION', 'OVERAGE', 'REFUND', 'ADJUSTMENT', 'TOP_UP'));
