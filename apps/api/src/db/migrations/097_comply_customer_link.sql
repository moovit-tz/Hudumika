-- ============================================================
-- 097 — ComplyOS: link certificates / applications / obligations /
--        legal engagements to real CRM clients (customers table),
--        so a tenant can scope compliance work to a specific
--        subsidiary/client entity instead of only the tenant itself.
--        NULL customer_id = the tenant's own compliance (default).
-- ============================================================

ALTER TABLE comply_certificates       ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE comply_applications       ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE comply_obligations        ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE comply_legal_engagements  ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX comply_certs_customer      ON comply_certificates (tenant_id, customer_id);
CREATE INDEX comply_apps_customer       ON comply_applications (tenant_id, customer_id);
CREATE INDEX comply_obligs_customer     ON comply_obligations (tenant_id, customer_id);
CREATE INDEX comply_legal_eng_customer  ON comply_legal_engagements (tenant_id, customer_id);
