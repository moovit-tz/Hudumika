-- Migration 305: Real reminders on Tasks — mirrors 265_notes_app.sql's
-- reminder_at + 282_notes_enterprise.sql's reminder_notified_at guard
-- exactly (see notes-reminder.job.ts), so task-reminder.job.ts can reuse
-- the identical fire-once-then-guard pattern.
ALTER TABLE tasks ADD COLUMN reminder_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN reminder_notified_at TIMESTAMPTZ;
