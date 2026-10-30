-- Fix ESB financial invariants identified during commercial-plan audit.
--
-- Bug 3: Unique partial index on gateway_tx_ref for top-up postings.
-- Prevents the TOCTOU race where two concurrent webhook callbacks for the
-- same payment reference both pass the SELECT-then-INSERT idempotency
-- check and create duplicate top-ups.
CREATE UNIQUE INDEX IF NOT EXISTS idx_esb_postings_topup_txref
  ON esb_postings (tenant_id, gateway_tx_ref)
  WHERE posting_type = 'top_up' AND gateway_tx_ref IS NOT NULL;

-- Bug 2: Add a refund_operation_id column so every refund links to the
-- operation it corrects.  Allows capping the refundable amount at the
-- operation's actual_amount and produces an auditable refund chain.
ALTER TABLE esb_postings
  ADD COLUMN IF NOT EXISTS refund_operation_id UUID REFERENCES esb_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_esb_postings_refund_op
  ON esb_postings (refund_operation_id)
  WHERE refund_operation_id IS NOT NULL;

-- RLS already covers these tables (migration 636).
