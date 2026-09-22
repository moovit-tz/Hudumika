-- 491_email_per_user_send_identity.sql
-- Email's inbound (personal IMAP, user_email_accounts from migration 460)
-- and outbound (tenant-wide SMTP/OAuth, tenant_settings.settings.email) were
-- two completely unrelated identities: a reply sent through the Email app
-- could show as coming from the tenant's shared address even though it
-- receives at the user's own connected mailbox, and a recipient's reply
-- could land somewhere other than the inbox that "sent" it.
--
-- This adds a real per-user send identity, additive and opt-in:
-- send_protocol defaults to 'platform', meaning "keep using the tenant/
-- system-wide identity exactly as before" — every existing user is
-- unaffected until they explicitly configure one of the other protocols in
-- Email Settings. OAuth reuses the tenant's already-registered Gmail/
-- Outlook app (its Client ID/Secret stay on tenant_settings, set once by a
-- workspace admin per mail-oauth.routes.ts) — only the resulting per-user
-- tokens live here, the same way user_email_accounts already stores each
-- user's own IMAP password rather than a shared one.

ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS send_protocol VARCHAR(10) NOT NULL DEFAULT 'platform';
-- 'platform' | 'smtp' | 'outlook' | 'gmail'

ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_port INT NOT NULL DEFAULT 587;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_pass TEXT; -- encrypted at rest, same cipher as imap_pass
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_encryption VARCHAR(10) NOT NULL DEFAULT 'ssl'; -- ssl | tls | none

-- What a message this user sends actually shows as. Falls back to
-- imap_user/smtp_user/the OAuth account's own address when unset, so this
-- is only needed when someone wants a different display name than their
-- connected account's own.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS from_name VARCHAR(255);
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS from_email VARCHAR(255);

-- Per-user OAuth tokens (Outlook/Gmail) — mirrors mail-oauth.routes.ts's
-- tenant-level columns, encrypted the same way.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS outlook_access_token TEXT;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS outlook_refresh_token TEXT;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS outlook_token_expires_at TIMESTAMPTZ;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS outlook_status VARCHAR(20);

ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS gmail_access_token TEXT;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS gmail_token_expires_at TIMESTAMPTZ;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS gmail_status VARCHAR(20);

-- RLS already covers this table (migration 460) — new columns inherit the
-- existing tenant_isolation_policy, no policy change needed.
