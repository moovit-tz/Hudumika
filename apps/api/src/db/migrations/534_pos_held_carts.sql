CREATE TABLE IF NOT EXISTS pos_held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  inventory_location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
  items JSONB NOT NULL,
  held_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  held_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_held_carts_tenant_date
  ON pos_held_carts (tenant_id, held_at DESC);

ALTER TABLE pos_held_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_held_carts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_held_carts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
