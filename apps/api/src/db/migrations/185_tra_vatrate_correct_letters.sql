-- The VATRATE letters, now confirmed against the spec.
--
-- Migration 183 made the <VATTOTALS> grouping letter configurable rather than
-- guessing it, and seeded it to reproduce the old hardcoded derivation:
--
--     const vatRate = taxCode === 1 ? 'A' : taxCode === 2 ? 'B' : 'C';
--
-- The TRA VFD API documentation (https://tra-docs.netlify.app/guide/api/, the
-- same source already cited at the top of tra.service.ts) states it exactly:
--
--   TAXCODE   1 = Standard Rate (18%)   2 = Special Rate (0%)
--             3 = Zero rated (0%)       4 = Special Relief (0%)
--             5 = Exempt (0%)
--
--   VATRATE   "Identifier of the Tax rate A= 18 (Standard Rate for VAT items)
--             B= 0 (Special Rate) C= 0 (Zero rated for Non-VAT items)
--             D= 0 (Special Relief for relieved items) E= 0 (Exempt items)"
--
-- So the letter tracks the TAXCODE one for one: 1->A, 2->B, 3->C, 4->D, 5->E.
-- The old derivation collapsed 3, 4 and 5 all onto C, which means every exempt
-- sale was reported to TRA inside the zero-rated VATTOTALS bucket. The per-item
-- TAXCODE was already correct, so the receipt itself was right; the totals
-- block grouping it was not.
--
-- Only rows still holding the seeded default are corrected. Anyone who has
-- already set a letter deliberately keeps it.

UPDATE tax_codes
   SET tra_vat_rate = CASE tra_tax_code
     WHEN 1 THEN 'A'
     WHEN 2 THEN 'B'
     WHEN 3 THEN 'C'
     WHEN 4 THEN 'D'
     WHEN 5 THEN 'E'
   END,
       updated_at = now()
 WHERE tra_tax_code IS NOT NULL
   AND tra_vat_rate IS DISTINCT FROM (CASE tra_tax_code
     WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' WHEN 4 THEN 'D' WHEN 5 THEN 'E' END)
   -- Only the ones migration 183 seeded, i.e. still on the old A/B/C shape.
   AND tra_vat_rate IN ('A', 'B', 'C');

COMMENT ON COLUMN tax_codes.tra_vat_rate IS
  'EFDMS <VATRATE> letter for the VATTOTALS grouping, per the TRA VFD API: '
  'A=standard 18%, B=special rate 0%, C=zero-rated 0%, D=special relief 0%, '
  'E=exempt 0%. Tracks tra_tax_code one for one.';
