-- 502_supplier_bills_cascade.sql
-- Same gap as 500/501 (a tenant that ever recorded a supplier bill could not
-- be deleted). Found by finance-document-filing-job.test.ts's tenant cleanup.
-- The remaining tenant_id FKs without ON DELETE CASCADE are still flagged for
-- a dedicated review (see 501).
ALTER TABLE supplier_bills DROP CONSTRAINT IF EXISTS fk_supplier_bills_tenant;
ALTER TABLE supplier_bills ADD CONSTRAINT fk_supplier_bills_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
