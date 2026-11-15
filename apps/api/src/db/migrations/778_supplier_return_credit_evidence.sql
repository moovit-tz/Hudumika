CREATE TABLE supplier_return_credit_evidence (
  return_id UUID PRIMARY KEY REFERENCES purchase_order_returns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE RESTRICT,
  supplier_reference TEXT NOT NULL,
  credit_date DATE NOT NULL,
  net_amount NUMERIC(15,2) NOT NULL CHECK (net_amount > 0),
  tax_amount NUMERIC(15,2) NOT NULL CHECK (tax_amount >= 0),
  currency VARCHAR(10) NOT NULL,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX supplier_return_credit_bill_idx ON supplier_return_credit_evidence(tenant_id, bill_id);
ALTER TABLE supplier_return_credit_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_return_credit_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON supplier_return_credit_evidence
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
