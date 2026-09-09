-- Migration 438: Contacts app — closing 5 real, audited gaps in one pass
-- (structured address, multi-value phone/email, a real user-linked sales
-- owner, and fuzzy duplicate matching). Export and Outlook sync need no
-- schema — they're covered in service/route code alongside this migration.

-- ── Structured address — plain columns, matching this table's own existing
-- convention (every other field here is a scalar column, not a JSONB blob).
-- `location` (freeform, migration 029) is left untouched and still shown —
-- this is additive, not a replacement, since existing rows only have that.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_postal_code TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_country TEXT;

-- ── Multi-value phone/email. contacts.email/contacts.phone (028) stay as
-- the PRIMARY value — every existing dedup/import/sync code path already
-- reads those two columns and keeps working unmodified. These two tables
-- hold every value beyond the first, kept in sync with the primary columns
-- by application code (contacts.service.ts), not a trigger, so the sync
-- logic stays visible and debuggable in one place.
CREATE TABLE IF NOT EXISTS contact_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'other' CHECK (label IN ('work', 'personal', 'other')),
  email      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_emails_contact ON contact_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_emails_tenant ON contact_emails(tenant_id);

CREATE TABLE IF NOT EXISTS contact_phones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'other' CHECK (label IN ('work', 'mobile', 'home', 'other')),
  phone      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_phones_contact ON contact_phones(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_phones_tenant ON contact_phones(tenant_id);

-- ── Real sales-owner reference — was a freeform text column (029), which
-- is exactly the "typed name, not a real account" pattern CLAUDE.md's own
-- avatar rule forbids everywhere else in this platform. sales_owner (text)
-- is left in place as a fallback label for a name that doesn't match any
-- real user (an external referral partner, a departed staff member), but
-- a resolvable user now gets a real FK the UI can render with PersonAvatar.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sales_owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_sales_owner ON contacts(sales_owner_id) WHERE sales_owner_id IS NOT NULL;

-- ── Fuzzy duplicate matching — pg_trgm already enabled platform-wide
-- (251_sanctions_screening.sql); this just adds the GIN index contacts'
-- own name-similarity query needs to run fast instead of a full scan.
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin ((first_name || ' ' || coalesce(last_name, '')) gin_trgm_ops);
