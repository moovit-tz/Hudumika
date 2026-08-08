-- Three loose ends, each one a guess or a gap left by the previous four
-- migrations.

-- ---------------------------------------------------------------------------
-- 1. The last hardcoded guess in the fiscalisation path.
-- ---------------------------------------------------------------------------
-- tra.service.ts now takes each line's TAXCODE straight from its tax code, so
-- the per-item figure is exact. The <VATTOTALS> grouping letter is still
-- derived in code:
--
--     const vatRate = taxCode === 1 ? 'A' : taxCode === 2 ? 'B' : 'C';
--
-- which buckets special relief (4) and exempt (5) together under C. Some EFDMS
-- specs give those their own letters. I could not confirm which applies to this
-- integration, and guessing a letter TRA may reject is worse than the coarser
-- bucket - so instead of guessing, the letter becomes data. A tenant holding
-- the actual spec sets it per code without a code change, and the default
-- reproduces exactly the behaviour that exists today.
ALTER TABLE tax_codes
  ADD COLUMN IF NOT EXISTS tra_vat_rate CHAR(1);

ALTER TABLE tax_codes DROP CONSTRAINT IF EXISTS tax_codes_tra_vat_rate_valid;
ALTER TABLE tax_codes ADD CONSTRAINT tax_codes_tra_vat_rate_valid
  CHECK (tra_vat_rate IS NULL OR tra_vat_rate ~ '^[A-E]$');

-- Seeded from the current derivation, so nothing changes until someone changes
-- it deliberately.
UPDATE tax_codes
   SET tra_vat_rate = CASE
     WHEN tra_tax_code = 1 THEN 'A'
     WHEN tra_tax_code = 2 THEN 'B'
     WHEN tra_tax_code IS NOT NULL THEN 'C'
     ELSE NULL
   END
 WHERE tra_vat_rate IS NULL;

COMMENT ON COLUMN tax_codes.tra_vat_rate IS
  'EFDMS <VATRATE> letter for the VATTOTALS grouping. Defaults reproduce the '
  'old hardcoded A/B/C derivation; set D or E per the spec if this '
  'integration distinguishes special relief and exempt.';


-- ---------------------------------------------------------------------------
-- 2. An invoice is not necessarily a sea freight invoice.
-- ---------------------------------------------------------------------------
-- `sales_invoices.mode` defaults to 'SEA'. Any invoice created without one -
-- a consulting fee, a storage charge, anything from a tenant that does not move
-- cargo at all - is silently recorded as sea freight. 14 of the 19 invoices
-- here carry 'SEA' and there is no way to tell which of those were chosen and
-- which were merely defaulted.
--
-- The column stays (the freight apps genuinely use it) but stops asserting
-- something nobody said. Existing values are untouched - overwriting them would
-- destroy the ones that were real.
ALTER TABLE sales_invoices ALTER COLUMN mode DROP DEFAULT;

COMMENT ON COLUMN sales_invoices.mode IS
  'Transport mode, for freight invoices. NULL means not applicable - it used to '
  'default to SEA, which asserted sea freight on every invoice that simply did '
  'not say.';


-- ---------------------------------------------------------------------------
-- 3. Stop new orphaned invoices.
-- ---------------------------------------------------------------------------
-- 8 invoices carry tenant_ids that exist in no `tenants` row, because nothing
-- ever constrained that column. They are unreachable: every query filters by
-- the caller's own tenant_id, and there is no user belonging to either of those
-- two ids, so nobody can authenticate into them. They are dead rows.
--
-- The constraint is added NOT VALID on purpose. That enforces every future
-- insert and update while leaving the existing 8 exactly where they are -
-- deleting someone's invoices is not a decision a migration should take on its
-- own, and the rows are harmless where they sit. Run
--   ALTER TABLE sales_invoices VALIDATE CONSTRAINT fk_sales_invoices_tenant;
-- once they have been dealt with, and the check becomes total.
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS fk_sales_invoices_tenant;
ALTER TABLE sales_invoices
  ADD CONSTRAINT fk_sales_invoices_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  NOT VALID;

-- supplier_bills has no orphans today, so its constraint can be valid outright.
ALTER TABLE supplier_bills DROP CONSTRAINT IF EXISTS fk_supplier_bills_tenant;
ALTER TABLE supplier_bills
  ADD CONSTRAINT fk_supplier_bills_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id);
