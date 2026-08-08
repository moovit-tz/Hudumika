-- Remove the 8 unreachable invoices, then make the tenant key total.
--
-- Migration 183 added a NOT VALID foreign key on sales_invoices.tenant_id: it
-- stopped new orphans while deliberately leaving the existing ones alone,
-- because deleting someone's invoices is not a call a migration should make on
-- its own. It has now been made, explicitly, so this finishes the job.
--
-- What is being removed, and why it is safe:
--
--   * 8 invoices whose tenant_id matches no row in `tenants`, across two ids
--     (43651991-… and 60602bc2-…).
--   * No user belongs to either id, so nobody can authenticate into them.
--     Every query in the API filters by the caller's own tenant_id, which means
--     these rows are unreachable through any code path — they cannot appear in
--     a list, a report, a return or a total.
--   * They carry 46 invoice lines and 3 payment rows, which go with them.
--   * They have NO journal entries, so the general ledger is untouched and no
--     balance moves. That was checked before writing this, and it is the reason
--     a delete is acceptable here rather than a void: there is nothing posted
--     to reverse.
--
-- For the record, in case anyone ever needs to know what was here:
--
--   CLR-2026-0010 INV  Dodoma Agri Exports   Partial
--   CLR-2026-0014 INV  Moshi Tea Exporters   Overdue
--   CLR-2026-0019 INV  Arusha Supplies Ltd   Unpaid
--   CLR-2026-0023 INV  Dar Engineering Co.   Paid
--   CLR-2026-0024 INV  Mombasa Freight Ltd   Partial
--   CLR-2026-0027 INV  Tanga Cement Co.      Draft
--   CLR-2026-0028 INV  Karibu Traders Ltd    Draft
--   CLR-2026-0029 INV  Unknown Client        Draft

-- Children first — the foreign keys do not cascade.
DELETE FROM invoice_payments
 WHERE invoice_id IN (
   SELECT si.id FROM sales_invoices si
    WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id)
 );

DELETE FROM sales_invoice_lines
 WHERE invoice_id IN (
   SELECT si.id FROM sales_invoices si
    WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id)
 );

-- The remaining child tables (invoice_notes, invoice_tasks, invoice_reminders,
-- invoice_activity_log, delivery_notes) held nothing for these invoices, but
-- are cleared anyway so this migration is correct on any database it meets,
-- not only on the one it was written against.
DELETE FROM invoice_notes         WHERE invoice_id IN (SELECT si.id FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id));
DELETE FROM invoice_tasks         WHERE invoice_id IN (SELECT si.id FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id));
DELETE FROM invoice_reminders     WHERE invoice_id IN (SELECT si.id FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id));
DELETE FROM invoice_activity_log  WHERE invoice_id IN (SELECT si.id FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id));
UPDATE delivery_notes SET invoice_id = NULL
 WHERE invoice_id IN (SELECT si.id FROM sales_invoices si WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id));

DELETE FROM sales_invoices si
 WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = si.tenant_id);

-- With no orphans left, the key can be checked in full. From here Postgres
-- guarantees what the code always assumed: an invoice belongs to a tenant that
-- exists.
ALTER TABLE sales_invoices VALIDATE CONSTRAINT fk_sales_invoices_tenant;
