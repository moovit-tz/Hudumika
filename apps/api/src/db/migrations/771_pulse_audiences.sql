-- Pulse audiences: segments and consent.
--
-- A segment is a saved question over one of the tenant's existing people
-- tables — contacts, CRM leads or customers — answered live every time it is
-- used, in the same shape as Contacts smart groups (442): rules is a JSONB
-- array of { field, op, value } and match_type ANDs or ORs them. Pulse never
-- copies people into its own table; the field catalog that rules may use is
-- enforced in pulse-segments.service.ts.
--
-- pulse_consents is the one marketing-permission record per channel and
-- address (email lower-cased; phone as its last 9 digits, the key sms_opt_outs
-- uses through lib/phone.ts normalizePhone). An address with no row is
-- "no recorded choice" — sendable for email (with an unsubscribe link in every
-- message) and governed by sms_opt_outs for SMS, which stays the SMS app's own
-- truth; Pulse reads both before every send.

CREATE TABLE IF NOT EXISTS pulse_segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  source      TEXT NOT NULL CHECK (source IN ('contacts', 'leads', 'customers')),
  match_type  TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
  rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_pulse_segments_tenant ON pulse_segments(tenant_id);

CREATE TABLE IF NOT EXISTS pulse_consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  address     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  -- Where the choice came from: 'form', 'unsubscribe_link', 'import', 'manual', 'bounce'.
  source      TEXT NOT NULL,
  -- What proves it: form id and submission, campaign id, the admin who set it.
  evidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel, address)
);
CREATE INDEX IF NOT EXISTS idx_pulse_consents_tenant_status ON pulse_consents(tenant_id, channel, status);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_segments', 'pulse_consents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
