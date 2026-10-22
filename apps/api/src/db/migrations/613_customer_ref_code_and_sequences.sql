-- Per-customer invoice reference codes and per-customer invoice sequences.
-- Format: {prefix}{customer_ref_code}/{seq} — e.g. INV-ALK/0001
-- Each customer gets a short unique ref code (like a stock ticker) and their
-- own independent invoice counter starting at 1.

-- 1. Add ref_code to customers — short uppercase alpha code, unique per tenant.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ref_code VARCHAR(20);

-- Unique per tenant so two customers in the same workspace can't share a code.
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_ref_code_uniq
  ON customers (tenant_id, ref_code) WHERE ref_code IS NOT NULL;

-- 2. Per-customer invoice sequence table — one counter per customer per tenant.
CREATE TABLE IF NOT EXISTS customer_invoice_sequences (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, customer_id)
);

ALTER TABLE customer_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoice_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_invoice_sequences_tenant_isolation ON customer_invoice_sequences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_invoice_sequences TO hudumika_app;
