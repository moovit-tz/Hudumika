-- Migration 220: task close-out with attribution.
--
-- A completed shipment task can be formally *closed* — a final sign-off that
-- records who closed it and when, and locks the task from further edits until
-- it is reopened. Distinct from `status = 'complete'` (work finished): closing
-- is the accountable act, "I, this person, am signing this off", limited to the
-- assignee or a team lead (a senior-role user). NULL closed_at = still open.

ALTER TABLE shipment_tasks ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id);
ALTER TABLE shipment_tasks ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
