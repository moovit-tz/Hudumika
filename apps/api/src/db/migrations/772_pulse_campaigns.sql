-- Pulse campaigns: one send to one segment over one channel.
--
-- pulse_campaigns holds what is sent; pulse_sends holds one row per person
-- it was (or deliberately was not) sent to, carrying the opaque token every
-- tracking URL in that person's copy is built from. The token is the only
-- thing the public open/click/unsubscribe endpoints accept, so a URL can never
-- name another tenant's campaign or another person's send.
--
-- Delivery itself is not reimplemented: email goes through MailService into
-- email_outbox (retries live there) and SMS through SmsService into
-- sms_messages. pulse_sends keeps the outbox/sms row id for the join back.

CREATE TABLE IF NOT EXISTS pulse_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  segment_id       UUID REFERENCES pulse_segments(id) ON DELETE SET NULL,
  -- Email
  subject          TEXT,
  preheader        TEXT,
  from_name        TEXT,
  reply_to         TEXT,
  body_html        TEXT,
  -- SMS / WhatsApp body (WhatsApp: the approved template name and its variables)
  body_text        TEXT,
  whatsapp_template JSONB,
  -- A/B subject test: { variants: [{ key, subject }], sample_pct, metric: 'open'|'click',
  --   decide_after_hours, winner_key, decided_at }. NULL = no test.
  ab_test          JSONB,
  utm_campaign     TEXT,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pulse_campaigns_tenant ON pulse_campaigns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_campaigns_due ON pulse_campaigns(status, scheduled_at) WHERE status IN ('scheduled', 'sending');

CREATE TABLE IF NOT EXISTS pulse_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id     UUID NOT NULL REFERENCES pulse_campaigns(id) ON DELETE CASCADE,
  -- A/B: which subject this person got; 'holdout' waits for the winner.
  variant         TEXT,
  source          TEXT NOT NULL,           -- contacts | leads | customers
  source_id       UUID,
  recipient_name  TEXT,
  address         TEXT NOT NULL,           -- email lower-cased, or the phone as dialled
  token           TEXT NOT NULL UNIQUE,    -- 32 hex chars, in every tracked URL
  short_code      TEXT NOT NULL UNIQUE,    -- 8 chars, for SMS short links
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'held', 'sent', 'failed', 'skipped')),
  skip_reason     TEXT,
  outbox_id       UUID,
  error           TEXT,
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  open_count      INTEGER NOT NULL DEFAULT 0,
  clicked_at      TIMESTAMPTZ,
  click_count     INTEGER NOT NULL DEFAULT 0,
  unsubscribed_at TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, address)
);
CREATE INDEX IF NOT EXISTS idx_pulse_sends_campaign ON pulse_sends(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_pulse_sends_tenant_source ON pulse_sends(tenant_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_pulse_sends_outbox ON pulse_sends(outbox_id) WHERE outbox_id IS NOT NULL;

-- Every distinct link in a campaign, numbered. A click URL carries the
-- number, never the destination, so the redirect can only go where the
-- campaign's own content pointed.
CREATE TABLE IF NOT EXISTS pulse_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES pulse_campaigns(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  url         TEXT NOT NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, position)
);

CREATE TABLE IF NOT EXISTS pulse_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES pulse_campaigns(id) ON DELETE CASCADE,
  send_id     UUID NOT NULL REFERENCES pulse_sends(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('open', 'click', 'unsubscribe', 'bounce', 'complaint')),
  link_id     UUID REFERENCES pulse_links(id) ON DELETE SET NULL,
  -- No raw IP is kept: a salted hash is enough to tell repeat machine opens apart.
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pulse_events_campaign ON pulse_events(campaign_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_pulse_events_tenant ON pulse_events(tenant_id, created_at DESC);

-- Marketing mail needs List-Unsubscribe headers (RFC 8058). The outbox
-- carries them so a retried send keeps them.
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS headers JSONB;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_campaigns', 'pulse_sends', 'pulse_links', 'pulse_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
