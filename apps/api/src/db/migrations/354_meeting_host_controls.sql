-- Real host controls + waiting room for Bliss meetings (Google Meet/Zoom/Teams
-- style): an optional join password, an admission queue the host works
-- through instead of anyone dialing straight in, meeting-wide chat/screen-share
-- locks, and co-hosts (a second role with the same in-meeting powers as the
-- host, short of ending the meeting for everyone or reassigning co-hosts).

ALTER TABLE bliss_meetings
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS waiting_room_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_disabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screen_share_disabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE bliss_meeting_participants
  ADD COLUMN IF NOT EXISTS camera_disabled BOOLEAN NOT NULL DEFAULT false;

-- Decoupled from bliss_meeting_participants (which is real attendance history
-- for the metrics dashboard) — a waiting-room row exists for someone who has
-- NOT attended yet, so stamping it into the participants table would either
-- fabricate a joined_at before admission or need a second nullable status
-- column bolted onto a table that means something else today.
CREATE TABLE IF NOT EXISTS bliss_meeting_waiting_room (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id    UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING / ADMITTED / REJECTED
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  UNIQUE (meeting_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_waiting_room_meeting ON bliss_meeting_waiting_room(tenant_id, meeting_id, status);

ALTER TABLE bliss_meeting_waiting_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_waiting_room FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_waiting_room'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_waiting_room
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
