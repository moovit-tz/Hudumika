-- Migration 431: Phase S9 — billing integration.
--
-- One column, no new ledger: a real line item (notary fee, verification
-- fee, consultant service) tied to a sign_envelopes id, created as a real
-- DRAFT sales_invoices row through the exact same shape
-- seal-billing.service.ts's generateStorageInvoice already established for
-- this exact problem (a domain event that should become a FinOps invoice) —
-- "invoice finalization (GL posting, accounting sync) stays entirely
-- inside FinOps's own POST /v1/invoices flow, not duplicated here."
--
-- No fee schedule is seeded or assumed here — Sign has no existing notary/
-- consultant rate card anywhere in this codebase, and inventing one would
-- be fabricated pricing data. The preparer types the real amount being
-- charged; this column only records which invoice resulted.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sign_envelopes_invoice_id_idx ON sign_envelopes(invoice_id) WHERE invoice_id IS NOT NULL;
