-- Real cross-app meeting linking: a calendar event, a task, or a note can
-- all attach a video call — the same "Add video call" capability
-- calendar_events already had (343_calendar_video_meeting.sql), now shared
-- by tasks and notes too, and everywhere upgraded to carry a real FK to the
-- Bliss meeting it points at (368_bliss_guest_join.sql's guest_join_enabled
-- and the rest of the meeting-security settings live there) rather than
-- only ever being a bare URL string. meeting_url is kept as the actual
-- source of truth for "what to open" — it's the one representation that
-- also covers the Jitsi fallback (a tenant not entitled to Bliss, or a
-- failed create call), which has no bliss_meetings row to point a FK at.
-- bliss_meeting_id is null for a Jitsi link, set for a real Bliss meeting —
-- the machine-readable half genuine cross-app queries (and the meeting
-- room's own "what is this linked to" panel) need.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS bliss_meeting_id UUID NULL REFERENCES bliss_meetings(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS meeting_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS meeting_settings JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bliss_meeting_id UUID NULL REFERENCES bliss_meetings(id) ON DELETE SET NULL;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS meeting_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS meeting_settings JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bliss_meeting_id UUID NULL REFERENCES bliss_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_bliss_meeting ON calendar_events(bliss_meeting_id) WHERE bliss_meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_bliss_meeting ON tasks(bliss_meeting_id) WHERE bliss_meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_bliss_meeting ON notes(bliss_meeting_id) WHERE bliss_meeting_id IS NOT NULL;
