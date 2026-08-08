-- The rest of what was pointed at nobody.
--
-- An audit of every hr_* table found a clean split. Every table that holds data
-- keys on `users`: attendance (240 rows), login history (323), devices (26),
-- leaves, payroll, goals, tasks. Every table that is empty and has a person on
-- it keys on `hr_employments`, which itself keys on `hr_people`, and both hold
-- zero rows because nothing in the product ever creates one.
--
--   hr_assets           assigned_to  -> hr_employments      0 rows
--   hr_documents        person_id    -> hr_people           0 rows
--                       employment_id-> hr_employments
--   hr_feedback_notes   sender_id    -> hr_employments      0 rows
--                       recipient_id -> hr_employments
--   hr_compensations    employment_id-> hr_employments      0 rows
--
-- That is not a coincidence, it is the diagnosis: Documents and Assets are both
-- pages in the NexusHR sidebar, and neither can assign anything to anybody,
-- because the list of people to assign to is empty and always has been.
--
-- Repointed to `users`, as performance was in migration 200. hr_employments and
-- hr_employment_effective_records are left alone — that is the richer model
-- itself, and it should either be adopted properly or removed on purpose, not
-- routed around twice and then forgotten.

-- ── Assets ────────────────────────────────────────────────────────────────
ALTER TABLE hr_assets DROP CONSTRAINT IF EXISTS hr_assets_assigned_to_fkey;
ALTER TABLE hr_assets
  ADD CONSTRAINT hr_assets_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

-- An asset out on loan needs a date, or nobody can tell how long they have had
-- it. Returned without an assignment is meaningless the other way.
ALTER TABLE hr_assets DROP CONSTRAINT IF EXISTS hr_assets_assignment_dated;
ALTER TABLE hr_assets ADD CONSTRAINT hr_assets_assignment_dated
  CHECK (assigned_to IS NULL OR assigned_date IS NOT NULL);

CREATE INDEX IF NOT EXISTS hr_assets_holder ON hr_assets (tenant_id, assigned_to);

-- ── Documents ─────────────────────────────────────────────────────────────
-- Two columns for one relationship, one of them to a table with no rows.
-- person_id becomes the user; employment_id is dropped rather than repointed,
-- because a document belongs to a person, not to a contract, and keeping a
-- second nullable owner column invites the two to disagree.
ALTER TABLE hr_documents DROP CONSTRAINT IF EXISTS hr_documents_person_id_fkey;
ALTER TABLE hr_documents DROP CONSTRAINT IF EXISTS hr_documents_employment_id_fkey;
ALTER TABLE hr_documents DROP COLUMN IF EXISTS employment_id;
ALTER TABLE hr_documents RENAME COLUMN person_id TO user_id;
ALTER TABLE hr_documents
  ADD CONSTRAINT hr_documents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS hr_documents_owner ON hr_documents (tenant_id, user_id);

-- ── Feedback ──────────────────────────────────────────────────────────────
ALTER TABLE hr_feedback_notes DROP CONSTRAINT IF EXISTS hr_feedback_notes_sender_id_fkey;
ALTER TABLE hr_feedback_notes DROP CONSTRAINT IF EXISTS hr_feedback_notes_recipient_id_fkey;
ALTER TABLE hr_feedback_notes
  ADD CONSTRAINT hr_feedback_notes_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT hr_feedback_notes_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;

-- Feedback to yourself is not feedback.
ALTER TABLE hr_feedback_notes DROP CONSTRAINT IF EXISTS hr_feedback_notes_not_self;
ALTER TABLE hr_feedback_notes ADD CONSTRAINT hr_feedback_notes_not_self
  CHECK (sender_id IS DISTINCT FROM recipient_id);

-- ── Compensation history ──────────────────────────────────────────────────
-- users.basic_salary is what payroll reads today, and it holds one value with
-- no history. This becomes the record of what that value was and when it
-- changed, keyed on the person rather than a contract that does not exist.
ALTER TABLE hr_compensations DROP CONSTRAINT IF EXISTS hr_compensations_employment_id_fkey;
ALTER TABLE hr_compensations RENAME COLUMN employment_id TO user_id;
ALTER TABLE hr_compensations
  ADD CONSTRAINT hr_compensations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS hr_compensations_person
  ON hr_compensations (tenant_id, user_id, effective_date);
