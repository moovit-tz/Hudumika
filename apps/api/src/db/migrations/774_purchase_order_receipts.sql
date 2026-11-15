CREATE TABLE purchase_order_receipts (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resulting_status TEXT NOT NULL,
  movements_posted INTEGER NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, po_id, request_key)
);

ALTER TABLE purchase_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON purchase_order_receipts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
