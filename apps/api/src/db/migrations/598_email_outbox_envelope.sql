-- 598_email_outbox_envelope.sql
-- Preserves the full delivery envelope on email_outbox rows so a retry
-- uses the original sender identity, BCC list, threading headers and
-- records the transport-assigned Message-ID.  Closes audit gap #4
-- ("a failed personal send may be retried through the workspace identity")
-- and enables delivery-log reconciliation (gap #3).

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS bcc_addresses        JSONB;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS user_id              UUID;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS from_identity_id     UUID;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS in_reply_to_message_id TEXT;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS references_ids       JSONB;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS message_id           TEXT;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS communication_delivery_id UUID;

-- Allow 'simulated' as a terminal status so simulated sends are never
-- retried and are clearly distinguishable from real deliveries.
-- (status CHECK was never defined — VARCHAR(20) — so no ALTER needed,
--  but document the expanded value set here for clarity.)
COMMENT ON COLUMN email_outbox.status IS 'pending | sending | sent | failed | simulated';
