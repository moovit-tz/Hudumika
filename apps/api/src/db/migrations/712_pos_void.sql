-- Phase 3's "returns, and approvals": pos_sales.status has allowed
-- 'VOIDED' since migration 531, but no route has ever set it — the status
-- enum promised a distinct "this sale should never have counted" outcome
-- (same shift, a mis-rung sale, correctable before close) separate from
-- REFUNDED (customer genuinely returning goods after the fact), and never
-- delivered it. Mirrors the refunded_at/refunded_by/refund_reason columns
-- exactly, kept separate rather than reused, so a sale's history reads
-- unambiguously as one or the other.
ALTER TABLE pos_sales ADD COLUMN voided_at TIMESTAMPTZ;
ALTER TABLE pos_sales ADD COLUMN voided_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pos_sales ADD COLUMN void_reason TEXT;
