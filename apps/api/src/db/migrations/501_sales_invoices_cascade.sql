-- 501_sales_invoices_cascade.sql
-- Same gap as migration 500's invoice_sequences fix, found the same way
-- (a throwaway test tenant that had created a real invoice could not be
-- deleted at all). A broader sweep turned up 16 more tenant_id foreign keys
-- across the schema with the same NO ACTION/SET NULL default instead of
-- CASCADE (accounting_entities, carriers, freight_bookings, payment_methods,
-- platform_support_tickets, subscription_invoices, supplier_bills, ...) —
-- out of scope for this migration (some, like platform_activity_log's
-- SET NULL, may be a deliberate "keep the audit row, drop the tenant link"
-- choice, not obviously a bug the way this one is), flagged for a dedicated
-- pass rather than changed here without that review.
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS fk_sales_invoices_tenant;
ALTER TABLE sales_invoices ADD CONSTRAINT fk_sales_invoices_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
