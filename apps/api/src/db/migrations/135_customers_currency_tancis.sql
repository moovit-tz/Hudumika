-- 135_customers_currency_tancis.sql
-- The Customers Profile-edit form has a Currency select (defaultValue="TZS",
-- never wired to state/onValueChange) and a TANCIS Registration input (no
-- value/onChange at all) that render as if editable but persist nothing —
-- both were pure decoration with no backing column. Add real columns so
-- they can actually be wired up and saved.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'TZS';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tancis_number VARCHAR(100);
