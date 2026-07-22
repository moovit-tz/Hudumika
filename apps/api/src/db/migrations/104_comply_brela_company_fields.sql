-- Migration 104: Extend the shared customers/CRM table with BRELA-derived
-- company profile fields, so BRELA-imported companies are real CRM records
-- (not a siloed table) that any app can see. Nullable / honest-only fields —
-- no directors/shareholders/compliance_score, since BRELA's public search
-- does not return them (see ComplyBrelaSearch.tsx's no-fabrication comments).

ALTER TABLE customers ADD COLUMN IF NOT EXISTS source               VARCHAR(30) NOT NULL DEFAULT 'manual';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS registry_number      VARCHAR(50);   -- BRELA reg/incorporation number (dedup key)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS entity_type          VARCHAR(100);  -- e.g. "Private Limited Company", "Business Name"
ALTER TABLE customers ADD COLUMN IF NOT EXISTS registration_status  VARCHAR(100);  -- e.g. "Registered", "Pending Annual Return"
ALTER TABLE customers ADD COLUMN IF NOT EXISTS registered_address   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS incorporation_date   DATE;

-- Non-unique indexes only — pre-existing customers rows may already share
-- values, so a UNIQUE constraint here would risk failing on real data.
-- Dedup is enforced in application code (select-then-insert/update inside
-- one transaction), not the DB.
CREATE INDEX IF NOT EXISTS customers_tenant_registry_number ON customers (tenant_id, registry_number) WHERE registry_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_tenant_source          ON customers (tenant_id, source);
