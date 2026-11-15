ALTER TABLE supplier_bills
  ADD COLUMN credited_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credited_amount >= 0);

ALTER TABLE supplier_return_credit_evidence
  ADD COLUMN journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT;
