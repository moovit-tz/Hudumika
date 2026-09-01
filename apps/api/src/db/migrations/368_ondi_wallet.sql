-- Ondi M3 (house-style expansion): the Personal ▸ Wallet page — a small,
-- honest credential vault for a user's OWN logins/notes/API keys they want
-- to keep somewhere safer than a sticky note. Deliberately not the "E2E-
-- encrypted password vault" the original ondi-mvp branch envisioned (that
-- was explicitly deferred when this platform's own Ondi build started) —
-- this encrypts the secret value at rest using the platform's existing
-- AES-256-GCM service (onsite-secrets.service.ts, same scheme
-- platform-signing-cert.service.ts already relies on), keyed by a server-
-- side key, not a client-held one. Real encryption, modest threat model:
-- protects against a raw DB dump, not against this app's own backend.
--
-- Distinct from ondi_credentials (358_ondi_identity_foundation.sql), which
-- is TOTP secrets/passkeys this platform's OWN login flow verifies — this
-- table is arbitrary third-party secrets the user is just storing for
-- themselves; nothing here is ever read by Ondi's own auth code.
CREATE TABLE IF NOT EXISTS ondi_wallet_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  username      TEXT,
  url           TEXT,
  -- encryptSecret() output: "<iv_hex>:<authTag_hex>:<cipher_hex>". Never
  -- selected by the list endpoint — only the single-item "reveal" route
  -- decrypts it, and every reveal is written to ondi_auth_events.
  secret_cipher TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_wallet_items_user ON ondi_wallet_items(tenant_id, user_id);

ALTER TABLE ondi_wallet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_wallet_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_wallet_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_wallet_items
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
