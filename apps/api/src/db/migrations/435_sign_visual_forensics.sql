-- Digital Execution Seal, Phase 5 — visual (pixel-level) forensics.
-- Trimmed summary only (page numbers + diff percentages, no embedded diff
-- images) — see sign-seal-verify.service.ts's comment at the insert site
-- for why the images themselves live elsewhere (the transient job result,
-- or a case's own durable evidence store), never in this permanent,
-- one-row-per-attempt table.
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS visual_findings JSONB;

-- A visual anomaly's own diff-highlight image becomes a real, durable
-- evidence row (not buried in JSON) when a case opens — widen the existing
-- source CHECK (429) to allow it. 'report' was already reserved there for
-- Phase 6's formal report output.
ALTER TABLE sign_forensic_evidence DROP CONSTRAINT IF EXISTS sign_forensic_evidence_source_check;
ALTER TABLE sign_forensic_evidence ADD CONSTRAINT sign_forensic_evidence_source_check
  CHECK (source IN ('canonical', 'uploaded', 'manifest', 'report', 'visual_diff'));
