-- Support.tsx's ticket detail panel had a "Technology" accordion showing a
-- hardcoded IP address, browser and device on every single ticket — no
-- capture ever fed it. Rather than delete the section, capture the real
-- thing: the requester's IP and User-Agent at the moment a ticket is
-- actually raised through a live HTTP request (POST /v1/support/tickets,
-- the Onsite org portal). Automation-raised tickets (SEAL, ClearOS,
-- Workflow Studio) have no browser at all — these stay NULL, and the UI
-- says so honestly rather than fabricating a fingerprint for a robot.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS origin_ip VARCHAR(64);
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS origin_user_agent TEXT;
