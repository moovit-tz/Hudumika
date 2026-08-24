-- SMS gateways (multi-gateway routing + sender IDs, replacing the single
-- tenant_settings.settings['int-sms'] blob), opt-out/blacklist compliance,
-- and inbound message logging. No tenant has 'int-sms' configured yet
-- (confirmed against the live dev DB before writing this), so the old path
-- is retired outright in integrations/sms.ts rather than kept as a shim —
-- there is nothing real to migrate.

CREATE TABLE IF NOT EXISTS sms_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('africas_talking', 'twilio', 'nexmo', 'bongolive')),
  label VARCHAR(100) NOT NULL,
  -- Whole credentials object encrypted as one JSON blob (encryptJson/decryptJson,
  -- onsite-secrets.service.ts) — shape varies per provider (atUser/atKey vs
  -- twilioSid/twilioToken), so one flexible encrypted field beats a fixed
  -- per-field column set that doesn't fit every provider.
  credentials TEXT NOT NULL,
  sender_id VARCHAR(30), -- default "from" for this gateway (short code / alphanumeric / number)
  priority INTEGER NOT NULL DEFAULT 0, -- lower = tried first
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_gateways_tenant ON sms_gateways(tenant_id, priority);

-- Multiple named sender identities per gateway (Africa's Talking and similar
-- East African gateways support several registered short codes/alphanumeric
-- IDs under one account) — a campaign or quick send can pick one, or fall
-- back to the gateway's own default sender_id above.
CREATE TABLE IF NOT EXISTS sms_sender_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gateway_id UUID NOT NULL REFERENCES sms_gateways(id) ON DELETE CASCADE,
  sender_id VARCHAR(30) NOT NULL,
  label VARCHAR(100),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gateway_id, sender_id)
);
CREATE INDEX IF NOT EXISTS idx_sms_sender_ids_gateway ON sms_sender_ids(gateway_id);

-- Numbers that must never be sent to — either self-opted-out (a STOP-style
-- reply, caught by the inbound webhook) or manually blacklisted by a tenant
-- admin. Checked before every send, in SmsIntegration.sendSms itself so no
-- caller can accidentally bypass it.
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  reason VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (reason IN ('stop_keyword', 'manual')),
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_tenant ON sms_opt_outs(tenant_id);

-- Inbound message log — every reply a configured gateway forwards to the
-- inbound webhook, whether or not it matched a STOP-style keyword. Real
-- two-way visibility, not just the opt-out side effect.
CREATE TABLE IF NOT EXISTS sms_inbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gateway_id UUID REFERENCES sms_gateways(id) ON DELETE SET NULL,
  from_number VARCHAR(32) NOT NULL,
  body TEXT NOT NULL,
  matched_keyword VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_tenant ON sms_inbound_messages(tenant_id, created_at DESC);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_gateways', 'sms_sender_ids', 'sms_opt_outs', 'sms_inbound_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
