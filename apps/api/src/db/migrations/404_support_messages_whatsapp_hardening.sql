-- WhatsApp inbound webhook hardening for Bliss support tickets:
--   1. delivery_status tracks Meta's outbound delivery/read/failed receipts
--      (the `statuses` array on the same webhook), correlated back to the
--      OUTBOUND row that recorded Meta's message id in external_ref
--      (messaging.service.ts already sets this on every WhatsApp send —
--      nothing to backfill, this column was just never written to).
--   2. A partial unique index on (channel, external_ref) makes webhook
--      redelivery (Meta retries at-least-once) a real no-op via
--      ON CONFLICT DO NOTHING instead of only a best-effort pre-check,
--      which a concurrent redelivery could still race past.
ALTER TABLE support_messages ADD COLUMN delivery_status VARCHAR(20);

CREATE UNIQUE INDEX idx_support_messages_channel_external_ref
  ON support_messages(channel, external_ref)
  WHERE external_ref IS NOT NULL;
