-- Purchase Orders and Delivery Notes

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  po_number     VARCHAR(100) NOT NULL,
  supplier_id   VARCHAR(100),
  supplier_name VARCHAR(300),
  status        VARCHAR(20) DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED')),
  order_date    DATE,
  expected_date DATE,
  currency      VARCHAR(5) DEFAULT 'TZS',
  subtotal      NUMERIC(15,2) DEFAULT 0,
  tax_amount    NUMERIC(15,2) DEFAULT 0,
  total         NUMERIC(15,2) DEFAULT 0,
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL,
  category      VARCHAR(100),
  qty           NUMERIC(10,2) DEFAULT 1,
  unit_price    NUMERIC(15,2) DEFAULT 0,
  tax_rate      NUMERIC(5,2) DEFAULT 0,
  tax_amount    NUMERIC(15,2) DEFAULT 0,
  line_total    NUMERIC(15,2) DEFAULT 0,
  received_qty  NUMERIC(10,2) DEFAULT 0,
  sort_order    INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  dn_number     VARCHAR(100) NOT NULL,
  invoice_id    UUID REFERENCES sales_invoices(id),
  customer_id   UUID,
  customer_name VARCHAR(300),
  delivery_date DATE,
  status        VARCHAR(20) DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','DISPATCHED','DELIVERED','RETURNED')),
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, dn_number)
);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dn_id         UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL,
  qty_ordered   NUMERIC(10,2) DEFAULT 0,
  qty_delivered NUMERIC(10,2) DEFAULT 0,
  unit          VARCHAR(50),
  notes         TEXT,
  sort_order    INT DEFAULT 0
);
