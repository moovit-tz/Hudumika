-- Fixes two real bugs found by a fresh run of pos-lifecycle-audit.test.ts
-- (part of giving POS its own standalone identity — Phase 2's "one real
-- end-to-end sale and return, no duplicate effects" exit criterion):
--
-- 1. inventory_movements' own CHECK constraint (migration 123) never
--    allowed 'return', even though InventoryService.recordMovement's real
--    TypeScript type and switch/case logic have supported it since day one
--    (migration 123's own header file, service lines ~155/239). Every POS
--    refund that tried to restock tracked inventory has been failing with
--    a 400 (23514 constraint violation) in production, silently — the
--    refund route's catch-all just reported "Validation failed".
--
-- 2. POS checkout needs idempotent-retry support (a client that times out
--    and retries a checkout must not create two sales, two journal
--    entries, and two stock issues for one physical transaction) — no
--    column existed to key that on.

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('receipt','issue','return','transfer','adjust','count_correction'));

ALTER TABLE pos_sales ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX pos_sales_idempotency_key_idx
  ON pos_sales (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
