-- 119_seal_fulfillment.sql
-- Increment 11b: outbound fulfillment (pick/pack/ship) — a genuinely new
-- domain for SEAL. Previously the only outbound concept was a customs
-- status transition recorded as a bare movement; this adds real
-- orchestration around it: a fulfillment order groups one or more lot
-- lines, tracks partial picking against each, and confirms packing before
-- dispatch. Physical pick quantity is deducted via the existing
-- seal_movements ledger (SealService.recordMovement, movement_type='pick')
-- — never a second, parallel qty count — so stock-account and lot history
-- stay the single source of truth. Customs-status transitions remain
-- entirely separate (the existing action buttons on a lot's detail page);
-- this feature is the physical logistics workflow, not a new fiscal one.
CREATE TABLE seal_fulfillment_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id  UUID NOT NULL REFERENCES seal_compartments(id) ON DELETE RESTRICT,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reference       VARCHAR(50) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'picking', 'picked', 'packed', 'dispatched', 'cancelled')),
  -- Real cross-app link to Tracking/HuduFreight's own vehicle registry —
  -- "which truck this left on" — no route-planning logic duplicated here.
  vehicle_id      UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  carrier_note    TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  packed_at       TIMESTAMPTZ,
  dispatched_at   TIMESTAMPTZ,
  UNIQUE (tenant_id, reference)
);
CREATE INDEX idx_seal_fulfillment_orders_tenant ON seal_fulfillment_orders(tenant_id);
CREATE INDEX idx_seal_fulfillment_orders_compartment ON seal_fulfillment_orders(compartment_id, status);

ALTER TABLE seal_fulfillment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_fulfillment_orders ON seal_fulfillment_orders
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE seal_fulfillment_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES seal_fulfillment_orders(id) ON DELETE CASCADE,
  lot_id          UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  requested_qty   NUMERIC(18,4) NOT NULL,
  picked_qty      NUMERIC(18,4) NOT NULL DEFAULT 0,
  packed          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_fulfillment_lines_tenant ON seal_fulfillment_lines(tenant_id);
CREATE INDEX idx_seal_fulfillment_lines_order ON seal_fulfillment_lines(order_id);
CREATE INDEX idx_seal_fulfillment_lines_lot ON seal_fulfillment_lines(lot_id);

ALTER TABLE seal_fulfillment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_fulfillment_lines ON seal_fulfillment_lines
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
