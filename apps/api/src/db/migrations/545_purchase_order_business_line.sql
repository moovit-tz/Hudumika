ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS business_line_id UUID REFERENCES finance_business_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_business_line
  ON purchase_orders (tenant_id, business_line_id, order_date);
