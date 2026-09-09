-- Migration 432: Phase S4 — remote session, reusing Bliss's real meeting
-- infrastructure rather than a second video/session system.
--
-- Audited first, per the plan: Bliss already has a mature, real meeting
-- system (bliss_meetings/bliss_meeting_participants + waiting room, host
-- controls, guest_join_enabled for exactly the "external, no-account
-- affiant/certifier" case — 368_bliss_guest_join.sql), and — more directly
-- useful — a *cross-app meeting-link component already exists and is
-- already reused three times* (369_meeting_link_everywhere.sql, wired into
-- Calendar/Tasks/Notes via components/MeetingLinkPanel.tsx). Sign gets the
-- exact same two columns, same names, same semantics as that migration
-- already established for calendar_events/tasks/notes — not a fourth,
-- differently-shaped copy:
--   meeting_url       — the actual source of truth for "what to open";
--                        covers the Jitsi fallback for a tenant without
--                        Bliss (MeetingLinkPanel's own !hasBliss branch),
--                        which has no bliss_meetings row to point a FK at.
--   bliss_meeting_id  — null for a Jitsi link, set for a real Bliss
--                        meeting — the machine-readable half.
-- No meeting_settings column: that field (Jitsi start-muted config) is
-- read only by the full Bliss room UI, never by MeetingLinkPanel itself,
-- and Sign has no equivalent "start muted" control to back it with.
ALTER TABLE sign_envelopes
  ADD COLUMN IF NOT EXISTS meeting_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS bliss_meeting_id UUID NULL REFERENCES bliss_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sign_envelopes_bliss_meeting ON sign_envelopes(bliss_meeting_id) WHERE bliss_meeting_id IS NOT NULL;
