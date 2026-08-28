-- Calls (1:1 + group meetings) relocates from NexusHR to Bliss, matching the
-- precedent Chat.tsx already set (moved from ClearOS into Bliss) and the
-- "Bliss is the platform's Teams-equivalent comms hub" direction — every app
-- that needs calling pulls it from here rather than owning its own copy.
-- A rename preserves indexes, RLS policies, triggers, FKs and all existing
-- data untouched; only the name changes.

ALTER TABLE hr_calls RENAME TO bliss_calls;
ALTER TABLE hr_meetings RENAME TO bliss_meetings;
ALTER TABLE hr_meeting_participants RENAME TO bliss_meeting_participants;
