-- Migration 703: Petti deposits need a real pending/confirmed/failed state
-- (LENS-44). Both mobile-money adapters (VodacomMpesaAdapter,
-- AirtelMoneyAdapter in petti.service.ts) currently treat the provider's
-- "request accepted" response as final and post to the GL immediately —
-- but both providers are actually asynchronous: the customer still has to
-- approve a USSD/PIN prompt afterward. A declined or timed-out prompt would
-- leave a deposit posted to the GL that never actually landed as real
-- money. This migration adds the state column the service layer now uses
-- to stop doing that.

ALTER TABLE petti_deposits ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'confirmed';
-- manual deposits and every pre-existing row are already-settled money by
-- definition (a human recorded funds that had already arrived, or the row
-- predates this column) — 'confirmed' is the correct default, not a
-- placeholder. Only new gateway-initiated deposits are ever inserted as
-- 'pending' going forward.
ALTER TABLE petti_deposits ADD CONSTRAINT petti_deposits_status_check
  CHECK (status IN ('pending', 'confirmed', 'failed'));

-- journal_entry_id must be nullable for a pending gateway deposit (no GL
-- entry exists yet) — already nullable (ON DELETE SET NULL), no change
-- needed there.

ALTER TABLE petti_deposits ADD COLUMN IF NOT EXISTS reconciled_by UUID;
ALTER TABLE petti_deposits ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_petti_deposits_pending
  ON petti_deposits (tenant_id, status) WHERE status = 'pending';
