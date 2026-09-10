-- Migration 446: real owner reference for CRM leads.
--
-- leads.assigned_to (128_crm_leads.sql) is a freeform text column — exactly
-- the "typed name, not a real account" pattern CLAUDE.md's avatar rule
-- forbids everywhere else, and the same gap Contacts closed for its own
-- sales_owner field in 439_contacts_birthday_reminders.sql's sibling
-- migration 438. assigned_to stays as a fallback label for a name that
-- doesn't resolve to a real user (an external referral partner); a
-- resolvable teammate now gets a real FK the UI can render with
-- PersonAvatar and filter "assigned to me" against.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to_id) WHERE assigned_to_id IS NOT NULL;
