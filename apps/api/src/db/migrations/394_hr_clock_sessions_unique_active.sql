-- hr_clock_sessions had only a plain partial index on
-- (tenant_id, user_id, status) WHERE status IN ('ACTIVE','ON_BREAK') — fast
-- to query, but nothing stopped two concurrent POST /v1/hr/clock-in/start
-- calls from each passing the "no existing active session" check before
-- either had inserted, creating two overlapping ACTIVE sessions for the same
-- person. syncAttendanceFromSessions() then summed both, inflating that
-- day's worked hours. A UNIQUE partial index makes the second INSERT fail
-- outright instead of silently succeeding — the app layer (hr.routes.ts's
-- POST /clock-in/start) now also takes an advisory lock so that failure
-- becomes a clean "already clocked in" response rather than a raw
-- constraint-violation error.
DROP INDEX IF EXISTS idx_hr_clock_sessions_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_clock_sessions_active_unique
  ON hr_clock_sessions(tenant_id, user_id) WHERE status IN ('ACTIVE', 'ON_BREAK');
