-- 496_email_vacation_responder.sql
-- Gmail's "Vacation responder" — auto-replies once per sender for the
-- configured date range. Lives on user_email_accounts (same per-user,
-- opt-in, additive shape as signature/spam_blocklist on this table) rather
-- than a new table, since it's a single on/off setting with a few fields,
-- not a list.

ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_start TIMESTAMPTZ;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_end TIMESTAMPTZ;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_subject VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_message TEXT NOT NULL DEFAULT '';
-- Scope note: "contacts only" narrows to senders already in this user's
-- Contacts (contacts.routes.ts); "domain only" narrows to senders sharing
-- this account's own email domain (a common "internal only" auto-reply
-- case). Both false = reply to anyone, Gmail's own default.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_contacts_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_domain_only BOOLEAN NOT NULL DEFAULT false;
-- Senders already auto-replied to during the current vacation window, so a
-- back-and-forth thread doesn't get a fresh auto-reply on every message —
-- reset whenever vacation_start/vacation_end changes (a new vacation period).
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS vacation_replied_to JSONB NOT NULL DEFAULT '[]';
