-- 139_email_messages.sql
-- EmailApp.tsx already called GET /v1/emails?folder=X and POST /v1/email/send
-- (the latter already existed and really sends via EmailIntegration/nodemailer),
-- but no mailbox table existed at all — the GET call always 404'd, silently
-- caught, leaving a hardcoded MOCK_EMAILS array as the permanent "inbox" for
-- every tenant, and a successful send never persisted anything into a Sent
-- folder, so a reload made every "sent" email vanish.
--
-- Per-user mailbox (not tenant-wide): each authenticated user has their own
-- inbox/sent/drafts/spam/trash, matching how a real mail client works.
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  folder VARCHAR(20) NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'drafts', 'spam', 'trash')),
  from_name VARCHAR(255) NOT NULL DEFAULT '',
  from_email VARCHAR(255) NOT NULL DEFAULT '',
  to_addresses JSONB NOT NULL DEFAULT '[]',
  cc_addresses JSONB NOT NULL DEFAULT '[]',
  subject VARCHAR(500) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  snippet VARCHAR(300) NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  starred BOOLEAN NOT NULL DEFAULT false,
  labels JSONB NOT NULL DEFAULT '[]',
  has_attachment BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_user_folder ON email_messages(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant ON email_messages(tenant_id);
