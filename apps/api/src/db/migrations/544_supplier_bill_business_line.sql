ALTER TABLE supplier_bills
  ADD COLUMN IF NOT EXISTS business_line_id UUID REFERENCES finance_business_lines(id) ON DELETE SET NULL;

ALTER TABLE recurring_bills
  ADD COLUMN IF NOT EXISTS business_line_id UUID REFERENCES finance_business_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_bills_tenant_business_line
  ON supplier_bills (tenant_id, business_line_id, bill_date);

CREATE INDEX IF NOT EXISTS idx_recurring_bills_tenant_business_line
  ON recurring_bills (tenant_id, business_line_id);
