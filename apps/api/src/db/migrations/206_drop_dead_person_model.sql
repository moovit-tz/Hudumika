-- Removes the person model nobody ever populated.
--
-- NexusHR carried two ideas of a person: `users`, and `hr_people` ->
-- `hr_employments`. An audit of all 44 hr_* tables found the correlation is
-- exact — every table with rows in it keys on `users`; every stranded one keys
-- on `hr_employments`. These four have never held a row in any tenant:
--
--   hr_people                        0
--   hr_employments                   0
--   hr_employment_effective_records  0
--   hr_legal_entities                0   (kept, see below)
--
-- The cost of leaving them was not disk. It was that real code kept being
-- written against them: the Employment Records page rendered entirely from
-- them and therefore showed nothing; the asset-assignment picker read "Nobody
-- has a contract yet" in every tenant; a whole payroll implementation computed
-- from them and could never produce a payslip; and `hr_compensations` had its
-- key repointed onto users in migration 201 while the service kept querying
-- `employment_id` — a column that no longer exists. That query would have
-- failed at runtime and never did, purely because the table it read was empty.
-- A dead model does not stay dead; it quietly absorbs effort.
--
-- What replaces them, all of which already exists and holds rows:
--   a person            -> users
--   an employment       -> hr_contracts (migration 205), which unlike
--                          hr_employments refuses a fixed-term contract with no
--                          end date
--   pay history         -> hr_compensations, keyed on user_id
--
-- hr_legal_entities is deliberately NOT dropped. It is empty too, but it
-- describes the employing company rather than the person, nothing about it was
-- broken, and it is the right home for a multi-entity tenant. Emptiness alone
-- is not the argument — being the wrong model is.

-- Dropped in dependency order. hr_employment_effective_records references
-- hr_employments twice (employment_id and manager_id), and hr_employments
-- references hr_people.
DROP TABLE IF EXISTS hr_employment_effective_records;
DROP TABLE IF EXISTS hr_employments;
DROP TABLE IF EXISTS hr_people;

-- Left behind by migration 201, which repointed the column and did not remove
-- the index that named the old one.
DROP INDEX IF EXISTS hr_compensations_employment_idx;
