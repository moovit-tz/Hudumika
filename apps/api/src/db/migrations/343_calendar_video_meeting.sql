-- "Add Hudumika Meet Video Conference" was a pure frontend mockup — the
-- button generated a fake https://meet.hudumika.tz/<random> string that was
-- never a real, joinable video call, and calendar_events never had a column
-- to hold it: eventCreateSchema/eventPatchSchema (tasks.routes.ts) didn't
-- accept meetingUrl/meetingSettings at all, so it never survived a page
-- reload even as inert data. Real fix backs it with a genuine, working
-- video service (Jitsi Meet — free, open-source, no API key required for
-- its public instance, the same "real self-hostable infra over a paid SDK"
-- choice this platform already made for Stirling-PDF) and gives it a real
-- column to persist to.

-- The room URL itself (https://meet.jit.si/<random-id>) — a real, joinable
-- Jitsi Meet room. Client-generates the id (crypto.randomUUID(), same
-- precedent calendarStore.ts's own row-id generation already uses) since
-- Jitsi rooms need no server-side "create" call — the room exists the
-- moment the first participant opens the link.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meeting_url TEXT;

-- Only two real, verifiable options — whether to join with camera/mic
-- already off — passed as Jitsi's own documented URL hash config
-- (#config.startWithVideoMuted=true&config.startWithAudioMuted=true) at
-- join time. The original mockup had five fabricated toggles (host
-- management, screen-share/reactions/chat permissions) with no mechanism
-- behind any of them — dropped rather than wired to unverifiable behavior.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meeting_settings JSONB;
