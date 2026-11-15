ALTER TABLE supplier_return_credit_evidence
  ADD COLUMN vat_recoverable BOOLEAN;

-- Before this migration, all posted credits with a VAT snapshot reversed recoverable VAT.
ALTER TABLE supplier_return_credit_evidence NO FORCE ROW LEVEL SECURITY;
UPDATE supplier_return_credit_evidence
SET vat_recoverable = TRUE
WHERE vat_code IS NOT NULL;
ALTER TABLE supplier_return_credit_evidence FORCE ROW LEVEL SECURITY;

ALTER TABLE supplier_return_credit_evidence
  ADD CONSTRAINT supplier_return_credit_vat_recoverability_check
    CHECK ((vat_code IS NULL) = (vat_recoverable IS NULL));
