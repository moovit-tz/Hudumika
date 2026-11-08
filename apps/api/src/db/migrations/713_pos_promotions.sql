-- Phase 3's last item from "Complete shifts, cash operations, promotions,
-- returns, and approvals": zero promotions/price-rule infrastructure
-- existed anywhere in this codebase (checked by grep across routes/
-- services/migrations before writing this). Checkout only ever supported
-- a manual, cashier-typed per-line discount — no scheduled, automatic,
-- or outlet-scoped discount was possible.
--
-- site_id doubles as this feature's "central template vs local override":
-- NULL applies tenant-wide (the central template); a real tenant_sites row
-- scopes it to one outlet, which wins over a tenant-wide promotion for the
-- same product when both are active (see pos.routes.ts's own resolution
-- order, resolvePromotion()).

CREATE TABLE pos_promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- Exactly one of these two scopes a promotion to what it discounts —
  -- product_id is more specific and wins over a category match (see the
  -- CHECK below and the route's own resolution order).
  product_id      VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
  category        TEXT,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value  NUMERIC(18,4) NOT NULL CHECK (discount_value > 0),
  site_id         UUID REFERENCES tenant_sites(id) ON DELETE CASCADE,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (product_id IS NOT NULL AND category IS NULL) OR
    (product_id IS NULL AND category IS NOT NULL)
  ),
  CHECK (discount_type != 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_pos_promotions_product ON pos_promotions (tenant_id, product_id) WHERE product_id IS NOT NULL AND active;
CREATE INDEX idx_pos_promotions_category ON pos_promotions (tenant_id, category) WHERE category IS NOT NULL AND active;

ALTER TABLE pos_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_promotions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
