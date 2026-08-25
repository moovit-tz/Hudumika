-- Migration 326: M15 of the standalone Projects app — real "Invoice
-- Project" billing. Mirrors fleetOps.routes.ts's POST /trips/:id/bill-
-- expenses EXACTLY in shape (Draft sales_invoices row + lines from billable
-- child rows, NO GL posting in this call — that stays inside the existing
-- POST /v1/invoices finalize flow, not duplicated here) with real
-- double-billing guards:
--   - hourly billing: task_time_entries.invoice_id, stamped on bill and
--     filtered IS NULL on the next attempt (same shape as
--     vehicle_expenses.invoice_id, migration 260).
--   - fixed-rate billing: projects.invoiced_at, since a flat-rate project
--     has no per-row source to stamp — a second "Invoice Project" click on
--     an already-invoiced fixed-rate project is blocked by this timestamp
--     being non-null, not by re-deriving state some other way.

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_project ON sales_invoices(project_id) WHERE project_id IS NOT NULL;

ALTER TABLE task_time_entries ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
