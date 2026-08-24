-- SMS app — groups, templates, campaigns, and the unified outbound message
-- log every app in the platform sends through (SmsService, sms.service.ts).
-- Builds on the already-real gateway integration in integrations/sms.ts
-- (Africa's Talking + Twilio wired to live REST APIs; nexmo/bongolive listed
-- but honestly report "not yet wired" rather than faking success).
--
-- Tables ordered so every FK is inline in its own CREATE TABLE — no later
-- ALTER TABLE ADD CONSTRAINT, which isn't idempotent on a second run
-- (Postgres has no ADD CONSTRAINT IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS sms_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_groups_tenant ON sms_groups(tenant_id);

-- A lightweight phone-number list, not a duplicate contacts system — members
-- are typed manually, CSV-imported, or added from an existing contact/lead/
-- customer/staff record (contact_id is provenance only, no FK: the source
-- table varies and a group member must survive that source row being
-- deleted).
CREATE TABLE IF NOT EXISTS sms_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES sms_groups(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  name VARCHAR(200),
  contact_id UUID,
  contact_source VARCHAR(20), -- 'contact' | 'lead' | 'customer' | 'user' | null (manual/CSV)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_sms_group_members_group ON sms_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_sms_group_members_tenant ON sms_group_members(tenant_id);

CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  body TEXT NOT NULL, -- {{variable}} placeholders, same {{}} convention as NOTIFICATION_MATRIX templates
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant ON sms_templates(tenant_id);

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  group_id UUID REFERENCES sms_groups(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_tenant ON sms_campaigns(tenant_id);
-- Polled by sms-outbox.job.ts to find due scheduled campaigns.
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_due ON sms_campaigns(status, scheduled_at) WHERE status = 'scheduled';

-- The one unified outbound log — every send through SmsService (quick send,
-- campaign fan-out, ClearOS shipment notifications, Studio workflow SMS
-- steps, Bliss support-ticket SMS replies) lands one row here, regardless of
-- which app triggered it. 'queued' rows are what sms-outbox.job.ts polls
-- for bulk/throttled sends; a synchronous quick-send goes straight to
-- 'sent'/'failed'.
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- who/what triggered it; null for system-automated sends
  to_number VARCHAR(32) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'undelivered')),
  provider VARCHAR(30),
  provider_message_id TEXT,
  error TEXT,
  segments INTEGER NOT NULL DEFAULT 1, -- 160-char GSM-7 segments, for real cost/usage visibility
  source_app VARCHAR(50) NOT NULL,
  campaign_id UUID REFERENCES sms_campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  contact_name VARCHAR(200),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_messages_tenant ON sms_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_queued ON sms_messages(status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign ON sms_messages(campaign_id) WHERE campaign_id IS NOT NULL;
-- Delivery-status webhook target: Africa's Talking/Twilio callbacks carry
-- the provider's own message id, not ours.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_provider_msg ON sms_messages(provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sms_groups', 'sms_group_members', 'sms_templates', 'sms_campaigns', 'sms_messages']
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
