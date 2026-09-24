-- Adds HTML body support to per-user email compose templates.
-- body keeps the plain-text content; body_html holds the full sanitized HTML
-- when is_html = TRUE. The server sanitizes body_html through sanitize-html
-- before persisting it -- never trust raw client HTML.
ALTER TABLE email_quick_templates
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS is_html BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN email_quick_templates.body_html IS
  'Sanitized HTML body for HTML-mode templates (is_html=TRUE); the body column still holds a plain-text fallback.';
COMMENT ON COLUMN email_quick_templates.is_html IS
  'TRUE when this template carries a full HTML design rather than a plain-text canned response.';
