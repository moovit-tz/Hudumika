-- Digital Execution Seal, Phase 4 — PDF structural/metadata forensics.
-- sign_verifications.findings (424) already holds the OCR text-diff
-- result; this is a distinct, differently-shaped result (page counts,
-- metadata, active-content flags — see sign-forensic-structural.service.ts)
-- so it gets its own column rather than being mixed into the same array.
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS structural_findings JSONB;
