-- 736_shipment_job_charges_cost_bill_link.sql
-- Logistics P1 "charge" step, cost/AP side: shipment_job_charges already had
-- sell_invoice_id (a real FK proving a sell charge's invoice actually exists)
-- but no equivalent for the cost leg — cost_posted/cost_reference were just
-- client-settable free text with nothing to verify against. This column is
-- the missing half, mirroring sell_invoice_id exactly.

-- No ON DELETE clause (defaults to RESTRICT) — matching sell_invoice_id's
-- own FK exactly, so a billed charge can't be orphaned by deleting the bill
-- out from under it either.
ALTER TABLE shipment_job_charges
  ADD COLUMN IF NOT EXISTS cost_bill_id UUID REFERENCES supplier_bills(id);

CREATE INDEX IF NOT EXISTS idx_sjc_cost_bill ON shipment_job_charges(cost_bill_id);
