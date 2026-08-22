-- Migration 279: Where a stamped invoice PDF lands once a financial manager
-- (or whoever clears the tenant's stamp-access gate) applies the company
-- stamp via the M6 cross-app stamp API — mirrors sign_envelopes'
-- stamped_file_url, same additive, nullable-until-used shape.

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS stamped_file_url TEXT;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS stamped_at TIMESTAMPTZ;
