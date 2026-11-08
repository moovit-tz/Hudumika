-- Genuine multi-currency-per-outlet checkout (the last real piece of
-- Phase 3's "multi-country configuration and supported currency
-- handling"): every product today has exactly ONE fixed price and
-- currency (products.sale_price/currency) — no existing mechanism let an
-- outlet in a different country sell the same catalog item in its own
-- currency. Mirrors the existing customer_product_prices table (a
-- per-customer price+currency override) exactly, at a different scope:
-- per-outlet instead of per-customer. Nullable/additive — a tenant with
-- no overrides keeps selling every product at its one base price/currency,
-- exactly as before.

CREATE TABLE pos_site_product_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  product_id  VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price       NUMERIC(18,2) NOT NULL CHECK (price >= 0),
  currency    VARCHAR(10) NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, product_id)
);

ALTER TABLE pos_site_product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_site_product_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_site_product_prices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
