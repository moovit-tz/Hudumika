-- Sales Invoices (customer-facing)
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  invoice_number VARCHAR(100) NOT NULL,
  shipment_ref VARCHAR(100),
  customer_id UUID,
  client_name VARCHAR(300),
  client_address JSONB DEFAULT '[]'::jsonb,
  bl_number VARCHAR(100),
  origin VARCHAR(300),
  destination VARCHAR(300),
  mode VARCHAR(10) DEFAULT 'SEA',
  bill_date DATE,
  due_date DATE,
  sale_agent VARCHAR(300),
  payment_terms TEXT,
  exchange_rate NUMERIC(12,4) DEFAULT 1,
  status VARCHAR(20) DEFAULT 'Draft',
  received NUMERIC(15,2) DEFAULT 0,
  version INT DEFAULT 1,
  ref_code VARCHAR(30),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  name VARCHAR(300) NOT NULL,
  unit VARCHAR(50) DEFAULT 'PER BIL',
  rate NUMERIC(15,2) DEFAULT 0,
  qty NUMERIC(10,2) DEFAULT 1,
  tax_pct NUMERIC(5,2) DEFAULT 0,
  line_group VARCHAR(20) DEFAULT 'other',
  currency VARCHAR(5) DEFAULT 'TZS',
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  method VARCHAR(50),
  payment_date DATE,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supplier Bills (vendor-facing)
CREATE TABLE IF NOT EXISTS supplier_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bill_number VARCHAR(100) NOT NULL,
  supplier_id VARCHAR(100),
  supplier_name VARCHAR(300),
  shipment_ref VARCHAR(100),
  po_number VARCHAR(100),
  bill_date DATE,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  currency VARCHAR(10) DEFAULT 'USD',
  subtotal NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  recurring_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'OTHER',
  qty NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(15,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bill_id UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_date DATE,
  method VARCHAR(50),
  reference VARCHAR(300),
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(300),
  supplier_id VARCHAR(100),
  supplier_name VARCHAR(300),
  frequency VARCHAR(20) DEFAULT 'MONTHLY',
  currency VARCHAR(10) DEFAULT 'USD',
  amount NUMERIC(15,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  category VARCHAR(50) DEFAULT 'OTHER',
  description TEXT,
  payment_terms VARCHAR(100),
  next_due DATE,
  end_date DATE,
  state VARCHAR(20) DEFAULT 'ACTIVE',
  bills_generated INT DEFAULT 0,
  total_spend NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant Settings (one row per tenant, JSONB blob)
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
