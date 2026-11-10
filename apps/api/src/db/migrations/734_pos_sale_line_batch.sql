-- Migration 734: records which batch a POS sale line was actually sold
-- from, closing the return-side half of S07's batch/expiry gap (migration
-- 719's own "Next action": "the RETURN/restock side ... needs a schema
-- addition first — pos_sale_lines doesn't record which batch a line was
-- originally sold from, so a return has no correct batch to restock into
-- without guessing"). NULL for a non-batch-tracked item's line, same as
-- every other optional column on this table.
ALTER TABLE pos_sale_lines ADD COLUMN IF NOT EXISTS batch_no TEXT;
