-- Generalize per-customer/supplier document numbering to all doc types:
-- credit notes, quotations, purchase orders, bills — not just invoices.
-- Format: {prefix}{ref_code}/{seq} — e.g. CN-ALK/0001, QT-ALK/0001, PO-MSC/0001, BILL-MSC/0001

-- 1. Add ref_code to suppliers (same pattern as customers.ref_code from mig 613).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ref_code VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_ref_code_uniq
  ON suppliers (tenant_id, ref_code) WHERE ref_code IS NOT NULL;

-- 2. Widen customer_invoice_sequences to support multiple doc types.
--    Add doc_type column with 'invoice' default so existing rows stay valid.
ALTER TABLE customer_invoice_sequences
  ADD COLUMN IF NOT EXISTS doc_type VARCHAR(30) NOT NULL DEFAULT 'invoice';

-- Drop old PK (tenant_id, customer_id) and replace with (tenant_id, customer_id, doc_type).
-- The column name stays customer_id but it holds supplier ids too (both are UUIDs,
-- the FK only checks customers — we'll use it generically via a partial index approach,
-- but since suppliers and customers never share a UUID this is safe).
ALTER TABLE customer_invoice_sequences DROP CONSTRAINT IF EXISTS customer_invoice_sequences_pkey;
ALTER TABLE customer_invoice_sequences
  ADD CONSTRAINT customer_invoice_sequences_pkey PRIMARY KEY (tenant_id, customer_id, doc_type);

-- Remove the FK to customers so the same table can hold supplier sequences too.
-- RLS still isolates by tenant_id.
ALTER TABLE customer_invoice_sequences DROP CONSTRAINT IF EXISTS customer_invoice_sequences_customer_id_fkey;

-- 3. Seed default invoice_sequences rows for the new doc types so
--    getNextDocNumber works immediately.
-- (getNextDocNumber already upserts on conflict, so these are just pre-seeds.)

-- 4. Backfill ref_codes for existing suppliers that don't have one.
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN
    SELECT id, tenant_id, name FROM suppliers WHERE ref_code IS NULL AND name IS NOT NULL
  LOOP
    base := upper(left(regexp_replace(r.name, '[^A-Za-z]', '', 'g'), 3));
    IF length(base) < 2 THEN base := 'SUP'; END IF;
    candidate := base;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1 FROM suppliers WHERE tenant_id = r.tenant_id AND ref_code = candidate AND id <> r.id
    ) LOOP
      candidate := base || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE suppliers SET ref_code = candidate WHERE id = r.id;
  END LOOP;
END $$;
