-- Pull real, already-entered notes content from across the platform into
-- the centralized notes app (265_notes_app.sql), so a tenant's existing
-- notes actually show up there instead of only starting from zero.
--
-- A one-time COPY, not a move or a live sync: every source field below
-- (customers.notes, leads.notes, ...) keeps working exactly as it does
-- today on its own page — this only adds a second, independently-editable
-- copy into the Notes app, tagged back to where it came from via
-- subject_type/subject_id. Deleting/blanking the originals would break
-- real, actively-used "Notes" tabs on Customers/Leads/Contacts/Billing;
-- that was never asked for and isn't done here.
--
-- Scope, decided from a real inventory of every notes-shaped column in the
-- schema, not a guess:
--   Migrated  — customers.notes, leads.notes, contacts.notes, invoice_notes
--               (a real authored thread — the one source with genuine
--               per-entry authorship, preserved as-is), quotations.notes,
--               shipment_cases.internal_notes, supplier_bills.notes,
--               purchase_orders.notes, suppliers.notes,
--               comply_applications.notes, delivery_documents.discrepancy_notes.
--   Skipped   — shipment_notes/task_comments (real thread tables with a
--               full CRUD API but genuinely zero frontend wiring — dead
--               schema, nothing real to pull), sales_invoices.notes
--               (hardcoded blank on every save in Billing.tsx — dead in
--               practice), hr_candidates/hr_contracts/hr_payroll/
--               seal_equipment.notes (typed but never rendered anywhere),
--               and the per-day HR attendance/time-entry/interview note
--               columns (structured field annotations on thousands of
--               rows, not freestanding notes — migrating those would flood
--               the Notes app with noise, not "capture" anything useful).
--
-- No author identity exists for any of the single-TEXT-column sources
-- (customers/leads/contacts/etc. track who's *assigned*, not who wrote the
-- notes field) — created_by is left NULL for those rather than guessing an
-- owner from an unrelated column. Only invoice_notes carries a real
-- author_id, which is preserved.

ALTER TABLE notes ALTER COLUMN created_by DROP NOT NULL;

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Customer note — ' || name, notes, 'customer', id, updated_at, updated_at
FROM customers WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Lead note — ' || company, notes, 'lead', id, updated_at, updated_at
FROM leads WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Contact note — ' || first_name || COALESCE(' ' || last_name, ''), notes, 'contact', id, updated_at, updated_at
FROM contacts WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, author_id::uuid, 'Invoice note', content, 'invoice', invoice_id, created_at, created_at
FROM invoice_notes;

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Quotation note — ' || quote_number, notes, 'quotation', id, updated_at, updated_at
FROM quotations WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Shipment note — ' || ref_number, internal_notes, 'shipment', id, updated_at, updated_at
FROM shipment_cases WHERE internal_notes IS NOT NULL AND btrim(internal_notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Bill note — ' || bill_number, notes, 'supplier_bill', id, updated_at, updated_at
FROM supplier_bills WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Purchase order note — ' || po_number, notes, 'purchase_order', id, updated_at, updated_at
FROM purchase_orders WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Supplier note — ' || name, notes, 'supplier', id, updated_at, updated_at
FROM suppliers WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id::uuid, NULL::uuid, 'Compliance note — ' || app_number, notes, 'comply_application', id, updated_at, updated_at
FROM comply_applications WHERE notes IS NOT NULL AND btrim(notes) <> '';

INSERT INTO notes (tenant_id, created_by, title, content, subject_type, subject_id, created_at, updated_at)
SELECT tenant_id, NULL::uuid, 'Delivery discrepancy — ' || COALESCE(doc_number, doc_type), discrepancy_notes, 'delivery_document', id, updated_at, updated_at
FROM delivery_documents WHERE discrepancy_notes IS NOT NULL AND btrim(discrepancy_notes) <> '';
