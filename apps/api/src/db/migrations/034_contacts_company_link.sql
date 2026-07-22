-- Migration 034: Link contacts to registered companies (customers) + activity log

-- Optional FK from a contact to an existing registered company (customers table).
-- Left NULL when the contact's company is freeform text with no match.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);

-- Activity log — records contact creation, edits, and company link/switch/unlink events.
CREATE TABLE IF NOT EXISTS contact_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(200),
  action     VARCHAR(50) NOT NULL, -- created, updated, company_linked, company_changed, company_unlinked
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_activity_log_contact ON contact_activity_log(contact_id);
