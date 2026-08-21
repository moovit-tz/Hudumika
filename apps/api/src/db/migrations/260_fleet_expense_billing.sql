-- Fleet expense → customer invoice bridge. Confirmed missing by direct
-- research: ClearOS already bridges shipment `expenses` (is_revenue=true)
-- into sales_invoices (finance.routes.ts POST /:id/invoice/finalise), and
-- SEAL already bridges bonded-storage accrual into sales_invoices
-- (seal-billing.service.ts generateStorageInvoice) — HuduFreight had no
-- equivalent path at all. vehicle_expenses (059_vehicle_detail.sql) has no
-- billable flag, no trip link, and nothing marking it invoiced.
--
-- trip_id is optional: a fleet expense can be logged against a vehicle with
-- no trip context (e.g. a routine wash), which is never customer-billable
-- by definition — only a trip carries the optional customer_id
-- (055_fleet_operations.sql) a billable expense needs to actually invoice
-- against.
ALTER TABLE vehicle_expenses ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE SET NULL;
ALTER TABLE vehicle_expenses ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT false;
-- Real FK, not a soft link — sales_invoices has a plain single-column UUID
-- PK (013_invoices_bills_settings.sql), not partitioned, so unlike
-- shipment_cases there's no reason to avoid a real FK here. Doubles as the
-- "already invoiced, don't bill again" watermark.
ALTER TABLE vehicle_expenses ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_trip ON vehicle_expenses(trip_id) WHERE trip_id IS NOT NULL;
