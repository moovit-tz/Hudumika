-- 125_inventory_tasks.sql
-- Inventory Control Phase 5 — real task allocation (e.g. "restock this
-- item"), mirroring shipment_tasks/invoice_tasks/seal_tasks exactly: same
-- status/priority vocabulary, same VARCHAR(255) assigned_to/created_by
-- (not a hard FK to users — same reasoning those tables already
-- established), so it slots into tasks.routes.ts's real /linked
-- aggregation as a fourth arm with zero new plumbing.
CREATE TABLE inventory_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id     UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES inventory_warehouses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'open',    -- open | in_progress | complete | blocked
  priority    VARCHAR(20) NOT NULL DEFAULT 'medium',  -- low | medium | high | urgent
  assigned_to VARCHAR(255),
  due_date    DATE,
  note        TEXT,
  created_by  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_tasks_tenant ON inventory_tasks(tenant_id);
CREATE INDEX idx_inventory_tasks_item ON inventory_tasks(item_id);
CREATE INDEX idx_inventory_tasks_assigned ON inventory_tasks(assigned_to);

ALTER TABLE inventory_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_tasks ON inventory_tasks
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
