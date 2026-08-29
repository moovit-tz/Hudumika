-- Real breakout rooms. No new signaling mechanism needed: the existing
-- mesh room registry in calls.routes.ts (rooms: Map<`${tenant}:${roomKey}`,
-- ...>) is keyed by an arbitrary string, not specifically a meeting id — a
-- breakout room reuses the identical join-room/leave-room/room-peers relay
-- under the room key `${meetingId}::bo::${breakoutRoomId}`, so a participant
-- "moving" into a breakout room is just leaving one room key and joining
-- another with the same client code path already proven for the main room.

CREATE TABLE IF NOT EXISTS bliss_meeting_breakout_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id  UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bliss_breakout_rooms_meeting ON bliss_meeting_breakout_rooms(tenant_id, meeting_id);

ALTER TABLE bliss_meeting_breakout_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_breakout_rooms FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_breakout_rooms'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_breakout_rooms
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bliss_meeting_breakout_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  breakout_room_id  UUID NOT NULL REFERENCES bliss_meeting_breakout_rooms(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name         TEXT NOT NULL,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (breakout_room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bliss_breakout_assignments_room ON bliss_meeting_breakout_assignments(tenant_id, breakout_room_id);

ALTER TABLE bliss_meeting_breakout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_breakout_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_breakout_assignments'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_breakout_assignments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
