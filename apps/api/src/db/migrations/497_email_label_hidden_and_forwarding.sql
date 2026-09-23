-- 497_email_label_hidden_and_forwarding.sql
-- Two small, independent Gmail-parity additions:
--
-- 1. Labels tab "show in label list" — a label can be hidden from the
--    sidebar without being deleted (still applyable to messages, still
--    manageable in Settings). Mirrors Gmail's per-label visibility toggle.
ALTER TABLE email_labels ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Forwarding — auto-forward every inbound message to another address,
--    optionally keeping a copy in this mailbox too. Checked at the same
--    inbound-ingest point as the vacation responder and spam blocklist.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS forward_to_email VARCHAR(255);
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS forward_keep_copy BOOLEAN NOT NULL DEFAULT true;
-- Per-user inbox display preference — unread-first / starred-first ordering
-- of the message list. 'default' (chronological) is today's only behavior.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS inbox_sort VARCHAR(20) NOT NULL DEFAULT 'default';
-- After archiving/deleting/marking-done a message from the detail view,
-- what to show next — matches Gmail's Advanced ▸ Auto-advance setting.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS auto_advance VARCHAR(20) NOT NULL DEFAULT 'list';
