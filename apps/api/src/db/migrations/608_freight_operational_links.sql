ALTER TABLE vehicle_documents ADD COLUMN comply_certificate_id UUID REFERENCES comply_certificates(id) ON DELETE SET NULL;
ALTER TABLE warehouse_locations ADD COLUMN seal_compartment_id UUID REFERENCES seal_compartments(id) ON DELETE SET NULL;
CREATE TABLE parts_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts_stock(id) ON DELETE CASCADE,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX parts_stock_movements_part ON parts_stock_movements(tenant_id, part_id, created_at);
ALTER TABLE parts_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_parts_stock_movements ON parts_stock_movements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
