-- 492_email_messages_tenant_cascade.sql
-- email_messages.tenant_id (139_email_messages.sql) was the one email table
-- with a plain REFERENCES tenants(id) — no ON DELETE CASCADE — while every
-- sibling table added since (email_outbox, email_labels,
-- email_quick_templates, user_email_accounts) already cascades. Live-
-- reproduced while writing this session's Email test suite: deleting a
-- tenant that has ever sent or received a single message fails outright
-- with a raw foreign-key-violation error instead of cleanly cascading, the
-- same shape of bug as every other "ON DELETE CASCADE missing on one table
-- in an otherwise-consistent family" fix elsewhere in this codebase.
ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_tenant_id_fkey;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
