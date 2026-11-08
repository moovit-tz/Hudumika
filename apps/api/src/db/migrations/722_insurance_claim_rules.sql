-- Insurance P0 (industry-readiness backlog item 17): "coverage-date,
-- deductible and cumulative-exposure validation. Inspected fileClaim
-- checks active policy and one claim against sum insured, not the
-- complete rule set." Confirmed true — fileClaim() never checked the
-- incident date against the policy's own coverage window, never applied
-- the policy's own deductible to anything, and only checked ONE claim's
-- amount against sum_insured rather than the running total every
-- non-denied claim on the policy actually represents. These two columns
-- are what adjudicateClaim() needs to record a real, auditable net
-- payable figure instead of silently conflating "what the adjuster
-- approved" with "what the policy actually pays out".
ALTER TABLE finance_insurance_claims
  ADD COLUMN IF NOT EXISTS deductible_applied NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(18,2);
