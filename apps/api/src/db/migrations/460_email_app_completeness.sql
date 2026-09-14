-- 460_email_app_completeness.sql
-- Email (apps/web EmailApp.tsx) was send-only wearing a mailbox UI: no
-- inbound mail (the "inbox" was a synthetic sampleInbox() seed), no drafts,
-- no attachments (has_attachment was hardcoded false on every real send),
-- Bcc tracked in frontend state but never sent, no threading, no
-- signatures, no read receipts, no spam handling beyond a folder name.
-- This migration lays the data model for all of it.

-- Real attachment metadata (mirrors email_outbox.attachment_storage_key/
-- attachment_filename from migration 258 — same MinioIntegration-backed
-- storage, same shape, so a sent-with-attachment message can be
-- re-downloaded from the sender's own Sent-folder copy).
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachment_storage_key TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachment_filename TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachment_size INT;

-- Bcc — ComposeData already carried this in the frontend; sendCompose()
-- just never sent it. Stored only on the sender's own copy (a Bcc
-- recipient's copy, like every other inbound message, only ever exists in
-- their own mailbox — nothing here fabricates one).
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS bcc_addresses JSONB NOT NULL DEFAULT '[]';

-- Threading — messages sharing a conversation get the same thread_id
-- (the first message in a thread is its own thread_id). in_reply_to is the
-- real parent message id when known (a reply sent through this app), NULL
-- for an inbound message whose parent was never seen (e.g. arrived before
-- IMAP sync was enabled).
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS thread_id UUID;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS in_reply_to UUID REFERENCES email_messages(id) ON DELETE SET NULL;
-- Backfill: every existing row starts its own thread.
UPDATE email_messages SET thread_id = id WHERE thread_id IS NULL;
ALTER TABLE email_messages ALTER COLUMN thread_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(user_id, thread_id);

-- Read receipts — a tracking pixel embedded in outbound HTML when the
-- sender checks "Request read receipt"; GET /v1/email/receipt/:id (public,
-- unauthenticated — same trust model as any external tracking pixel) marks
-- read_receipt_confirmed_at the first time the recipient's mail client
-- loads it. NULL forever for a message that never requested one, so the UI
-- can tell "not requested" from "requested, not yet opened".
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS read_receipt_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS read_receipt_confirmed_at TIMESTAMPTZ;

-- Per-user mailbox connection + preferences. A dedicated table, not another
-- tenant_settings JSON key, because this is genuinely personal (each
-- staff member's own IMAP mailbox and signature), the same reasoning
-- calendar_sync_connections already applies for personal OAuth tokens.
CREATE TABLE IF NOT EXISTS user_email_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  imap_enabled       BOOLEAN NOT NULL DEFAULT false,
  imap_host          VARCHAR(255),
  imap_port          INT NOT NULL DEFAULT 993,
  imap_user          VARCHAR(255),
  imap_pass          TEXT, -- encrypted at rest, onsite-secrets.service.ts (same cipher as ticketImap/SMTP)
  imap_encryption    VARCHAR(10) NOT NULL DEFAULT 'ssl', -- ssl | tls | none
  imap_mark_as_read  BOOLEAN NOT NULL DEFAULT true,
  signature          TEXT NOT NULL DEFAULT '',
  -- Rule-based, not ML — an explicit sender/domain/keyword blocklist a user
  -- maintains themselves. Honest about what this is: no claim of a trained
  -- spam classifier anywhere in the code that reads this.
  spam_blocklist     JSONB NOT NULL DEFAULT '[]',
  last_synced_at     TIMESTAMPTZ,
  last_sync_error    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_email_accounts_tenant ON user_email_accounts(tenant_id);

ALTER TABLE user_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON user_email_accounts;
CREATE POLICY tenant_isolation_policy ON user_email_accounts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
