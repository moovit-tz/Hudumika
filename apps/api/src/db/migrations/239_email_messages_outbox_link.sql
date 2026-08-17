-- 239_email_messages_outbox_link.sql
-- Links a Sent-folder email_messages row to the email_outbox row that
-- actually carries its real delivery status — the Sent list used to assume
-- success the instant Compose was clicked, with no way to show Pending/
-- Failed after the fact.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS outbox_id UUID REFERENCES email_outbox(id) ON DELETE SET NULL;
