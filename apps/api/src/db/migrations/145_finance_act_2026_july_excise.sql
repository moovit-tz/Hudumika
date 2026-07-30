-- Migration 145: Finance Act 2026 (July update) excise changes — TRA "Key
-- Changes to Customs Procedures" circular.
--
-- Applied: new 5% excise on motor vehicles with spark-ignition engine
-- capacity not exceeding 1,000cc — HS 8703.21 (EAC CET: "of a cylinder
-- capacity not exceeding 1,000 cc"), both the unassembled (.10) and
-- assembled (.90) sub-lines.
--
-- Deliberately NOT applied here (would need a data-model change, not a rate
-- tweak, to be correct — see customs.service.ts's Clause 15/PID comment for
-- the same "don't guess" rule this follows):
--   - Used-vehicle excise bands (18%/35%/40% by age 8-10/10-20/20+ years):
--     HS classification doesn't carry vehicle age or new-vs-used condition,
--     so this can't be represented as a flat hs_codes.excise_rate without
--     either (a) wrongly taxing new-vehicle imports at the used-vehicle rate,
--     or (b) needing a new age/condition input on the landed-cost calculator
--     that doesn't exist yet.
--   - 20% excise on "plastic or rubber clogs": our hs_codes rows under 6402
--     are coarse (6402.91/6402.99 "Other footwear"), not split down to a
--     clogs-specific 8-digit line — applying 20% to those would also tax
--     every other rubber/plastic sandal and slipper misclassified under the
--     same coarse code, not just clogs.
--
-- The Customs Processing Fee 0.6%→1% change from this same Finance Act is
-- already reflected (hs_codes.cpf_rate default and the calculateLandedCost
-- fallback were updated in an earlier session).

UPDATE hs_codes SET excise_rate = 5.00, updated_at = NOW()
WHERE code IN ('8703.21.10', '8703.21.90') AND excise_rate = 0;
