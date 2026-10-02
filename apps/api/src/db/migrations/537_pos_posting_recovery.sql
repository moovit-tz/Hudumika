ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_status_check;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_status_check
  CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED', 'POSTING_FAILED'));

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS posting_error TEXT,
  ADD COLUMN IF NOT EXISTS posting_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_posting_attempt_at TIMESTAMPTZ;
