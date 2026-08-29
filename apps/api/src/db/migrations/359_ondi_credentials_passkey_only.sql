-- Correction to 358: TOTP already has a real, working home — `user_totp`
-- (140_workspace_admin_features.sql) + lib/totp.ts's own RFC 6238
-- implementation (base32, HOTP, otpauth:// URI, backup codes), backing the
-- existing Workspace ▸ Security 2FA feature. Ondi's TOTP login (M1) reuses
-- that table and library directly rather than a second copy, so
-- ondi_credentials narrows to what's actually new: WebAuthn passkeys (M2),
-- which have no existing table anywhere in this codebase.
ALTER TABLE ondi_credentials DROP CONSTRAINT IF EXISTS ondi_credentials_credential_type_check;
ALTER TABLE ondi_credentials
  DROP COLUMN IF EXISTS credential_type,
  DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE ondi_credentials ALTER COLUMN passkey_credential_id SET NOT NULL;
ALTER TABLE ondi_credentials ALTER COLUMN passkey_public_key SET NOT NULL;
