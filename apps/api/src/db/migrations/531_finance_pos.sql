CREATE TABLE IF NOT EXISTS pos_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opening_float NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  closing_cash NUMERIC(18,2),
  expected_cash NUMERIC(18,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_open_shift_user
  ON pos_shifts (tenant_id, opened_by) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_pos_shifts_tenant_date ON pos_shifts (tenant_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE RESTRICT,
  sale_number VARCHAR(40) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(300),
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
  currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
  subtotal NUMERIC(18,2) NOT NULL,
  discount_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(18,2) NOT NULL,
  amount_paid NUMERIC(18,2) NOT NULL,
  change_due NUMERIC(18,2) NOT NULL DEFAULT 0,
  inventory_location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  sold_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sale_number)
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_date ON pos_sales (tenant_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_shift ON pos_sales (tenant_id, shift_id);

CREATE TABLE IF NOT EXISTS pos_sale_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(300) NOT NULL,
  qty NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  discount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_lines_sale ON pos_sale_lines (tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS pos_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL CHECK (method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON pos_payments (tenant_id, sale_id);

ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_shifts USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_sales USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE pos_sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_sale_lines USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_payments USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
