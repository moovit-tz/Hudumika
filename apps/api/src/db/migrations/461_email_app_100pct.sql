-- 461_email_app_100pct.sql
-- Closes the remaining named gaps from migration 460's build: real
-- Message-ID/References threading, multiple attachments per message,
-- Postgres full-text search, user-defined labels, per-user quick-reply
-- templates, and a scheduled/undo-send mechanism (one mechanism serves
-- both — "send" always goes through a short scheduled delay a user can
-- cancel, and a longer delay is just "schedule send" using the same path).

-- Real threading — mailparser exposes messageId/references/inReplyTo on
-- every inbound message; nodemailer returns messageId on every outbound
-- send. Storing these lets imap-email-ingest.job.ts and email.routes.ts
-- match a genuine RFC 5322 thread instead of only the subject-normalization
-- fallback (kept as the fallback for mail with no header to match on yet).
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS in_reply_to_message_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS references_ids JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id ON email_messages(user_id, message_id) WHERE message_id IS NOT NULL;

-- Multiple attachments — replaces the single attachment_storage_key/
-- attachment_filename/attachment_size trio (migration 460) as the field
-- new code actually writes; those columns stay for any pre-existing row
-- and are read as a one-item fallback, never dropped.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';
UPDATE email_messages SET attachments = jsonb_build_array(jsonb_build_object(
    'storageKey', attachment_storage_key, 'filename', attachment_filename, 'size', attachment_size
  ))
  WHERE attachment_storage_key IS NOT NULL AND attachments = '[]';

-- Real full-text search over subject + body — replaces the in-memory
-- JS substring filter GET /v1/emails used to run over every fetched row.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_email_messages_search ON email_messages USING GIN (search_vector);

-- Scheduled / undo-send. Sending a message inserts it straight into
-- 'scheduled' with scheduled_at a short delay out (the Gmail-style "Undo
-- send" window) or a user-chosen future time (the same mechanism doubles
-- as "Schedule send"); scheduled-email-send.job.ts flips it to 'sent' —
-- performing the real delivery — once scheduled_at arrives. Deleting a
-- still-'scheduled' row (the existing DELETE endpoint, no new code needed)
-- is how a cancel/undo actually works.
ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_folder_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_folder_check
  CHECK (folder IN ('inbox', 'sent', 'drafts', 'spam', 'trash', 'scheduled'));
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_email_messages_scheduled_due ON email_messages(scheduled_at) WHERE folder = 'scheduled';

-- User-defined labels — replaces the hardcoded Finance/Shipments/HR/Urgent
-- set every mailbox was stuck with.
CREATE TABLE IF NOT EXISTS email_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(60) NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT 'teal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_email_labels_tenant ON email_labels(tenant_id);
ALTER TABLE email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_labels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_labels;
CREATE POLICY tenant_isolation_policy ON email_labels
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Per-user canned-reply / quick-response templates for the mailbox itself —
-- distinct from email_templates (237_email_templates.sql), which is the
-- platform's own transactional-email copy (password resets, invoice
-- notices), not something a mailbox compose window reaches for.
CREATE TABLE IF NOT EXISTS email_quick_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  subject    VARCHAR(500) NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_quick_templates_user ON email_quick_templates(user_id);
ALTER TABLE email_quick_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_quick_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_quick_templates;
CREATE POLICY tenant_isolation_policy ON email_quick_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
