-- Pulse forms and attribution.
--
-- pulse_form_settings: how a CMS form's submissions become people — which
-- fields hold the email / name / phone, whether to also open a CRM lead, and
-- which select field (and which answer) records marketing consent. One row per
-- CMS form, created the first time someone saves settings in Pulse; a form
-- with no row uses Pulse's automatic field detection.
--
-- pulse_touchpoints: moments someone known engaged with marketing — a click
-- on a Pulse email/SMS/WhatsApp, or a website form sent from a tagged link.
-- No browsing is tracked: CMS page views stay anonymous by design. People are
-- keyed by email (lower-cased) or phone (last 9 digits), so a contact who
-- clicked and the CRM lead or customer they later became are the same person.
--
-- pulse_conversions: a lead created, a deal won or a payment received, with
-- the first and last touch in the 90 days before it.

CREATE TABLE IF NOT EXISTS pulse_form_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id         UUID NOT NULL REFERENCES cms_forms(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  create_lead     BOOLEAN NOT NULL DEFAULT false,
  email_field     TEXT,
  name_field      TEXT,
  phone_field     TEXT,
  company_field   TEXT,
  consent_field   TEXT,
  consent_value   TEXT,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, form_id)
);

CREATE TABLE IF NOT EXISTS pulse_touchpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_key    TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'form')),
  campaign_id   UUID REFERENCES pulse_campaigns(id) ON DELETE SET NULL,
  form_id       UUID REFERENCES cms_forms(id) ON DELETE SET NULL,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pulse_touchpoints_person ON pulse_touchpoints(tenant_id, person_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_touchpoints_campaign ON pulse_touchpoints(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pulse_conversions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('lead', 'deal_won', 'payment')),
  entity_id       UUID NOT NULL,
  person_key      TEXT,
  value           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  first_touch_id  UUID REFERENCES pulse_touchpoints(id) ON DELETE SET NULL,
  last_touch_id   UUID REFERENCES pulse_touchpoints(id) ON DELETE SET NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One payment row per invoice payment event; a lead or deal converts once.
  event_id        TEXT NOT NULL DEFAULT '',
  UNIQUE (tenant_id, kind, entity_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_conversions_tenant ON pulse_conversions(tenant_id, occurred_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_form_settings', 'pulse_touchpoints', 'pulse_conversions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
