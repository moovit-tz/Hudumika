-- TRA VFD fixes: store submitted totals so Z-reports can report real figures
-- instead of recomputing (or worse, hardcoding zero) at report time.

-- Cumulative monetary total ever fiscalized for this tenant (Z-report GROSSTOTAL).
-- Distinct from `gc`, which is a receipt *count*, not a currency amount.
ALTER TABLE tra_vfd_config
  ADD COLUMN IF NOT EXISTS gross_total NUMERIC(18,2) DEFAULT 0;

-- The tax-inclusive total that was actually submitted to TRA for this invoice.
-- Used to sum a day's real sales for the nightly Z-report.
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS tra_total_incl NUMERIC(15,2);
