-- 297_recurring_invoices.sql
-- The AR counterpart to recurring_bills (013_invoices_bills_settings.sql) —
-- AR had no recurring-invoice concept at all. Same shape as its AP sibling
-- (a single recurring charge template, not a multi-line invoice builder —
-- matches how a real recurring charge, subscription or retainer fee, is
-- actually structured). RLS from day one, unlike recurring_bills, which
-- (along with the rest of the core AR/AP tables) only got it in migration
-- 296, discovered as groundwork for this very table.

CREATE TABLE recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(300),
  customer_id UUID,
  client_name VARCHAR(300),
  frequency VARCHAR(20) DEFAULT 'MONTHLY',
  currency VARCHAR(10) DEFAULT 'TZS',
  amount NUMERIC(15,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_code_id UUID,
  description TEXT,
  payment_terms VARCHAR(100),
  next_due DATE,
  end_date DATE,
  state VARCHAR(20) DEFAULT 'ACTIVE',
  invoices_generated INT DEFAULT 0,
  total_billed NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON recurring_invoices
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
