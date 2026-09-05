-- 391_billing_petti_wallet_payment.sql
-- Lets Workspace ▸ Subscription ▸ Payments add a tenant's own Petti wallet
-- as a payment method, and lets "Pay Now" on a subscription invoice
-- actually deduct from it — a real GL-tracked balance (petti_wallets'
-- own gl_account_id), not a second parallel counter. Unlike card/mobile-
-- money "Pay Now" (billing.routes.ts's PaymentsIntegration.simulateCharge —
-- honestly simulated, no live Hudumika-side merchant credentials exist to
-- actually charge a card or push an STK request), a wallet deduction is
-- entirely internal money movement this platform already tracks for real,
-- so it doesn't need an external gateway to be genuine.

ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_type_check;
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_type_check
  CHECK (type IN ('card', 'mobile_money', 'bank', 'petti_wallet'));

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS petti_wallet_id UUID REFERENCES petti_wallets(id) ON DELETE SET NULL;

-- New standard GL expense account for platform subscription/software fees —
-- 5900 (Other Operating Expenses) was the only fallback before; a wallet
-- disbursement deserves its own line same as Petti's own TRANSPORT/UTILITIES
-- categories do (see petti.service.ts's PETTI_EXPENSE_ACCOUNT). Added to
-- gl.service.ts's STANDARD_COA too, so a tenant onboarding after this
-- migration gets it seeded automatically — this backfills every tenant
-- that already has a chart of accounts (a tenant with none yet is an
-- already-tracked separate issue, see migration 137, and gets the full set
-- including this one from seedChartOfAccounts when that runs).
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5103', 'Software & Subscription Fees', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
