-- 472_cms_webhooks.sql
-- §78 of the CMS master brief: the platform already has webhook
-- infrastructure for INBOUND provider callbacks (SMS, WhatsApp) — nothing
-- fires OUTBOUND from CMS. A real cms_webhooks table + a dispatch call at
-- each existing status-change site (the event points already exist in
-- code; this is wiring, not new architecture, exactly as scoped).

CREATE TABLE IF NOT EXISTS cms_webhooks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  -- HMAC-SHA256 signing secret for the X-Hudumika-Signature header — lets a
  -- receiver verify a payload really came from this platform, not a spoofed
  -- POST to a guessable URL.
  secret      TEXT        NOT NULL,
  events      JSONB       NOT NULL DEFAULT '[]', -- e.g. ["page.published","post.published","entry.published","media.uploaded"]
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cms_webhooks_tenant ON cms_webhooks (tenant_id);

ALTER TABLE cms_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_webhooks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_webhooks;
CREATE POLICY tenant_isolation_policy ON cms_webhooks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
