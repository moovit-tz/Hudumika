-- Migration 321: M9 of the standalone Projects app needs a real start date
-- to draw a Gantt bar (start -> due) — tasks only ever had `due` before
-- this. Nullable: a task with no explicit start still renders (as a
-- point-in-time marker at `due` on the Gantt, handled in the frontend),
-- it just doesn't get a real span. Shared by both Tasks and Projects (same
-- `tasks` table), so Tasks' own to-do view can use it too if it ever wants to.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;
