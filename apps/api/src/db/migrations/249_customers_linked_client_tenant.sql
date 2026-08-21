-- AgencyHost M9 — bill an agency's own managed client through this platform.
--
-- Nothing today says "this exact customers row IS this exact tenant" — an
-- agency's customers record for one of its agency_managed_tenants clients
-- was indistinguishable from any other CRM row. Nullable, and deliberately
-- not a UNIQUE constraint here: uniqueness (one linked customer per client
-- tenant per agency) is enforced at the API layer, where it can also check
-- the caller actually manages that client via agency_managed_tenants —
-- a DB constraint alone can't express "and only if you manage them."
ALTER TABLE customers ADD COLUMN linked_client_tenant_id UUID REFERENCES tenants(id);
CREATE INDEX idx_customers_linked_client_tenant ON customers(linked_client_tenant_id) WHERE linked_client_tenant_id IS NOT NULL;
