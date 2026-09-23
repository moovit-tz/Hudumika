-- 500_invoice_sequences_cascade.sql
-- invoice_sequences.tenant_id (140_workspace_admin_features.sql) referenced
-- tenants(id) with no ON DELETE CASCADE, unlike every other tenant-scoped
-- table in this schema — any tenant that had ever created an invoice,
-- quotation, or purchase order (i.e. every real tenant) could never be
-- deleted at all; DELETE FROM tenants would fail with a bare foreign-key
-- violation. Found via document-service-invoice-filing.test.ts's own
-- throwaway-tenant cleanup, not by inspection.
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_tenant_id_fkey;
ALTER TABLE invoice_sequences ADD CONSTRAINT invoice_sequences_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
