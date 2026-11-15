-- Align live SMS providers with the API and add an atomic outbox claim state.
ALTER TABLE sms_gateways DROP CONSTRAINT IF EXISTS sms_gateways_provider_check;
ALTER TABLE sms_gateways ADD CONSTRAINT sms_gateways_provider_check
  CHECK (provider IN ('africas_talking', 'twilio', 'nexmo', 'bongolive', 'beem'));

ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_status_check;
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_status_check
  CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'undelivered'));
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES sms_gateways(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_processing ON sms_messages(processing_at)
  WHERE status = 'processing';
