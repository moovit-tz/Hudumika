-- Migration 076: real backend for the FinOps "Expenses" page.
-- Tenant-scoped, NOT shipment-scoped — unlike the existing `expenses` table
-- (shipment_id NOT NULL, used by ShipmentDetail's Ledger tab), this covers
-- general costs/revenue that may optionally link to a shipment/customer/supplier.
CREATE TABLE IF NOT EXISTS finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(50) NOT NULL,
  shipment_id UUID, -- no FK: shipment_cases is partitioned by created_at (PK is (id, created_at)), so plain `id` can't be an FK target — same reason the existing `expenses` table's shipment_id has no FK either
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  payment_mode VARCHAR(50),
  reference VARCHAR(255),
  note TEXT,
  is_revenue BOOLEAN NOT NULL DEFAULT false,
  attachment_data TEXT,
  efd_verified BOOLEAN,
  efd_verified_at TIMESTAMPTZ,
  efd_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_tenant ON finance_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_shipment ON finance_expenses(shipment_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_customer ON finance_expenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_supplier ON finance_expenses(supplier_id);
