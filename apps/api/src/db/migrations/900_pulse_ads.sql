-- Pulse ads (numbered 900 to stay clear of concurrent work in the 78x–79x range): connected ad accounts (Google Ads, Meta), their campaigns, daily
-- numbers as the ad platform reports them, and Pulse audiences pushed to them
-- as matched audiences.
--
-- Numbers come only from the platform's API (spend, clicks, impressions,
-- platform-counted conversions); Pulse adds its own leads/deals credited via
-- tagged links (pulse_touchpoints) next to them and never blends the two.
-- Audiences pushed out contain only people who opted in to marketing, hashed
-- with SHA-256 before they leave Hudumika.

CREATE TABLE IF NOT EXISTS pulse_ad_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  network          TEXT NOT NULL CHECK (network IN ('google', 'meta')),
  external_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  currency         TEXT,
  access_token     TEXT NOT NULL,   -- encrypted
  refresh_token    TEXT,            -- encrypted
  token_expires_at TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'disconnected')),
  last_error       TEXT,
  synced_at        TIMESTAMPTZ,
  connected_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, network, external_id)
);

CREATE TABLE IF NOT EXISTS pulse_ad_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES pulse_ad_accounts(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL,            -- as the platform names it: ENABLED/ACTIVE/PAUSED/...
  daily_budget  NUMERIC(18, 2),           -- in the account's currency
  budget_ref    TEXT,                     -- Google: campaign budget resource name
  objective     TEXT,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);

CREATE TABLE IF NOT EXISTS pulse_ad_metrics_daily (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES pulse_ad_campaigns(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  impressions  BIGINT NOT NULL DEFAULT 0,
  clicks       BIGINT NOT NULL DEFAULT 0,
  spend        NUMERIC(18, 2) NOT NULL DEFAULT 0,
  conversions  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, day)
);
CREATE INDEX IF NOT EXISTS idx_pulse_ad_metrics_tenant ON pulse_ad_metrics_daily(tenant_id, day);

CREATE TABLE IF NOT EXISTS pulse_ad_audiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES pulse_ad_accounts(id) ON DELETE CASCADE,
  segment_id    UUID REFERENCES pulse_segments(id) ON DELETE SET NULL,
  external_id   TEXT,
  name          TEXT NOT NULL,
  uploaded      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  last_error    TEXT,
  synced_at     TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, segment_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_ad_accounts', 'pulse_ad_campaigns', 'pulse_ad_metrics_daily', 'pulse_ad_audiences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
