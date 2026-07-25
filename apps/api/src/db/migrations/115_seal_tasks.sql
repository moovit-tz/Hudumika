-- 115_seal_tasks.sql
-- Warehouse activity/task allocation — mirrors shipment_tasks
-- (008_shipment_tasks_time_entries.sql) and invoice_tasks
-- (051_invoice_notes_tasks.sql) exactly: same status/priority vocabulary,
-- same VARCHAR(255) assigned_to/created_by (not a hard FK to users — same
-- reasoning those two tables already established), same shape, so it slots
-- into tasks.routes.ts's real /linked aggregation as a third arm with zero
-- new plumbing. Deliberately its own table rather than reusing either of
-- the platform's two existing workflow engines (both confirmed unfit for
-- SEAL) or a generic cross-app "tasks" table (none exists).
CREATE TABLE seal_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compartment_id UUID REFERENCES seal_compartments(id) ON DELETE CASCADE,
  lot_id         UUID REFERENCES seal_lots(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'open',    -- open | in_progress | complete | blocked
  priority       VARCHAR(20) NOT NULL DEFAULT 'medium',  -- low | medium | high | urgent
  assigned_to    VARCHAR(255),
  due_date       DATE,
  note           TEXT,
  created_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_tasks_tenant ON seal_tasks(tenant_id);
CREATE INDEX idx_seal_tasks_compartment ON seal_tasks(compartment_id);
CREATE INDEX idx_seal_tasks_assigned ON seal_tasks(assigned_to);

ALTER TABLE seal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_tasks ON seal_tasks
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
