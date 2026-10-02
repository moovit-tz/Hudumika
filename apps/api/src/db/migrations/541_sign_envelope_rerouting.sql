-- Migration 541: eSign — signer re-routing after a decline.
--
-- When a signer declines, the current behaviour voids the entire envelope
-- immediately.  This migration adds a new envelope lifecycle state
-- ('needs_rerouting') that lets the sender re-assign the declined slot
-- to a different person without having to void and start over.
--
-- Changes:
--   1. Add 'needs_rerouting' to the sign_envelope_status ENUM.
--   2. Add two audit columns to sign_recipients so the original signer's
--      identity is preserved when a recipient slot is reassigned.
--
-- Postgres does not allow removing ENUM values or re-ordering them, so
-- any new value added here is permanent.  'needs_rerouting' sorts after
-- 'voided' in the ENUM ordering (Postgres ADDs to the end unless BEFORE/
-- AFTER is specified; ordering has no semantic effect on application code —
-- our app checks the literal string value).

ALTER TYPE sign_envelope_status ADD VALUE IF NOT EXISTS 'needs_rerouting';

-- rerouted_at: set when a recipient row is reassigned to a new person.
-- previous_email / previous_name: the original signer's details, kept for
-- the audit trail (the sign_events table also records the rerouting, but
-- having the previous identity on the row itself makes forensic queries
-- simpler without a join on sign_events).
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS rerouted_at      TIMESTAMPTZ;
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS previous_email   TEXT;
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS previous_name    TEXT;
