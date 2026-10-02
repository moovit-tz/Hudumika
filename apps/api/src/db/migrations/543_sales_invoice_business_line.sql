ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS business_line_id UUID REFERENCES finance_business_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_business_line
  ON sales_invoices (tenant_id, business_line_id, bill_date DESC)
  WHERE business_line_id IS NOT NULL;
