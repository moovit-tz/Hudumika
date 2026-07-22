-- Purchase orders: persist warehouse and payment-terms selections that the
-- frontend form already collects but the original schema had no column for.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(100);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(300);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);
