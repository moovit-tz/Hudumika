-- Pulse social publishing: connected pages/profiles, and posts sent to them.
--
-- Each workspace connects its own Facebook Pages, Instagram business
-- accounts, LinkedIn company pages and X profiles through the platform's
-- developer app for that network (server env credentials). Tokens are stored
-- encrypted (onsite-secrets.service.ts encryptSecret) and never returned to
-- the browser.
--
-- One post can go to several accounts; pulse_social_post_targets holds each
-- account's own outcome, its id on the network and the latest numbers
-- fetched from the network's API — nothing is estimated.

CREATE TABLE IF NOT EXISTS pulse_social_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  network          TEXT NOT NULL CHECK (network IN ('facebook', 'instagram', 'linkedin', 'x')),
  external_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  handle           TEXT,
  avatar_url       TEXT,
  access_token     TEXT NOT NULL,          -- encrypted
  refresh_token    TEXT,                   -- encrypted
  token_expires_at TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'disconnected')),
  last_error       TEXT,
  connected_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, network, external_id)
);

CREATE TABLE IF NOT EXISTS pulse_social_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partly_published', 'failed', 'cancelled')),
  body          TEXT NOT NULL DEFAULT '',
  link_url      TEXT,
  image_url     TEXT,
  scheduled_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pulse_social_posts_tenant ON pulse_social_posts(tenant_id, coalesce(scheduled_at, created_at));
CREATE INDEX IF NOT EXISTS idx_pulse_social_posts_due ON pulse_social_posts(status, scheduled_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS pulse_social_post_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id           UUID NOT NULL REFERENCES pulse_social_posts(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES pulse_social_accounts(id) ON DELETE CASCADE,
  body_override     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  external_post_id  TEXT,
  external_url      TEXT,
  error             TEXT,
  published_at      TIMESTAMPTZ,
  metrics           JSONB,
  metrics_at        TIMESTAMPTZ,
  UNIQUE (post_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_social_targets_metrics ON pulse_social_post_targets(status, metrics_at) WHERE status = 'published';

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_social_accounts', 'pulse_social_posts', 'pulse_social_post_targets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
