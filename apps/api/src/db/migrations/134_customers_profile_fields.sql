-- 134_customers_profile_fields.sql
-- The Customers Profile-edit form (Customers.tsx) has always collected
-- account_status, notes, address, website, city, country, vat_number,
-- import_license, preferred_port, freight_terms, commodity_type,
-- credit_days and client_type, but none of these existed as real columns.
-- notes/address were even in the PATCH whitelist already (customers.routes.ts),
-- so saving either one threw a real Postgres error the moment a user
-- actually typed something into them. The other nine fields were silently
-- dropped — "Save" returned 200 with nothing persisted.
--
-- account_status is the more serious case: the frontend sends the
-- capitalized 'Active'/'Inactive'/'Suspended' strings, but there was no
-- account_status column at all — the PATCH handler mapped it onto the
-- existing boolean `active` column via `body.account_status === 'active'`
-- (lowercase), which is never true for the frontend's actual capitalized
-- values. Every Suspend/Activate/bulk-status click therefore set
-- active = false regardless of which status was chosen — a real customer
-- was quietly deactivated by clicking "Mark as Active".
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'Active'
  CHECK (account_status IN ('Active', 'Inactive', 'Suspended'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS import_license VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_port VARCHAR(120);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS freight_terms VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS commodity_type VARCHAR(150);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_days INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS client_type VARCHAR(50);

-- Backfill account_status from the real, already-correct `active` boolean
-- for existing rows — the column DEFAULT above only applies going forward.
UPDATE customers SET account_status = CASE WHEN active THEN 'Active' ELSE 'Inactive' END;
