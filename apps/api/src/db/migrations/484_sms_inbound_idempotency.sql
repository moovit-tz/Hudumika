-- 484_sms_inbound_idempotency.sql
-- registerInboundRoutes' sms_opt_outs insert already had a real
-- onConflict(['tenant_id','phone']).doNothing() guard, but the
-- sms_inbound_messages insert right above it had none — a provider's
-- standard at-least-once webhook redelivery (both Twilio and Africa's
-- Talking retry on a timeout) would log the same inbound reply two or
-- three times. Twilio's inbound webhook carries a real MessageSid; a
-- partial unique index lets the route dedup on it directly. Africa's
-- Talking's own inbound-webhook id field isn't something this session has
-- a verified reference for, so this column stays nullable and optional —
-- a row with no provider id falls back to the route's own short-window
-- (tenant_id, from_number, body) heuristic instead, not this constraint.
ALTER TABLE sms_inbound_messages ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_inbound_provider_msg
  ON sms_inbound_messages (tenant_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
