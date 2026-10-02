CREATE TABLE IF NOT EXISTS pos_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  reason VARCHAR(500) NOT NULL,
  recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_shift
  ON pos_cash_movements (tenant_id, shift_id, recorded_at DESC);

ALTER TABLE pos_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_cash_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON pos_cash_movements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
