-- 480_sms_opt_out_phone_normalization.sql
-- HUD-0125: sms_opt_outs.phone was compared with an exact string match
-- (integrations/sms.ts's sendSms()), so a number opted out as "+255700111222"
-- was NOT blocked when a later send targeted the same number as
-- "255700111222" or "0700111222" — live-reproduced: an opted-out number was
-- sent to (reaching a real outbound gateway call) whenever the format
-- differed even slightly. phone_normalized stores the same last-9-digits
-- form lib/phone.ts's normalizePhone() already uses for referral fraud
-- detection, so the compliance check can match regardless of how the number
-- was typed or how a STOP-reply's "from" field happened to be formatted by
-- the gateway. Not made UNIQUE — real pre-existing rows may already hold two
-- different-format entries for what is actually the same number, and this
-- migration must not fail on that dirty data; the app-level check only needs
-- to find at least one match, not exactly one.

ALTER TABLE sms_opt_outs ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(9);

UPDATE sms_opt_outs
SET phone_normalized = RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9)
WHERE phone_normalized IS NULL
  AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) >= 9;

CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_tenant_phone_normalized
  ON sms_opt_outs(tenant_id, phone_normalized);
