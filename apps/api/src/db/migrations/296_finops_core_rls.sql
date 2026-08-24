-- 296_finops_core_rls.sql
--
-- While building M7 of the FinOps program (recurring invoices, sitting
-- directly alongside recurring_bills), a check of that table turned up
-- something the original audit never looked for: the CORE AR/AP document
-- tables themselves have zero row-level security. Not the newer satellite
-- tables (invoice_activity_log, customers, products all correctly have
-- RLS) — the actual invoices and bills:
--
--   sales_invoices, sales_invoice_lines, invoice_payments,
--   supplier_bills, supplier_bill_lines, bill_payments, recurring_bills,
--   suppliers, tax_codes, finance_expenses, purchase_orders,
--   purchase_order_lines, vat_periods
--
-- Every one of these confirmed relrowsecurity = false against the live
-- database. This is a materially bigger gap than 292_gl_core_rls.sql's
-- three tables: these are the actual financial documents, not just their
-- ledger postings. This migration closes the FinOps-owned slice of it —
-- the same finance module this whole program is about — using the exact
-- FORCE + NULLIF policy idiom as every other RLS retrofit this session.
--
-- This is NOT the whole platform. A live query at the time of writing
-- found 206 tables platform-wide with no RLS at all — that is a separate,
-- much larger initiative (the 240-242 hardening project's own follow-up,
-- already extended once by 245_onsite_rls.sql and now again by this
-- migration and 292) and deliberately out of scope here. Flagged for the
-- user, not silently expanded into.
--
-- Three of these tables have no tenant_id of their own (line-item children,
-- same shape as journal_lines) and need an EXISTS-based policy instead of
-- a direct column comparison:
--   sales_invoice_lines  -> sales_invoices.id   via invoice_id
--   supplier_bill_lines  -> supplier_bills.id   via bill_id
--   purchase_order_lines -> purchase_orders.id  via po_id

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_invoices', 'invoice_payments', 'supplier_bills', 'bill_payments',
    'recurring_bills', 'suppliers', 'tax_codes', 'finance_expenses',
    'purchase_orders', 'vat_periods'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;

ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sales_invoice_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sales_invoice_lines
      USING (EXISTS (
        SELECT 1 FROM sales_invoices si
        WHERE si.id = sales_invoice_lines.invoice_id
          AND si.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      ));
  END IF;
END $$;

ALTER TABLE supplier_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_bill_lines FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'supplier_bill_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON supplier_bill_lines
      USING (EXISTS (
        SELECT 1 FROM supplier_bills sb
        WHERE sb.id = supplier_bill_lines.bill_id
          AND sb.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      ));
  END IF;
END $$;

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'purchase_order_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON purchase_order_lines
      USING (EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = purchase_order_lines.po_id
          AND po.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      ));
  END IF;
END $$;
