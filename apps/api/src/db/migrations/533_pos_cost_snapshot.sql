ALTER TABLE pos_sale_lines
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;

UPDATE pos_sale_lines AS line
SET unit_cost = item.avg_cost,
    cost_total = ROUND((line.qty * item.avg_cost)::numeric, 2)
FROM inventory_items AS item
WHERE item.tenant_id = line.tenant_id
  AND item.product_id = line.product_id
  AND line.cost_total = 0;

CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_status_date
  ON pos_sales (tenant_id, status, sold_at DESC);
