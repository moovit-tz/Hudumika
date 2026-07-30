-- Migration 150: LCL minimum charges, from the customer's own Landed Cost
-- Model workbook ("Mode & Rate Card" tab, MIN CHARGE — LCL/AIR column).
--
-- LCL is billed per CBM, so a small consignment would otherwise compute a
-- couple of dollars of handling. These are the floors the workbook applies.
--
-- Scope and provenance, deliberately narrow:
--
--   * Only the 'sea' (LCL) card is touched. The workbook's Air minimums are
--     quoted in USD/kg, but our 'air' card is TZS-denominated and sourced
--     from a real airline invoice (Grape Seedlings job) — mixing a USD floor
--     into TZS per-kg rows would be arithmetically wrong, so Air is skipped.
--
--   * Only the four codes the workbook actually gives a floor for. Rows it
--     doesn't cover (ICD_REMOVAL, ICD_STORAGE, ICD_STRIPPING,
--     SHIP_CONSOLIDATION, CF_DOCUMENTATION) stay NULL = no floor, rather
--     than inventing one.
--
--   * CF_AGENCY_FEE is listed with a $0 minimum in the workbook, which means
--     "no floor applies", so it stays NULL rather than being set to 0 — a
--     literal 0 would be a real (zero) floor and read differently in the UI.
--
--   * The workbook labels its LCL column "rough estimates derived from the
--     20ft rate — placeholders only; replace with your freight forwarder's
--     actual LCL rate card". That caveat is recorded in each row's notes so
--     the provenance survives into the Rate Card UI, rather than these
--     passing as carrier-confirmed figures.
--
-- The per-CBM rate_amount values are NOT changed here: those already hold
-- real figures taken from the Aleka LCL invoice (Corridor 0.30, Handling
-- 7.00, Removal 2.00, Storage 2.00, Stripping 28.00), which are sourced
-- data and outrank the workbook's self-declared placeholders.

UPDATE clearos_rate_card_items AS t
SET min_charge = v.min_charge,
    notes = COALESCE(NULLIF(t.notes, ''), v.note),
    updated_at = NOW()
FROM (VALUES
  ('ICD_CORRIDOR',  1.20,  'Minimum charge from the Landed Cost Model workbook (Mode & Rate Card tab) — the workbook marks its LCL column as an estimate derived from the 20ft rate; confirm against your forwarder''s actual LCL rate card.'),
  ('ICD_HANDLING',  17.56, 'Minimum charge from the Landed Cost Model workbook (Mode & Rate Card tab) — the workbook marks its LCL column as an estimate derived from the 20ft rate; confirm against your forwarder''s actual LCL rate card.'),
  ('SHIP_DO_FEE',   4.26,  'Minimum charge from the Landed Cost Model workbook (Mode & Rate Card tab) — the workbook marks its LCL column as an estimate derived from the 20ft rate; confirm against your forwarder''s actual LCL rate card.'),
  ('SHIP_LINE_FEE', 29.45, 'Minimum charge from the Landed Cost Model workbook (Mode & Rate Card tab) — the workbook marks its LCL column as an estimate derived from the 20ft rate; confirm against your forwarder''s actual LCL rate card.')
) AS v(code, min_charge, note)
WHERE t.code = v.code
  AND t.card = 'sea'
  AND t.min_charge IS NULL;
