-- 136_customer_documents.sql
-- The Customers Documents tab has always had a working upload control
-- (POST /v1/customers/:id/documents, multipart, drag-and-drop) but the
-- route never existed on the backend — every upload 404'd — and there was
-- no listing query at all, so the tab hardcoded an "No documents yet"
-- empty state regardless of what existed. Add the backing table.
CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_tenant ON customer_documents(tenant_id);
