-- Sign M4: optional SMS one-time-passcode gate before a recipient can sign.
-- The honest, buildable middle ground for "identity verification" — this
-- codebase has no account with a real government-ID/KBA vendor (DocuSign's
-- actual mechanism there), but SmsIntegration is real, so a real OTP is.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS require_otp BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS otp_code_hash TEXT;
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ;
