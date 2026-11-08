-- Lending P0s (industry-readiness backlog item 18):
--   (1) "define surplus handling: inspected code may retain an
--       unallocated remainder while storing full payment amount. Allocate
--       it explicitly to credit/suspense/refund and reconcile."
--   (2) "durable repayment idempotency, reversal and concurrent
--       allocation tests."
-- Confirmed both true of recordLoanRepayment(): a payment larger than
-- everything owed across the whole schedule stored the full amount on
-- the repayment row while principal_part + interest_part summed to less
-- than that — the difference simply vanished, credited to nobody. No
-- idempotency check existed (a retried submission created a second real
-- repayment), and no reversal path existed at all (a bounced payment or a
-- data-entry correction had no way to be undone).

-- A real suspense/credit ledger for the surplus — "allocate it explicitly
-- to credit... and reconcile", not silently absorbed into the repayment's
-- own stored amount.
CREATE TABLE IF NOT EXISTS finance_loan_credits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  loan_id            UUID NOT NULL REFERENCES finance_loans(id),
  source_repayment_id UUID NOT NULL REFERENCES finance_loan_repayments(id),
  amount             NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status             TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','refunded')),
  refunded_by        UUID REFERENCES users(id),
  refunded_at        TIMESTAMPTZ,
  refund_reference   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_loan_credits_loan_idx ON finance_loan_credits (tenant_id, loan_id, status);
ALTER TABLE finance_loan_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_loan_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_loan_credits
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Reversal: a repayment is never deleted (it happened, and the schedule
-- allocations it drove are real audit history) — it's marked reversed,
-- same reasoning this platform already applies to GL journal entries
-- (void = mirror + flag, never delete).
ALTER TABLE finance_loan_repayments
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- Idempotency: a retried repayment submission carrying the same
-- reference for the same loan must replay the original result, not
-- create a second real payment.
CREATE UNIQUE INDEX IF NOT EXISTS finance_loan_repayments_idempotency_idx
  ON finance_loan_repayments (tenant_id, loan_id, reference) WHERE reference IS NOT NULL;
