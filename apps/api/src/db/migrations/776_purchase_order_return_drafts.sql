CREATE TABLE purchase_order_returns (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receipt_movement_id BIGINT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX purchase_order_returns_order_idx ON purchase_order_returns(tenant_id, po_id, receipt_movement_id);

ALTER TABLE purchase_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON purchase_order_returns
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
