ALTER TABLE purchase_order_returns
  ADD COLUMN posted_at TIMESTAMPTZ,
  ADD COLUMN posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN stock_movement_id BIGINT REFERENCES inventory_movements(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('receipt','issue','return','supplier_return','transfer','adjust','count_correction'));
