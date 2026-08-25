-- Migration 328: M18 of the standalone Projects app — recurring tasks, the
-- smallest real slice of "automation" (not a conditional-routing/rules
-- engine). A recurring task is its own anchor: when recurrence_rule is set
-- and recurrence_next_due arrives, the daily job clones a fresh real task
-- (without the rule, so the clone itself doesn't recur) and advances this
-- row's own next_due — same shape as a recurring calendar event's master
-- row, just simpler (daily/weekly/monthly only, no byWeekday/count/until
-- for v1).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_next_due DATE;
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_next_due ON tasks(recurrence_next_due) WHERE recurrence_rule IS NOT NULL;
