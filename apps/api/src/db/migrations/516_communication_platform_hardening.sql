-- Production communication platform: locale-aware template documents,
-- immutable revisions, structured event recipients and delivery attempts.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS preheader TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body_plain TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS block_document JSONB,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS application TEXT,
  ADD CONSTRAINT email_templates_status_check CHECK (status IN ('draft', 'active', 'archived'));

CREATE INDEX IF NOT EXISTS email_templates_tenant_event_locale
  ON email_templates (tenant_id, event_key, locale) WHERE event_key IS NOT NULL;
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_tenant_id_template_key_key;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_tenant_key_locale_unique
  UNIQUE (tenant_id, template_key, locale);

CREATE TABLE IF NOT EXISTS email_template_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(100) NOT NULL,
  revision INTEGER NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL,
  body_plain TEXT NOT NULL DEFAULT '',
  locale VARCHAR(16) NOT NULL DEFAULT 'en',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  block_document JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, template_key, revision)
);
ALTER TABLE email_template_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON email_template_revisions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_event_configs
  ADD COLUMN IF NOT EXISTS locale VARCHAR(16),
  ADD COLUMN IF NOT EXISTS recipient_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS channels TEXT[];
ALTER TABLE tenant_event_configs FORCE ROW LEVEL SECURITY;

ALTER TABLE comm_delivery_log
  ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(3) NOT NULL DEFAULT 'TO',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(16) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS record_id TEXT,
  ADD COLUMN IF NOT EXISTS outbox_id UUID,
  ADD CONSTRAINT comm_delivery_recipient_type_check CHECK (recipient_type IN ('TO', 'CC', 'BCC'));
ALTER TABLE comm_delivery_log FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS comm_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES comm_delivery_log(id) ON DELETE CASCADE,
  attempt_number SMALLINT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  provider_id TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, delivery_id, attempt_number)
);
ALTER TABLE comm_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON comm_delivery_attempts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS comm_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  frequency TEXT NOT NULL DEFAULT 'immediate',
  locale VARCHAR(16) NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, event_key),
  CHECK (frequency IN ('immediate', 'daily_digest', 'weekly_digest', 'never'))
);
ALTER TABLE comm_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE comm_notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON comm_notification_preferences
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS comm_delivery_record_history
  ON comm_delivery_log (tenant_id, record_type, record_id, created_at DESC);
