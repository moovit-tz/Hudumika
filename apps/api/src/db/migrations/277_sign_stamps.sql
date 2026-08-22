-- Migration 277: Saved stamps — one tenant (company) stamp per tenant,
-- any number of personal stamps per user.
--
-- Reuses sign_recipients.signature_data's own convention (base64 PNG stored
-- directly in the row) rather than a new object-storage bucket — these
-- images are small (a signature/stamp, not a document) and this is already
-- the proven storage shape for exactly this kind of image in this schema.
--
-- owner_type distinguishes the two cases rather than two separate tables,
-- since both are "an image someone can apply to a document" with identical
-- shape — only who owns it differs. A tenant has at most one 'tenant' row
-- (enforced below); a user can have more than one personal stamp (e.g. a
-- signature and a separate initials mark), so no uniqueness constraint on
-- (tenant_id, owner_user_id) beyond that.

CREATE TABLE IF NOT EXISTS sign_stamps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('tenant', 'user')),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  image_data    TEXT NOT NULL, -- base64 PNG data URL, same shape as sign_recipients.signature_data
  label         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sign_stamps_owner_user_required CHECK (
    (owner_type = 'user' AND owner_user_id IS NOT NULL) OR
    (owner_type = 'tenant' AND owner_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS sign_stamps_tenant_idx ON sign_stamps(tenant_id);
CREATE INDEX IF NOT EXISTS sign_stamps_owner_idx ON sign_stamps(owner_type, owner_user_id);

-- At most one tenant-level stamp per tenant — "upload/replace the company
-- stamp" is a single-slot setting, not a list.
CREATE UNIQUE INDEX IF NOT EXISTS sign_stamps_one_tenant_stamp
  ON sign_stamps(tenant_id) WHERE owner_type = 'tenant';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sign_stamps_updated_at') THEN
    CREATE TRIGGER sign_stamps_updated_at
      BEFORE UPDATE ON sign_stamps
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

ALTER TABLE sign_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_stamps FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_stamps'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_stamps
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
