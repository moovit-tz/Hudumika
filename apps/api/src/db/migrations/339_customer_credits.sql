-- Migration 339: M10 of the corporate-tax build-out — AR credit balances.
-- Deliberately distinct from credit_notes (which tie to one specific
-- original invoice, a documented reduction of what was billed) —
-- customer_credits is an *unapplied, customer-level* balance, usable
-- against any future invoice, born from a real overpayment rather than a
-- correction to a specific document.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2150', 'Customer Credits Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS customer_credits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       UUID,
  amount            NUMERIC(16,2) NOT NULL,
  source_invoice_id UUID REFERENCES sales_invoices(id),
  reason            TEXT,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_credits_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS customer_credits_customer ON customer_credits (tenant_id, customer_id);

ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON customer_credits
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- One row per application, not a running "applied_amount" counter on
-- customer_credits itself — a real audit trail of which invoice each part
-- of a credit went to, matching this program's own "real FKs, not a
-- single mutable balance" precedent. A credit's remaining balance is
-- always amount minus the sum of its applications, computed on read.
CREATE TABLE IF NOT EXISTS customer_credit_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_id         UUID NOT NULL REFERENCES customer_credits(id),
  invoice_id        UUID NOT NULL REFERENCES sales_invoices(id),
  amount            NUMERIC(16,2) NOT NULL,
  journal_entry_id  UUID REFERENCES journal_entries(id),
  applied_by        UUID,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_applications_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS customer_credit_applications_credit ON customer_credit_applications (credit_id);

ALTER TABLE customer_credit_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON customer_credit_applications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
