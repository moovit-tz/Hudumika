-- Real Suppliers/Vendors registry — replaces the hardcoded SUPPLIER_MAP (Bills.tsx)
-- and vendorData.ts mock store (FinanceVendors.tsx) with a real, queryable table.

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(300) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address VARCHAR(500),
  city VARCHAR(150),
  country VARCHAR(150) DEFAULT 'Tanzania',
  tax_id VARCHAR(100),
  category VARCHAR(50) DEFAULT 'other',
  currency VARCHAR(10) DEFAULT 'TZS',
  payment_terms VARCHAR(20) DEFAULT 'net_30',
  status VARCHAR(20) DEFAULT 'active',
  bank_name VARCHAR(200),
  bank_account VARCHAR(100),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- Point the existing loosely-typed supplier_id columns at the real table.
-- These tables are zero rows tenant-wide today, so the type change is safe.
ALTER TABLE supplier_bills ALTER COLUMN supplier_id TYPE UUID USING NULLIF(supplier_id, '')::uuid;
ALTER TABLE supplier_bills ADD CONSTRAINT fk_supplier_bills_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders ALTER COLUMN supplier_id TYPE UUID USING NULLIF(supplier_id, '')::uuid;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE recurring_bills ALTER COLUMN supplier_id TYPE UUID USING NULLIF(supplier_id, '')::uuid;
ALTER TABLE recurring_bills ADD CONSTRAINT fk_recurring_bills_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- sales_invoices.customer_id has existed since migration 013 but was never
-- enforced or reliably populated by the invoice creation UI. Add the FK now
-- that invoice creation actually sets it.
ALTER TABLE sales_invoices ADD CONSTRAINT fk_sales_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
