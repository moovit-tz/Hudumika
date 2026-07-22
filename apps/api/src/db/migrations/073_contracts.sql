-- Migration 073: real contracts table. Contracts.tsx previously ran entirely
-- off a hardcoded SAMPLE array with no backend at all — "New Contract" had
-- no click handler and nothing was ever persisted.
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ref VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL,
  type VARCHAR(100) NOT NULL,
  value NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('ACTIVE', 'PENDING', 'EXPIRED', 'DRAFT')),
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
