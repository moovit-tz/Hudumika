-- "Attach file" / "Insert image" in the ticket composer (Support.tsx) had no
-- onClick at all, and neither support_messages nor any other table had a
-- place to put an attachment. Reuses the platform's existing Drive storage
-- (cloud_files, uploaded via the real POST /v1/files/upload — same
-- entity_type/entity_id tagging mechanism ContractDetail.tsx and Notes'
-- image attachments already use), not a new storage mechanism — this table
-- only links an already-uploaded file to the message it was attached to.
-- One message can carry more than one file, hence a join table rather than
-- a single nullable column on support_messages.
--
-- Scoped to internal notes for now (see Support.tsx's isNote-gated Attach
-- button) — an attachment on a WhatsApp/Email/SMS broadcast reply would need
-- real per-channel media delivery (WhatsApp media messages, email MIME
-- attachments) that doesn't exist yet; faking that delivery would be worse
-- than not offering the button there, so it stays note-only until that
-- integration is real.
CREATE TABLE IF NOT EXISTS support_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_msg_attachments_message ON support_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_support_msg_attachments_tenant ON support_message_attachments(tenant_id);

ALTER TABLE support_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_message_attachments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'support_message_attachments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON support_message_attachments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
