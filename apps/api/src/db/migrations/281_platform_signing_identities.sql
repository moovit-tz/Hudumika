-- Migration 281: Real (CA-issued) platform document-signing certificates.
--
-- pdf-signing-identity.service.ts's own self-signed cert (generated once,
-- cached on disk) stays the honest default — this table is the SuperAdmin
-- connection point for replacing it with a real, purchased, CA-issued
-- certificate once one exists. Not tenant-scoped: one signing identity
-- serves the whole platform's Sign app, the same way the self-signed
-- fallback already does — RLS/tenant_id has no role here.
--
-- encrypted_p12 reuses onsite-secrets.service.ts's existing AES-256-GCM
-- encryptJson()/decryptJson() (ONSITE_SECRETS_KEY) rather than a new crypto
-- wrapper — it already handles an arbitrary JSON payload (here:
-- { p12Base64, password }), and a few-KB PKCS#12 blob is well within what
-- AES-GCM handles with no practical size ceiling.
--
-- History is kept, not deleted, on deactivation/replacement — a real audit
-- trail of what the platform has actually signed documents with over time.

CREATE TABLE IF NOT EXISTS platform_signing_identities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT NOT NULL,
  encrypted_p12  TEXT NOT NULL,
  subject        TEXT NOT NULL,
  issuer         TEXT NOT NULL,
  is_self_signed BOOLEAN NOT NULL,
  not_before     TIMESTAMPTZ NOT NULL,
  not_after      TIMESTAMPTZ NOT NULL,
  verified_at    TIMESTAMPTZ,
  enabled        BOOLEAN NOT NULL DEFAULT false,
  uploaded_by    UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active identity platform-wide at any time.
CREATE UNIQUE INDEX IF NOT EXISTS platform_signing_identities_one_enabled
  ON platform_signing_identities (enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS platform_signing_identities_created_idx ON platform_signing_identities(created_at DESC);
