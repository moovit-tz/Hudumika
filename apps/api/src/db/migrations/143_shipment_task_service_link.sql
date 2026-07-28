-- Migration 143: Link shipment tasks & time entries to the Products & Services
-- catalog (052_products.sql), so clearing/freight services with real rates can
-- be tagged onto a task or a logged timesheet entry.
--
-- Pricing fields are snapshotted (not live-joined) for the same reason invoice
-- line items already snapshot name/rate rather than re-reading the product
-- row: a task logged against "Customs Clearance" at $350 should still read
-- $350 a year from now even if that service's price or name changes later,
-- and should survive the product itself being deleted (ON DELETE SET NULL
-- clears product_id but leaves the snapshot intact).

ALTER TABLE shipment_tasks
  ADD COLUMN IF NOT EXISTS product_id        VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS service_rate      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS service_currency  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS service_unit      VARCHAR(50);

ALTER TABLE shipment_time_entries
  ADD COLUMN IF NOT EXISTS product_id        VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS service_rate      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS service_currency  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS service_unit      VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_shipment_tasks_product ON shipment_tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_shipment_time_entries_product ON shipment_time_entries(product_id);
