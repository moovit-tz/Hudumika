-- 124_inventory_stock_counts.sql
-- Inventory Control Phase 4: stock counts / cycle counts. expected_qty is
-- snapshotted from inventory_stock_levels at session start and never
-- recomputed afterward — the same "reconcile from the ledger, no silent
-- overwrite" discipline SEAL's stock-account periods already established.
-- Posting a session inserts a real count_correction movement (via
-- InventoryService.recordMovement) for every line whose counted_qty
-- differs from its expected_qty; direct edits to inventory_stock_levels
-- outside that path are never permitted.

CREATE TABLE inventory_count_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES inventory_warehouses(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','posted','cancelled')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at    TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  notes        TEXT
);
CREATE INDEX idx_inventory_count_sessions_tenant ON inventory_count_sessions(tenant_id);
CREATE INDEX idx_inventory_count_sessions_warehouse ON inventory_count_sessions(warehouse_id, status);

ALTER TABLE inventory_count_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_count_sessions ON inventory_count_sessions
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE inventory_count_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES inventory_count_sessions(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  location_id  UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  batch_no     VARCHAR(100) NOT NULL DEFAULT '',
  expected_qty NUMERIC(18,4) NOT NULL,
  counted_qty  NUMERIC(18,4),
  counted_at   TIMESTAMPTZ,
  counted_by   UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_inventory_count_lines_tenant ON inventory_count_lines(tenant_id);
CREATE INDEX idx_inventory_count_lines_session ON inventory_count_lines(session_id);

ALTER TABLE inventory_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_count_lines ON inventory_count_lines
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
