ALTER TABLE supplier_return_credit_evidence
  ADD COLUMN bill_line_id UUID REFERENCES supplier_bill_lines(id) ON DELETE SET NULL;

CREATE INDEX supplier_return_credit_bill_line_idx
  ON supplier_return_credit_evidence(tenant_id, bill_id, bill_line_id)
  WHERE bill_line_id IS NOT NULL;
