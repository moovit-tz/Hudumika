-- Migration 154: corrected ICD per-container rates.
--
-- Supplied directly by the account owner as fixes to figures the rate card
-- had wrong:
--
--   Customs Verification   20ft $70.00   40ft $150.00   (was 104.00 / 196.00)
--   Handling Charges       20ft $67.50   40ft $135.00   (was  87.80 / 163.02)
--
-- Applied to the generic (icd_operator_id IS NULL) card only. Operator-
-- specific cards are left alone deliberately: those hold rates negotiated
-- with a named ICD (PMM, AfriICD, HESU, Zamcargo) and overwriting them with
-- a generic figure would destroy real commercial data.
--
-- Guarded on the old value so the migration is idempotent and so a rate the
-- tenant has since edited by hand is not clobbered.

UPDATE clearos_rate_card_items SET rate_amount = 70.00, updated_at = NOW()
WHERE code = 'ICD_VERIFICATION' AND card = '20ft' AND icd_operator_id IS NULL AND rate_amount = 104.00;

UPDATE clearos_rate_card_items SET rate_amount = 150.00, updated_at = NOW()
WHERE code = 'ICD_VERIFICATION' AND card = '40ft' AND icd_operator_id IS NULL AND rate_amount = 196.00;

UPDATE clearos_rate_card_items SET rate_amount = 67.50, updated_at = NOW()
WHERE code = 'ICD_HANDLING' AND card = '20ft' AND icd_operator_id IS NULL AND rate_amount = 87.80;

UPDATE clearos_rate_card_items SET rate_amount = 135.00, updated_at = NOW()
WHERE code = 'ICD_HANDLING' AND card = '40ft' AND icd_operator_id IS NULL AND rate_amount = 163.02;
