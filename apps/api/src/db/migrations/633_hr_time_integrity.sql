-- All attendance writers (web, device, imports and sweeps) share the same
-- employee lock and approval boundary. Existing history is preserved.
CREATE OR REPLACE FUNCTION guard_hr_time_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record; conflicting boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(r.tenant_id::text), hashtext('clock-in:' || r.user_id::text));
  -- Tenant removal must still cascade through retained, approved history.
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = r.tenant_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM hr_timesheet_approvals a
    WHERE a.tenant_id = r.tenant_id AND a.user_id = r.user_id AND a.status = 'APPROVED'
      AND r.date BETWEEN a.period_start AND a.period_end) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_approved_period_locked', MESSAGE = 'Approved time is locked';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.date IS DISTINCT FROM NEW.date THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_time_identity_immutable', MESSAGE = 'Time record identity is immutable';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'hr_clock_sessions' THEN
   IF TG_OP <> 'DELETE' THEN
    IF NEW.clock_out_at IS NOT NULL AND NEW.clock_out_at < NEW.clock_in_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_time_chronology', MESSAGE = 'Invalid clock chronology';
    END IF;
    IF NEW.status <> 'CANCELLED' AND (NEW.status <> 'COMPLETED' OR NEW.worked_minutes IS NOT NULL) THEN
      SELECT EXISTS (SELECT 1 FROM hr_clock_sessions s WHERE s.tenant_id = NEW.tenant_id AND s.user_id = NEW.user_id AND s.id <> NEW.id
        AND s.status <> 'CANCELLED' AND (s.status <> 'COMPLETED' OR s.worked_minutes IS NOT NULL)
        AND s.clock_in_at < coalesce(NEW.clock_out_at, 'infinity'::timestamptz)
        AND coalesce(s.clock_out_at, 'infinity'::timestamptz) > NEW.clock_in_at) INTO conflicting;
      IF conflicting THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_sessions_overlap', MESSAGE = 'Attendance sessions overlap';
      END IF;
    END IF;
   END IF;
  END IF;
  IF TG_TABLE_NAME = 'hr_time_entries' THEN
   IF TG_OP <> 'DELETE' THEN
    IF NEW.ended_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM hr_time_entries e WHERE e.tenant_id = NEW.tenant_id AND e.user_id = NEW.user_id AND e.ended_at IS NULL AND e.id <> NEW.id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hr_one_open_time_entry', MESSAGE = 'A timer is already running';
    END IF;
    END IF;
   END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE TRIGGER hr_clock_integrity BEFORE INSERT OR UPDATE OR DELETE ON hr_clock_sessions FOR EACH ROW EXECUTE FUNCTION guard_hr_time_integrity();
CREATE TRIGGER hr_entry_integrity BEFORE INSERT OR UPDATE OR DELETE ON hr_time_entries FOR EACH ROW EXECUTE FUNCTION guard_hr_time_integrity();
CREATE TRIGGER hr_attendance_integrity BEFORE INSERT OR UPDATE OR DELETE ON hr_attendance FOR EACH ROW EXECUTE FUNCTION guard_hr_time_integrity();
CREATE INDEX IF NOT EXISTS idx_hr_open_time_employee ON hr_time_entries(tenant_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_approval_periods ON hr_timesheet_approvals(tenant_id, user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_hr_session_intervals ON hr_clock_sessions(tenant_id, user_id, clock_in_at, clock_out_at);

ALTER TABLE shipment_time_entries ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_shipment_time_employee_date ON shipment_time_entries(tenant_id, user_id, log_date);
