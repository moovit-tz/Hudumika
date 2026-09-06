-- Links a scheduled interview to a real event on the interviewer's own
-- calendar (calendar_events, migration 079) — the platform's actual
-- Calendar app, not a parallel notion of "the interview is on a calendar".
-- SET NULL on delete: if the calendar event is ever removed independently,
-- the interview row itself must survive.
ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL;
