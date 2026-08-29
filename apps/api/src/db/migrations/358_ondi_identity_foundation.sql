-- Ondi M0: foundation for the real identity platform (phone-OTP/TOTP/passkey
-- login, trust scoring, tamper-evident audit trail) that will eventually
-- become this platform's SSO front door. See the approved migration plan for
-- the full program; this migration only lays down schema, nothing reads or
-- writes it yet.
--
-- Two deliberate deviations from the plan's original M0 sketch, found while
-- checking what already exists before adding anything new:
--   - No `ondi_devices` table. `hr_devices` (040_hr_teams_invites_audit.sql,
--     revoked_at added in 140_workspace_admin_features.sql) already models a
--     per-user trusted-device list with revocation that middleware/auth.ts
--     checks on every request. M2 (WebAuthn passkeys) needs new columns
--     eventually, but that's an ALTER when the real fields are known, not a
--     parallel table meaning the same thing.
--   - No `ondi_otp_codes` / `ondi_auth_sessions` tables. The plan's own
--     cross-cutting decision is to reuse the platform's existing Redis
--     connection for OTP/challenge ephemeral storage (short TTL, no
--     retention value) — a Postgres table for that would contradict the
--     decision that put it in Redis in the first place. Sessions are already
--     the JWT + hr_devices pair; nothing new is needed until a milestone
--     defines a concrete field neither of those covers.

-- ── users: identity/verification state ─────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ondi_handle TEXT,
  ADD COLUMN IF NOT EXISTS verification_level TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_level IN ('unverified', 'phone_verified', 'id_verified', 'enhanced')),
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started', 'pending', 'approved', 'rejected'));

-- Global, not per-tenant like email — a handle is meant to be a portable
-- identity, not scoped to one tenant's membership.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ondi_handle ON users(ondi_handle) WHERE ondi_handle IS NOT NULL;

-- ── ondi_credentials: TOTP secrets + WebAuthn passkeys ──────────────────────
-- One table, discriminated by credential_type, because both are "a second
-- factor/authenticator a user registered" with the same lifecycle (add,
-- rename, use, remove) even though their stored material differs.
CREATE TABLE IF NOT EXISTS ondi_credentials (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_type        TEXT NOT NULL CHECK (credential_type IN ('totp', 'passkey')),
  label                  TEXT NOT NULL,
  -- TOTP
  totp_secret            TEXT,
  -- WebAuthn passkey
  passkey_credential_id  TEXT,
  passkey_public_key     TEXT,
  passkey_counter        BIGINT,
  passkey_transports     TEXT,
  last_used_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (passkey_credential_id)
);
CREATE INDEX IF NOT EXISTS idx_ondi_credentials_user ON ondi_credentials(tenant_id, user_id);

ALTER TABLE ondi_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_credentials FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_credentials'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_credentials
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- ── ondi_auth_events: tamper-evident audit trail ────────────────────────────
-- SHA-256 hash chain, scoped per tenant: each new row's event_hash covers
-- (prev_hash, event_type, user_id, created_at, metadata), and prev_hash is
-- that tenant's most recent event_hash — so altering or deleting a past row
-- breaks every hash after it. Nothing writes here yet (M1 starts populating
-- login events; M3 adds the scoring/verification logic that reads the
-- chain) — the schema is stable regardless of which milestone starts using
-- it, and starting the chain from real login history in M1 rather than
-- backfilling it later in M3 is the point of laying it down now.
CREATE TABLE IF NOT EXISTS ondi_auth_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash    TEXT,
  event_hash   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_auth_events_user ON ondi_auth_events(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ondi_auth_events_tenant_created ON ondi_auth_events(tenant_id, created_at DESC);

ALTER TABLE ondi_auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_auth_events FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_auth_events'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_auth_events
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
