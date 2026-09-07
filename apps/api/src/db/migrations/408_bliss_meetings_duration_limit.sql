-- Meeting Center had no concept of a maximum meeting length at all — a
-- meeting stayed 'ACTIVE' forever until someone manually ended it. Real
-- video platforms (Teams free/basic tier is the concrete reference here)
-- enforce a duration cap per meeting and auto-end it once reached, warning
-- participants first. max_duration_minutes is set at creation time (from
-- the tenant's configured default, or a value the host picked when
-- scheduling) and meeting-duration-limit.job.ts sweeps for and ends any
-- ACTIVE meeting whose started_at + max_duration_minutes has passed.
ALTER TABLE bliss_meetings ADD COLUMN IF NOT EXISTS max_duration_minutes INTEGER NOT NULL DEFAULT 60;
-- Real reason for how a meeting ended — surfaced to participants (see
-- calls.routes.ts's endMeetingRow) so "the host ended this" and "this hit
-- its time limit" read as genuinely different events, not the same generic
-- notice with a guessed cause.
ALTER TABLE bliss_meetings ADD COLUMN IF NOT EXISTS end_reason VARCHAR(20);
