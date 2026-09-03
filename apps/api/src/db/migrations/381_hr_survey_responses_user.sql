-- Surveys & engagement backend existed with a real GET /surveys and
-- POST /surveys/:id/submit but no way to author a survey at all (no create
-- route existed), and hr_survey_responses had no user_id — so even a
-- non-anonymous survey (is_anonymous=false on the template) could never
-- actually attribute an answer to anyone, and nothing stopped the same
-- person submitting twice. This adds the identity column, populated only
-- for non-anonymous instances (an anonymous submission always writes NULL
-- here, regardless of who's actually signed in), and a partial unique
-- index so a named respondent can't double-submit the same instance.
-- Anonymous surveys keep no such guard by design — that's the accepted
-- tradeoff of anonymity, not a gap.
ALTER TABLE hr_survey_responses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_survey_responses_one_per_user
  ON hr_survey_responses(instance_id, user_id) WHERE user_id IS NOT NULL;
