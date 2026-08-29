-- Ondi M6: full OAuth 2.0 / OpenID Connect provider.
--
-- ondi_oidc_signing_keys and ondi_oauth_clients are platform-global (one
-- issuer, one client registry for the whole platform), not tenant-scoped —
-- same shape as platform_signing_identities (migration 281), accessed only
-- via dbPlatform, no RLS. ondi_oauth_consents IS naturally tenant-scoped
-- (a user's consent belongs to their tenant) and gets the usual RLS.

CREATE TABLE IF NOT EXISTS ondi_oidc_signing_keys (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid                    TEXT NOT NULL UNIQUE,
  public_key_pem         TEXT NOT NULL,
  -- Encrypted the same way platform-signing-cert.service.ts encrypts its own
  -- P12 bundle — onsite-secrets.service.ts's AES-256-GCM, not a new scheme.
  encrypted_private_key  TEXT NOT NULL,
  algorithm              TEXT NOT NULL DEFAULT 'RS256',
  enabled                BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ondi_oauth_clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT NOT NULL UNIQUE,
  -- NULL for a public client (SPA/native using PKCE) — every first-party
  -- client seeded below is public, matching how a browser-based app can't
  -- keep a secret confidential anyway.
  client_secret_hash  TEXT,
  name                TEXT NOT NULL,
  logo_url            TEXT,
  redirect_uris       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- First-party clients skip the consent screen (see ondi-oauth.routes.ts's
  -- /authorize/info) — this platform's own apps, not a blanket bypass for
  -- anyone who registers a client.
  first_party         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ondi_oauth_consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES ondi_oauth_clients(client_id) ON DELETE CASCADE,
  scopes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_ondi_oauth_consents_user ON ondi_oauth_consents(tenant_id, user_id);

ALTER TABLE ondi_oauth_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_oauth_consents FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_oauth_consents'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_oauth_consents
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- First-party clients — real evidence this integration was always intended:
-- these are this platform's own apps, named directly rather than a demo
-- placeholder. Redirect URIs point at a generic same-origin callback path
-- (/oauth/callback) since every one of these apps already lives behind the
-- same Vite dev origin / production domain as Ondi itself today.
INSERT INTO ondi_oauth_clients (client_id, name, redirect_uris, first_party) VALUES
  ('hudumika-clearos',    'ClearOS',    '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-seal',       'SEAL',       '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-bliss',      'Bliss',      '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-workspace',  'Workspace',  '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-complyos',   'ComplyOS',   '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-finops',     'FinOps',     '["http://localhost:5173/oauth/callback"]'::jsonb, true),
  ('hudumika-hudufreight','HuduFreight','["http://localhost:5173/oauth/callback"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
