-- Store device credentials as one-way hashes, make event retries idempotent,
-- and retain the local clock value + timezone used to interpret a punch.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE attendance_devices
  ADD COLUMN IF NOT EXISTS push_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);

UPDATE attendance_devices
SET push_token_hash = encode(digest(push_token, 'sha256'), 'hex')
WHERE push_token_hash IS NULL AND push_token IS NOT NULL;

ALTER TABLE attendance_devices ALTER COLUMN push_token DROP NOT NULL;
UPDATE attendance_devices SET push_token = NULL WHERE push_token_hash IS NOT NULL;

ALTER TABLE attendance_device_events
  ADD COLUMN IF NOT EXISTS source_local_time VARCHAR(40),
  ADD COLUMN IF NOT EXISTS device_timezone VARCHAR(100);

-- Existing duplicate rows were checked before authoring this index. A device
-- resend of the same PIN/time/status is one event, even when two requests race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_device_event_fingerprint
  ON attendance_device_events (
    tenant_id, device_id, external_pin, punched_at, (COALESCE(raw_status, ''))
  );

CREATE INDEX IF NOT EXISTS idx_attendance_device_events_tenant_user_time
  ON attendance_device_events (tenant_id, user_id, punched_at)
  WHERE user_id IS NOT NULL;
