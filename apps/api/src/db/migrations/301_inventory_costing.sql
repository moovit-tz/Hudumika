-- 301_inventory_costing.sql
-- Inventory was a real, honest quantity ledger with no cost basis at all —
-- confirmed via schema review, inventory_movements and
-- inventory_stock_levels carry no unit_cost/avg_cost anywhere. Weighted-
-- average, not FIFO lot-layers (a materially larger sub-project) — tracked
-- per item (inventory_items.avg_cost), not per location/batch, matching
-- how most SMB accounting tools apply weighted-average: one running cost
-- per item, recomputed on each receipt, unchanged by an issue.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(15,4) NOT NULL DEFAULT 0;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2);

-- Cost of Goods Sold — 1300 Inventory already exists (seeded, previously
-- unused for costing); this is the debit-expense side an issue posts to.
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5010', 'Cost of Goods Sold', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
