-- Performance was built against the wrong people table.
--
-- NexusHR carries two parallel models of a person. `users` holds the twenty
-- real staff and is what every working module keys on — attendance, leave,
-- payroll, tasks, and the identity endpoints. `hr_people` -> `hr_employments`
-- is a richer HR model with legal entities and employment history, and it holds
-- zero rows, because nothing in the product ever creates one.
--
-- Performance was wired to the empty one. A goal's owner is an hr_employments
-- id, a review instance names an hr_employments id, and the Performance page
-- fills its owner dropdown from GET /employments — which returns []. So no goal
-- could be created for anybody, and the tables were empty not because the
-- feature was unfinished but because it was pointed at nothing.
--
-- Repointed to `users`. That is where the platform has already decided the
-- employee record lives: hire_date, basic_salary, tax_residency and the
-- statutory identity numbers were all added to `users`, and the shared identity
-- layer reads from it. Two identity models is the shape of most of the defects
-- fixed this week, and keeping both would mean a person's goals could not
-- appear on the profile that shows their attendance and payslips.
--
-- Free to do now precisely because both tables are empty. It would not be later.
--
-- hr_people and hr_employments are left in place. They are unused rather than
-- wrong, and dropping a richer model in the same migration that routes around
-- it would destroy the option of adopting it properly.

ALTER TABLE hr_goals DROP CONSTRAINT IF EXISTS hr_goals_owner_id_fkey;
ALTER TABLE hr_goals
  ADD CONSTRAINT hr_goals_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

-- Renamed as well as repointed: a column called employment_id that holds a user
-- id is a trap for whoever reads it next.
ALTER TABLE hr_review_instances DROP CONSTRAINT IF EXISTS hr_review_instances_employment_id_fkey;
ALTER TABLE hr_review_instances RENAME COLUMN employment_id TO user_id;
ALTER TABLE hr_review_instances
  ADD CONSTRAINT hr_review_instances_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- One review per person per cycle. Without this a cycle can be generated twice
-- and every person ends up with two half-filled reviews.
CREATE UNIQUE INDEX IF NOT EXISTS hr_review_instances_one_per_person
  ON hr_review_instances (cycle_id, user_id);

CREATE INDEX IF NOT EXISTS hr_goals_owner_lookup
  ON hr_goals (tenant_id, owner_id, status);

-- A weight that means something. Weighted goals are how a final score is
-- computed, and a negative or absurd weight silently distorts it.
ALTER TABLE hr_goals DROP CONSTRAINT IF EXISTS hr_goals_weight_sane;
ALTER TABLE hr_goals ADD CONSTRAINT hr_goals_weight_sane
  CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));
