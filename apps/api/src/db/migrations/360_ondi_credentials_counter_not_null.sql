-- passkey_counter backs WebAuthn's replay-attack check (verifyAuthenticationResponse
-- compares the authenticator's reported counter against this stored value on
-- every login) — a null counter would silently break that comparison. Every
-- real insert always provides one (security.routes.ts's registration
-- handler), so this only tightens the column to match what the app already
-- guarantees.
UPDATE ondi_credentials SET passkey_counter = 0 WHERE passkey_counter IS NULL;
ALTER TABLE ondi_credentials ALTER COLUMN passkey_counter SET DEFAULT 0;
ALTER TABLE ondi_credentials ALTER COLUMN passkey_counter SET NOT NULL;
