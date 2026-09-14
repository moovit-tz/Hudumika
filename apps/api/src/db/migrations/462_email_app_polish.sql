-- 462_email_app_polish.sql
-- Two small follow-ons to 461 discovered while wiring it up for real:
-- (1) an 'archive' folder — the bulk-action gap list named "archive" but no
--     folder existed to move a message into; (2) a place to surface why a
--     deferred (scheduled/undo-send) delivery failed, since a failed row
--     bounces back to Drafts rather than vanishing silently.
ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_folder_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_folder_check
  CHECK (folder IN ('inbox', 'sent', 'drafts', 'spam', 'trash', 'scheduled', 'archive'));
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS send_error TEXT;
