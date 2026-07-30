-- Migration 148: Railway Development Levy 1.5% → 2% of CIF.
--
-- Confirmed by the tenant against their own working landed-cost spreadsheet
-- ("Aleka Logistics: Shipping and Taxes Calculator"), which computes RDL at
-- "2% of CIF" on every client job it prices, and re-confirmed directly by the
-- account owner alongside the CPF (1%) and wharfage (1.6%) figures.
--
-- Every hs_codes row currently carries a uniform 1.50, so this is a blanket
-- update rather than a per-code correction. Guarded on `= 1.50` so it stays
-- idempotent and so any code that has since been set to a genuine
-- exemption/other rate is left alone.
--
-- NOT modelled here: real RDL exemptions do exist (the same spreadsheet
-- prices HS 3005.10.00 non-woven plaster at "0% of CIF"), but the tariff
-- table has no exemption data for any code today, so inventing a list would
-- be guesswork. Codes needing 0% should be set individually once that list
-- is sourced from TRA.

UPDATE hs_codes SET rdl_rate = 2.00, updated_at = NOW()
WHERE rdl_rate = 1.50;
