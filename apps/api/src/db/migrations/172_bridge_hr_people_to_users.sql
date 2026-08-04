-- Migration 172: connect the two person models NexusHR has been carrying.
--
-- The 47 hr_* tables split into two families that never meet:
--
--   keyed on users(id)          attendance, leave, PAYROLL, devices, shifts,
--                               teams, activity log, login history, invitations
--   keyed on hr_people(id) ->   employments, COMPENSATIONS, documents, assets,
--            hr_employments(id) goals, reviews, feedback notes
--
-- Everything the UI shows today is the first family. Everything the orphaned
-- /v1/hr/{people,employments,goals,...} endpoints serve is the second. There
-- was no column joining them, so the same employee could hold a payroll row
-- (users) and a compensation row (hr_employments) that nothing could reconcile
-- — two salaries for one person, both "true".
--
-- The bridge is one nullable, unique column. Nullable on purpose:
--   * a person can exist in HR before they are given a login (a new hire in
--     onboarding), and
--   * a user can exist with no HR record (a service account, or a SuperAdmin
--     administering the tenant).
-- Neither is an error, so neither is forced.
--
-- No backfill. Pairing an existing user with an HR person record is a claim
-- about a real human being, and guessing it from a name match is how two
-- people called J. Mwangi become one. The UI offers the link explicitly.

ALTER TABLE hr_people
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- One HR person per login, per tenant. Partial, so the many unlinked rows
-- during onboarding do not collide with each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS hr_people_user_unique
  ON hr_people (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_people_user ON hr_people (user_id) WHERE user_id IS NOT NULL;
