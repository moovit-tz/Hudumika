-- Phone and WhatsApp lines per centre, with a phone menu (support network,
-- follows 761/763).
--
-- Vodacom, Yas, Airtel and Halotel do not offer a self-serve voice API. A
-- business number comes from the operator (or a reseller) as a business
-- line / SIP trunk and is connected to a voice platform that runs the menu
-- and calls back here. So each line records two separate things: the
-- `carrier` the number belongs to, and the `provider` that connects it.
-- Africa's Talking is the first provider (already used here for SMS); a
-- generic SIP/PBX provider records lines whose menu runs elsewhere.
--
-- Webhooks arrive before any tenant is known, keyed only by the number (or
-- WhatsApp phone_number_id), so a number is unique across the platform and
-- resolved through dbPlatform. Each voice line also carries a random
-- `webhook_token` in its callback URL: Africa's Talking does not sign voice
-- callbacks, so the URL itself is the secret.
CREATE TABLE support_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('voice', 'whatsapp')),
  name           TEXT NOT NULL,
  -- E.164, e.g. +255754000000
  phone_number   TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  carrier        TEXT NOT NULL DEFAULT 'other'
    CHECK (carrier IN ('vodacom', 'yas', 'airtel', 'halotel', 'ttcl', 'zantel', 'other')),
  provider       TEXT NOT NULL DEFAULT 'africastalking'
    CHECK (provider IN ('africastalking', 'sip', 'meta')),
  -- WhatsApp: Meta's phone_number_id. Voice: unused.
  external_id    TEXT,
  site_id        UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  product_id     UUID REFERENCES support_products(id) ON DELETE SET NULL,
  greeting       TEXT,
  greeting_audio_url TEXT,
  -- [{ "digit": "1", "label": "Payments", "action": "route" | "voicemail",
  --    "product_id": "…", "site_id": "…" }]
  menu           JSONB NOT NULL DEFAULT '[]',
  after_hours    TEXT NOT NULL DEFAULT 'voicemail' CHECK (after_hours IN ('voicemail', 'overflow')),
  ring_agents    BOOLEAN NOT NULL DEFAULT true,
  webhook_token  TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, phone_number)
);
CREATE UNIQUE INDEX uq_support_lines_external ON support_lines (kind, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_support_lines_token ON support_lines (webhook_token);
CREATE INDEX idx_support_lines_tenant ON support_lines (tenant_id, kind);
ALTER TABLE support_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- One row per inbound phone call, from first ring to hang-up.
CREATE TABLE support_calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  line_id          UUID REFERENCES support_lines(id) ON DELETE SET NULL,
  provider_session TEXT NOT NULL,
  caller_number    TEXT,
  status           TEXT NOT NULL DEFAULT 'menu'
    CHECK (status IN ('menu', 'ringing', 'voicemail', 'completed', 'missed', 'after_hours')),
  digits           TEXT,
  site_id          UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  product_id       UUID REFERENCES support_products(id) ON DELETE SET NULL,
  ticket_id        UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  agent_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  recording_url    TEXT,
  duration_seconds INTEGER,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  UNIQUE (provider_session)
);
CREATE INDEX idx_support_calls_tenant ON support_calls (tenant_id, started_at DESC);
CREATE INDEX idx_support_calls_site ON support_calls (tenant_id, site_id, started_at DESC);
ALTER TABLE support_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_calls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_calls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
