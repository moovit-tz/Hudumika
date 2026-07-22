-- 052_products.sql
-- Real Products & Services catalog, backing /finance/products (previously a
-- browser-only localStorage store) and the invoice line-item "add from
-- catalog" picker. id is a plain string (not UUID) so client-generated
-- friendly ids like "PRD-M5KX1J2" (already used by the frontend) work as-is.

CREATE TABLE products (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'service',   -- 'product' | 'service'
    description TEXT,
    category VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'each',
    sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'inactive'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_tenant_status ON products(tenant_id, status);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_products ON products
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
