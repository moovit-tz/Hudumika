-- Migration 442: smart groups for Contacts.
--
-- A smart group is a saved filter with live, computed membership — no
-- manual tagging. "Nairobi clients" = (city = Nairobi AND has label
-- Client); "Unowned leads" = (sales_owner_id is empty). Membership is
-- re-evaluated every time the group is opened, straight off the contacts
-- table, so it never drifts the way a hand-maintained label does.
--
-- This is a separate concept from contact_labels (441): a label is
-- something a contact *has*, a smart group is a question the contact either
-- currently answers or doesn't. They deliberately do not share a table.
--
-- rules is a JSONB array of { field, op, value } objects. The set of
-- allowed fields and operators, and the SQL each compiles to, is defined
-- and enforced in contacts.service.ts (SMART_FIELDS) — the column only
-- stores what the validated route already accepted. match_type 'all' ANDs
-- the rules, 'any' ORs them.

CREATE TABLE IF NOT EXISTS contact_smart_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'all' CHECK (match_type IN ('all', 'any')),
  rules      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_contact_smart_groups_tenant ON contact_smart_groups(tenant_id);

-- Same RLS shape as every other tenant-scoped contacts table (see
-- 440_contacts_rls_gap.sql): ENABLE + FORCE + the standard direct policy.
ALTER TABLE contact_smart_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_smart_groups FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'contact_smart_groups'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON contact_smart_groups
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
