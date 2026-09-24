-- Marketplace email templates — distributable, immutable master records.
-- Tenants import a copy into email_templates (their own tenant row);
-- the master here is the stable reference.

CREATE TABLE IF NOT EXISTS marketplace_email_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  slug             TEXT        NOT NULL UNIQUE,
  description      TEXT        NOT NULL DEFAULT '',
  category         TEXT        NOT NULL DEFAULT 'general',  -- finance|crm|hr|clearos|support|esign|commerce|general
  application      TEXT,                   -- which Hudumika app this targets
  event_key        TEXT,                   -- matches comm_events.event_key if app-specific
  tags             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  subject          TEXT        NOT NULL,
  preheader        TEXT        NOT NULL DEFAULT '',
  body_html        TEXT        NOT NULL,
  body_plain       TEXT        NOT NULL DEFAULT '',
  available_vars   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  locale           TEXT        NOT NULL DEFAULT 'en',
  version          TEXT        NOT NULL DEFAULT '1.0.0',
  preview_url      TEXT,
  is_featured      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_hudumika_official BOOLEAN NOT NULL DEFAULT TRUE,
  author_tenant_id UUID,       -- NULL = Hudumika; set = submitted by tenant
  author_name      TEXT        NOT NULL DEFAULT 'Hudumika',
  status           TEXT        NOT NULL DEFAULT 'published',  -- draft|submitted|under_review|approved|published|rejected|archived
  review_notes     TEXT,
  published_at     TIMESTAMPTZ,
  downloads        INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_email_templates_category ON marketplace_email_templates (category);
CREATE INDEX IF NOT EXISTS marketplace_email_templates_event ON marketplace_email_templates (event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_email_templates_status ON marketplace_email_templates (status);

-- Track which tenant imported which marketplace template (and when)
CREATE TABLE IF NOT EXISTS tenant_marketplace_imports (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  marketplace_template_id   UUID        NOT NULL REFERENCES marketplace_email_templates(id) ON DELETE RESTRICT,
  local_template_key        TEXT        NOT NULL,   -- the email_templates.template_key that was created
  source_version            TEXT        NOT NULL,
  update_available          BOOLEAN     NOT NULL DEFAULT FALSE,
  imported_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, marketplace_template_id)
);

ALTER TABLE tenant_marketplace_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_marketplace_imports_rls ON tenant_marketplace_imports
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
