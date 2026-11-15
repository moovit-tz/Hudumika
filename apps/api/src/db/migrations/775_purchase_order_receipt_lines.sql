CREATE TABLE purchase_order_receipt_lines (
  tenant_id UUID NOT NULL,
  po_id UUID NOT NULL,
  request_key TEXT NOT NULL,
  po_line_id UUID NOT NULL,
  description TEXT NOT NULL,
  received_qty NUMERIC(10,2) NOT NULL CHECK (received_qty > 0),
  movement_id BIGINT,
  PRIMARY KEY (tenant_id, po_id, request_key, po_line_id),
  FOREIGN KEY (tenant_id, po_id, request_key)
    REFERENCES purchase_order_receipts(tenant_id, po_id, request_key) ON DELETE CASCADE,
  FOREIGN KEY (movement_id) REFERENCES inventory_movements(id) ON DELETE SET NULL
);

ALTER TABLE purchase_order_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_receipt_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON purchase_order_receipt_lines
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
