-- Zentra: feed it the platform's existing security logs, and make its
-- evidence hard to destroy.
--
-- 1. Sign-ins (password, OTP, magic link, SSO), Ondi identity events,
--    personal-data reads and file previews are already logged by their own
--    apps. An AFTER INSERT trigger copies each new row into Zentra's outbox,
--    so every code path that writes these logs feeds Zentra without changes.
--    A failure here never blocks the original write.
-- 2. zentra_audit_events becomes append-only: UPDATE is always refused;
--    DELETE only inside Zentra's own retention purge (which sets
--    zentra.allow_purge for its transaction) or when the tenant is deleted.
-- 3. Retention safety: a legal hold, and a shorter retention period that
--    only takes effect 30 days after it is requested.

-- ── 1. Feeds ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zentra_bridge_log() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_app text; v_name text; v_actor text; v_rtype text; v_rid text;
  v_action text; v_outcome text := 'success'; v_summary text; v_meta jsonb := '{}'::jsonb;
  v_ip text; v_ua text;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'hr_login_history' THEN
    v_app := 'workspace'; v_actor := NEW.user_id::text; v_rtype := 'session'; v_rid := NEW.user_id::text;
    v_ip := NEW.ip; v_ua := NEW.user_agent;
    IF NEW.status = 'SUCCESS' THEN v_name := 'auth.login'; v_action := 'login';
    ELSE v_name := 'auth.login_failed'; v_action := 'login'; v_outcome := 'denied'; END IF;
    v_summary := CASE WHEN v_outcome = 'denied' THEN 'Failed password sign-in' ELSE 'Signed in with a password' END;
    v_meta := jsonb_build_object('channel', 'password');

  ELSIF TG_TABLE_NAME = 'ondi_auth_events' THEN
    v_app := 'ondi'; v_actor := COALESCE(NEW.user_id::text, 'unknown'); v_rtype := 'identity';
    v_rid := COALESCE(NEW.user_id::text, 'unknown'); v_ip := NEW.ip; v_ua := NEW.user_agent;
    v_name := 'auth.' || left(NEW.event_type, 100); v_action := NEW.event_type;
    IF NEW.event_type ~ '(failed|denied|rejected|locked)' THEN v_outcome := 'denied'; END IF;
    v_summary := 'Ondi: ' || replace(NEW.event_type, '_', ' ');
    v_meta := jsonb_build_object('channel', COALESCE(NEW.metadata->>'via', 'ondi'),
                                 'reason_code', left(COALESCE(NEW.metadata->>'reason', ''), 60));

  ELSIF TG_TABLE_NAME = 'pii_access_log' THEN
    v_app := CASE WHEN NEW.data_domain = 'PAYROLL' THEN 'nexushr' ELSE 'workspace' END;
    v_actor := COALESCE(NEW.accessor_id::text, NEW.accessor_ref, 'unknown');
    v_name := 'pii.accessed'; v_action := 'read';
    v_rtype := CASE NEW.subject_table WHEN 'payroll_payslips' THEN 'payroll' WHEN 'users' THEN 'employee' ELSE left(NEW.subject_table, 64) END;
    v_rid := COALESCE(NEW.subject_record_id, NEW.subject_id::text, 'unknown');
    v_ip := NEW.ip; v_ua := NEW.user_agent;
    v_summary := 'Viewed ' || lower(NEW.sensitivity_level) || '-sensitivity ' || lower(NEW.data_domain) || ' data';
    v_meta := jsonb_build_object('count', COALESCE(array_length(NEW.fields_accessed, 1), 0),
                                 'status', NEW.sensitivity_level, 'reason_code', left(COALESCE(NEW.purpose, ''), 60));

  ELSIF TG_TABLE_NAME = 'cloud_file_access_log' THEN
    v_app := 'cloud'; v_actor := COALESCE(NEW.user_id::text, 'unknown'); v_rtype := 'file'; v_rid := NEW.file_id::text;
    v_name := 'file.' || left(COALESCE(NEW.action, 'accessed'), 60); v_action := COALESCE(NEW.action, 'read');
    v_ip := NEW.ip; v_ua := NEW.user_agent;
    v_summary := 'File ' || COALESCE(NEW.action, 'accessed') || COALESCE(' via ' || NEW.via, '');
    v_meta := jsonb_build_object('channel', COALESCE(NEW.via, 'app'));
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO zentra_event_outbox (tenant_id, app_id, event_name, payload, status, idempotency_key)
    VALUES (NEW.tenant_id, v_app, left(v_name, 128), jsonb_build_object(
        'actor_id', left(v_actor, 128), 'actor_ip', left(v_ip, 45), 'actor_user_agent', left(v_ua, 300),
        'resource_type', v_rtype, 'resource_id', left(v_rid, 128), 'action', left(v_action, 64),
        'outcome', v_outcome, 'correlation_id', NEW.id::text, 'safe_summary', v_summary,
        'safe_metadata', v_meta || jsonb_build_object('source', TG_TABLE_NAME)),
      'pending', 'log:' || TG_TABLE_NAME || ':' || NEW.id::text)
    ON CONFLICT (idempotency_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'zentra_bridge_log(%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zentra_feed ON hr_login_history;
CREATE TRIGGER zentra_feed AFTER INSERT ON hr_login_history FOR EACH ROW EXECUTE FUNCTION zentra_bridge_log();
DROP TRIGGER IF EXISTS zentra_feed ON ondi_auth_events;
CREATE TRIGGER zentra_feed AFTER INSERT ON ondi_auth_events FOR EACH ROW EXECUTE FUNCTION zentra_bridge_log();
DROP TRIGGER IF EXISTS zentra_feed ON pii_access_log;
CREATE TRIGGER zentra_feed AFTER INSERT ON pii_access_log FOR EACH ROW EXECUTE FUNCTION zentra_bridge_log();
DROP TRIGGER IF EXISTS zentra_feed ON cloud_file_access_log;
CREATE TRIGGER zentra_feed AFTER INSERT ON cloud_file_access_log FOR EACH ROW EXECUTE FUNCTION zentra_bridge_log();

-- ── 2. Append-only audit log ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zentra_audit_events_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'zentra_audit_events is append-only';
  END IF;
  -- DELETE: Zentra's retention purge, or the tenant itself being deleted.
  IF current_setting('zentra.allow_purge', true) = 'on'
     OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'zentra_audit_events is append-only';
END $$;

DROP TRIGGER IF EXISTS zentra_audit_events_append_only ON zentra_audit_events;
CREATE TRIGGER zentra_audit_events_append_only BEFORE UPDATE OR DELETE ON zentra_audit_events
  FOR EACH ROW EXECUTE FUNCTION zentra_audit_events_guard();

-- ── 3. Retention safety ──────────────────────────────────────────────────────
ALTER TABLE zentra_settings ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE zentra_settings ADD COLUMN IF NOT EXISTS retention_pending_days INT;
ALTER TABLE zentra_settings ADD COLUMN IF NOT EXISTS retention_pending_at TIMESTAMPTZ;
