-- 493_email_signatures.sql
-- user_email_accounts.signature was a single plain-text field shared by
-- every compose/reply on the account — no rich formatting, no images, and
-- no way to keep, say, a short "Sent from my phone" signature separate from
-- a full one with a logo. Gmail's own model is a list of named signatures,
-- with independent defaults for "new message" vs "reply/forward". This adds
-- that as its own table rather than another column, the same reasoning
-- user_email_accounts itself was split out for (genuinely personal, and now
-- genuinely many-per-user).

CREATE TABLE IF NOT EXISTS email_signatures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(120) NOT NULL,
  -- Sanitized server-side on every write (see email-signatures.routes.ts) —
  -- this HTML renders inside other people's inboxes, so it goes through the
  -- same allowlist-based sanitizer as inbound message bodies before it's
  -- ever stored, not just before it's displayed.
  body_html        TEXT NOT NULL DEFAULT '',
  is_default_new   BOOLEAN NOT NULL DEFAULT false,
  is_default_reply BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_signatures_user ON email_signatures(tenant_id, user_id);

ALTER TABLE email_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_signatures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_signatures;
CREATE POLICY tenant_isolation_policy ON email_signatures
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Backfill: nobody's existing plain-text signature should silently vanish
-- once the UI switches to reading from this table instead of
-- user_email_accounts.signature. One row per user who had a non-blank
-- signature, used for both contexts (their only signature until they add
-- more), wrapped as a <div> so it round-trips through the rich editor.
INSERT INTO email_signatures (tenant_id, user_id, name, body_html, is_default_new, is_default_reply)
SELECT tenant_id, user_id, 'Signature 1',
       '<div>' || replace(replace(trim(signature), E'\r\n', E'\n'), E'\n', '<br>') || '</div>',
       true, true
FROM user_email_accounts
WHERE trim(signature) <> ''
ON CONFLICT DO NOTHING;
