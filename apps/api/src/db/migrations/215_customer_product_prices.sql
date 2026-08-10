-- 215_customer_product_prices.sql
-- Customer-specific (contract) pricing.
--
-- A clearing/freight business rarely bills every customer the catalog price:
-- a contract customer may have negotiated a lower (or higher) rate for a given
-- service. This table holds those per-customer overrides. When a customer is
-- selected on an invoice / quotation / purchase order line and that customer
-- has an agreed price for the chosen product, THAT price is what triggers;
-- otherwise the catalog `products.sale_price` stands.
--
-- One agreed price per (tenant, customer, product) — a customer does not have
-- two contract prices for the same service at once. tenant_id is on the row
-- and RLS-guarded like every other table; the FKs cascade so a deleted
-- customer or product takes its overrides with it.

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cpp_tenant_product  ON customer_product_prices(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cpp_tenant_customer ON customer_product_prices(tenant_id, customer_id);

ALTER TABLE customer_product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_customer_product_prices ON customer_product_prices;
CREATE POLICY tenant_isolation_customer_product_prices ON customer_product_prices
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
