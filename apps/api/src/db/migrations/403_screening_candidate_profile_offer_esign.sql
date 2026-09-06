-- Three of the items the readiness report left explicitly open, now closed:
--
-- 1. Structured screening — an application's SCREENING stage used to be
--    just that label, with no score, pass/fail, or disqualification reason
--    behind it (rejected_reason, added in migration 399, already covers the
--    general "why this application ended" case and is reused here rather
--    than duplicated).
-- 2. A candidate's résumé, cover letter, skills and education — none of
--    which existed anywhere on hr_candidates.
-- 3. A real, signable offer letter — reusing the platform's own eSign app
--    (sign_envelopes/sign_recipients, migration 267) rather than a second,
--    parallel document/signature system. sign_recipients already supports
--    an external, non-login signer by design ("may be external, so no
--    users FK") — exactly the candidate case, and its own signing token
--    gives a candidate a real link to view and sign an offer without this
--    platform needing to invent a candidate login system to do it.

ALTER TABLE hr_applications ADD COLUMN IF NOT EXISTS screening_score NUMERIC(5,2);
ALTER TABLE hr_applications ADD COLUMN IF NOT EXISTS screening_passed BOOLEAN;
ALTER TABLE hr_applications ADD CONSTRAINT hr_applications_screening_score_range
  CHECK (screening_score IS NULL OR (screening_score >= 0 AND screening_score <= 100));

ALTER TABLE hr_candidates ADD COLUMN IF NOT EXISTS resume_storage_key TEXT;
ALTER TABLE hr_candidates ADD COLUMN IF NOT EXISTS resume_filename TEXT;
ALTER TABLE hr_candidates ADD COLUMN IF NOT EXISTS cover_letter TEXT;
ALTER TABLE hr_candidates ADD COLUMN IF NOT EXISTS skills TEXT;
ALTER TABLE hr_candidates ADD COLUMN IF NOT EXISTS education TEXT;

ALTER TABLE hr_offers ADD COLUMN IF NOT EXISTS sign_envelope_id UUID REFERENCES sign_envelopes(id) ON DELETE SET NULL;
