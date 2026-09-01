-- Guest (no-account) meeting join — Meet/Zoom/Teams-style "anyone with the
-- link" access, locked behind an explicit host opt-in plus the meeting's
-- existing password/waiting-room controls (migration 354). Off by default:
-- an existing meeting does not suddenly become externally joinable just
-- because this column now exists.
ALTER TABLE bliss_meetings
  ADD COLUMN IF NOT EXISTS guest_join_enabled BOOLEAN NOT NULL DEFAULT false;

-- A guest has no `users` row to point at, so user_id has to become optional
-- on both attendance tables. guest_name carries their typed display name in
-- its place — the CHECK keeps every row identifiable one way or the other,
-- the same "real, not fabricated" attendance history the comment on
-- migration 350 already promises, extended to cover a guest's real
-- attendance too rather than silently dropping it.
ALTER TABLE bliss_meeting_participants ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bliss_meeting_participants ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE bliss_meeting_participants
  ADD CONSTRAINT bliss_meeting_participants_identity_chk CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);

-- bliss_meeting_waiting_room already has user_name (used for host display
-- today; doubles as the guest's typed name). guest_token is what a guest's
-- browser polls its own admission status with, since it has no session
-- cookie to identify the row by the way a real user's user_id does —
-- unique so a token can be looked up as a row's sole real key. UNIQUE
-- (meeting_id, user_id) already tolerates multiple NULLs (Postgres treats
-- each NULL as distinct), so concurrent guest rows never collide on it.
ALTER TABLE bliss_meeting_waiting_room ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE bliss_meeting_waiting_room ADD COLUMN IF NOT EXISTS guest_token TEXT UNIQUE;
ALTER TABLE bliss_meeting_waiting_room
  ADD CONSTRAINT bliss_meeting_waiting_room_identity_chk CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL);
