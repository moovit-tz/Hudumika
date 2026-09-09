-- Migration 439: birthday reminder dedup tracking. A birthday recurs every
-- year, so a plain notified_at timestamp (task/notes/calendar reminders'
-- own pattern) would suppress the reminder forever after the first year —
-- this stores which YEAR was last notified, checked against the current
-- year rather than "has this ever fired."
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday_notified_year INTEGER;
