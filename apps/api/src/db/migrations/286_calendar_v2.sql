-- Calendar events v2 — closing the gap against Google Calendar's core
-- feature set: recurrence, all-day/multi-day events, per-event color,
-- working reminders, and real guest invites tied to actual platform users
-- instead of free-text email strings. Builds on 079_tasks_calendar_app.sql
-- (original schema) and 285_tasks_calendar_rls.sql (RLS retrofit).

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false;
-- Overrides the category color when set — Google lets any single event
-- carry its own color independent of which calendar it's on.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS color TEXT;
-- A light custom recurrence model — {freq, interval, byWeekday?, until?,
-- count?} — rather than raw RFC5545 RRULE text. The app owns expansion
-- end-to-end (holiday-calendar.service.ts's own working-days logic is the
-- closest precedent for "this platform computes calendar math itself
-- rather than reaching for a library"), so JSON is simpler and safer to
-- read/write than parsing/generating RRULE strings by hand.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence JSONB;
-- Minutes-before-start to notify — an array so an event can carry more than
-- one lead time (e.g. a day before AND ten minutes before), same as Google.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_offsets INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Guests used to be a plain JSONB array of free-text email strings — no way
-- to tie one to a real platform user, notify them, or track whether they'd
-- actually accepted. Reshaped to real objects; existing string entries are
-- converted in place rather than dropped.
UPDATE calendar_events SET guests = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(g) = 'string'
      THEN jsonb_build_object('email', g #>> '{}', 'name', NULL, 'userId', NULL, 'status', 'pending')
      ELSE g
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(guests) AS g
)
WHERE jsonb_typeof(guests) = 'array' AND guests != '[]'::jsonb;

-- One-off exceptions to a recurring event — skip a single occurrence, or
-- override its time/title/description/location — without materializing the
-- whole series into individual rows (which would need an arbitrary cap for
-- a no-end-date series, and would turn "edit the whole series" into a mass
-- update instead of one row edit). Expansion happens on read
-- (calendar.service.ts), same shape as holiday-calendar.service.ts already
-- computing working days on the fly rather than storing every date.
CREATE TABLE IF NOT EXISTS calendar_event_overrides (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  description TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, occurrence_date)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_overrides_event ON calendar_event_overrides(event_id);

-- Which (event, occurrence, lead-time) reminders have already fired — the
-- guard that makes the reminder job idempotent per OCCURRENCE rather than
-- per event, so a weekly recurring event reminds every week, not once ever
-- (see notes-reminder.job.ts's reminder_notified_at for the single-event
-- version of this same problem; recurrence needs a row per occurrence
-- instead of one column since there is no single "the" start_at to guard).
CREATE TABLE IF NOT EXISTS calendar_event_reminder_sends (
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  occurrence_start TIMESTAMPTZ NOT NULL,
  offset_minutes INTEGER NOT NULL,
  tenant_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, occurrence_start, offset_minutes)
);

ALTER TABLE calendar_event_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_overrides FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'calendar_event_overrides'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON calendar_event_overrides
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE calendar_event_reminder_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_reminder_sends FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'calendar_event_reminder_sends'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON calendar_event_reminder_sends
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
