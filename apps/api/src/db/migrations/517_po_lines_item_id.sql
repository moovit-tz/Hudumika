-- 517_po_lines_item_id.sql
-- Wire purchase_order_lines to inventory_items so that confirming a PO
-- receipt can post a real stock movement and GL entry (DR 1300 Inventory /
-- CR 2050 GRNI), closing the gap documented in inventory.service.ts's own
-- header comment. Both new columns are nullable: a PO line for a service,
-- freight charge, or non-stocked item has no inventory item and simply
-- skips the movement — the column is only meaningful on lines the user
-- links to a tracked item at order entry time.
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS item_id   UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_uom  VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_pol_item ON purchase_order_lines(item_id) WHERE item_id IS NOT NULL;
