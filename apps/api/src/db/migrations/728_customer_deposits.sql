-- Migration 728: true customer deposits (S07 of the industry-readiness
-- backlog) — cash taken in BEFORE a job/order/invoice exists, distinct
-- from the existing customer_credits flow, which only ever got born from
-- an invoice overpayment (invoice-payment.service.ts). Rather than a
-- parallel table, this widens customer_credits to carry either origin —
-- it is the same thing from the GL's point of view (an unapplied
-- liability balance against account 2150, usable against any future
-- invoice for that customer) and reuses the exact same apply-to-invoice
-- path (customer-credits.routes.ts's POST /:id/apply) unchanged.

ALTER TABLE customer_credits
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'overpayment'
    CHECK (source_type IN ('overpayment', 'deposit')),
  ADD COLUMN IF NOT EXISTS received_via TEXT;

-- A deposit is cash actually received and must have a cash/tender method;
-- an overpayment credit is derived from an existing invoice payment and
-- doesn't carry its own separate tender (the invoice payment already did).
ALTER TABLE customer_credits
  ADD CONSTRAINT customer_credits_deposit_has_method
    CHECK (source_type <> 'deposit' OR received_via IS NOT NULL);

-- A true deposit can be handed back in cash if the job never happens —
-- the existing apply-to-invoice path only ever consumes a credit by
-- applying it forward. One row per refund event, same "real audit trail,
-- never a mutable counter" convention customer_credit_applications
-- already established; a credit's remaining balance is always
-- amount minus the sum of its applications minus the sum of its refunds.
CREATE TABLE IF NOT EXISTS customer_credit_refunds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_id         UUID NOT NULL REFERENCES customer_credits(id),
  amount            NUMERIC(16,2) NOT NULL,
  method            TEXT NOT NULL,
  note              TEXT,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  refunded_by       UUID,
  refunded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_refunds_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS customer_credit_refunds_credit ON customer_credit_refunds (credit_id);

ALTER TABLE customer_credit_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON customer_credit_refunds
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
