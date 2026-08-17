-- 237_email_templates.sql
-- Per-tenant email template overrides. A row here is an override; its
-- absence means "use the code-defined default" (email-template-defaults.ts)
-- — the same override-over-defaults shape tenant_settings already uses
-- platform-wide, applied to email content instead of settings.
CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(100) NOT NULL,
  category     VARCHAR(50)  NOT NULL, -- 'transactional' | 'support' | 'account'
  subject      TEXT         NOT NULL,
  body_html    TEXT         NOT NULL,
  updated_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id);
