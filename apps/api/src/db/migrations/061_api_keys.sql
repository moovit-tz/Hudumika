-- Migration 061: Partner/programmatic API access — keys + usage tracking
--
-- api_keys stores only a SHA-256 hash of the actual key (high-entropy random
-- token, not a user password — fast hashing is standard practice here,
-- unlike bcrypt/argon2 for passwords). The plaintext key is shown to the
-- user exactly once at creation time and never stored or retrievable again.
--
-- scopes is a JSON array of FeatureKey strings (packages/types/src/entitlements.ts)
-- and is validated against the tenant's package entitlements at issuance time,
-- so a key can never be scoped to a feature the tenant's plan doesn't include.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  key_prefix   VARCHAR(20) NOT NULL UNIQUE,
  key_hash     VARCHAR(255) NOT NULL,
  scopes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  acting_role  VARCHAR(50) NOT NULL,
  created_by   UUID,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS api_usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  api_key_id  UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  method      VARCHAR(10) NOT NULL,
  path        VARCHAR(500) NOT NULL,
  status_code INT NOT NULL,
  duration_ms INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_time ON api_usage_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage_events(api_key_id);
