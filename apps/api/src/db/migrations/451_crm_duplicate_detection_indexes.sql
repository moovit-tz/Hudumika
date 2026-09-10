-- Migration 451: fuzzy duplicate-detection support for Leads and
-- Customers — Gap #11 of the CRM-vs-top-10 analysis. Same pg_trgm
-- mechanism Contacts already uses (438_contacts_gap_closure.sql,
-- pg_trgm itself enabled platform-wide since 251_sanctions_screening.sql)
-- applied to the field that actually carries company identity here:
-- leads.company and customers.name, not a person's first/last name.
CREATE INDEX IF NOT EXISTS idx_leads_company_trgm ON leads USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
