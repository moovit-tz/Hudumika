ALTER TABLE supplier_return_credit_evidence
  ADD COLUMN vat_code TEXT,
  ADD COLUMN vat_kind TEXT,
  ADD COLUMN vat_jurisdiction TEXT,
  ADD CONSTRAINT supplier_return_credit_vat_snapshot_check
    CHECK (
      (vat_code IS NULL AND vat_kind IS NULL AND vat_jurisdiction IS NULL)
      OR (vat_code IS NOT NULL AND vat_kind IS NOT NULL AND vat_jurisdiction IS NOT NULL)
    );

CREATE INDEX supplier_return_credit_vat_period_idx
  ON supplier_return_credit_evidence(tenant_id, credit_date, vat_jurisdiction)
  WHERE journal_entry_id IS NOT NULL AND vat_code IS NOT NULL;
