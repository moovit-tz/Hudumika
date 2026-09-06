-- An employee was never actually linked to a department or designation.
-- hr_departments and hr_designations existed as standalone CRUD lists (an
-- HR admin could create/edit/delete department names) with nothing on
-- `users` to point at them — GET /v1/hr/staff hardcoded `dept: ''` and
-- `designation: ''` for every single row because there was genuinely
-- nothing to join. Org Chart's own "department" is a disconnected free-text
-- label on org_chart_nodes, not this table either.
--
-- ON DELETE SET NULL, not RESTRICT or CASCADE — deleting a department must
-- never delete or silently corrupt the employees who were in it; it just
-- clears their assignment back to "unassigned", the same way a manager
-- leaving doesn't delete their reports.

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES hr_designations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_designation_id ON users(designation_id) WHERE designation_id IS NOT NULL;
