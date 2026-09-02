-- Device Management as a first-class module (not buried inside Attendance) —
-- a device registry + provider abstraction, starting with a real ZKTeco ADMS
-- push-protocol adapter. Punches land here first, then get reconciled into
-- the EXISTING hr_clock_sessions/hr_attendance pipeline (hr.routes.ts's
-- syncAttendanceFromSessions) rather than a parallel attendance system —
-- hr_attendance.method already had a 'BIOMETRIC' value with nothing writing
-- it (migration 202), and reliability-signals.ts already reads hr_attendance
-- for Ondi's Personal trust score, so real device data reaches Ondi with no
-- new wiring there.

CREATE TABLE IF NOT EXISTS attendance_devices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider           VARCHAR(30) NOT NULL DEFAULT 'zkteco',
  name               VARCHAR(200) NOT NULL,
  -- Globally unique (not tenant-scoped): a physical device has no notion of
  -- "tenant" until the unauthenticated ingest endpoint looks up which one
  -- registered this serial. That lookup is the one legitimate cross-tenant
  -- query in this module (via dbPlatform), same carve-out CLAUDE.md documents
  -- for narrow, audited platform call sites.
  serial_number      VARCHAR(100) NOT NULL UNIQUE,
  push_token         VARCHAR(64) NOT NULL,
  location           VARCHAR(200),
  status             VARCHAR(20) NOT NULL DEFAULT 'unregistered'
                        CHECK (status IN ('unregistered', 'online', 'offline', 'error')),
  last_heartbeat_at  TIMESTAMPTZ,
  last_sync_at       TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_devices_tenant ON attendance_devices(tenant_id);

CREATE TABLE IF NOT EXISTS attendance_device_enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     UUID NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The device's own local user ID (assigned when a fingerprint/face/card is
  -- enrolled on the unit itself) — not our internal user UUID. Every raw
  -- punch arrives tagged with this, and this table is the only place that
  -- maps it back to a real employee.
  external_pin  VARCHAR(50) NOT NULL,
  method        VARCHAR(20) NOT NULL DEFAULT 'fingerprint'
                  CHECK (method IN ('fingerprint', 'face', 'card', 'pin')),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, external_pin)
);
CREATE INDEX IF NOT EXISTS idx_attendance_device_enrollments_tenant ON attendance_device_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_device_enrollments_user   ON attendance_device_enrollments(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS attendance_device_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     UUID NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
  external_pin  VARCHAR(50) NOT NULL,
  -- NULL = no matching enrollment yet — an orphan punch HR can resolve later
  -- (the doc's "unknown punch" exception, made real instead of aspirational).
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  punched_at    TIMESTAMPTZ NOT NULL,
  raw_status    VARCHAR(10),
  processed     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_device_events_tenant ON attendance_device_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_device_events_device_time ON attendance_device_events(device_id, punched_at);
CREATE INDEX IF NOT EXISTS idx_attendance_device_events_unresolved ON attendance_device_events(tenant_id) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS attendance_device_sync_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id         UUID NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  records_received  INTEGER NOT NULL DEFAULT 0,
  records_matched   INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  error             TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_device_sync_logs_device ON attendance_device_sync_logs(device_id, started_at);

-- A device punch pair is just another clock session — tagging its source
-- lets syncAttendanceFromSessions() (hr.routes.ts) keep aggregating every
-- session for a user/date the way it already does for WEB + MANUAL, with no
-- parallel reconciliation logic for DEVICE.
ALTER TABLE hr_clock_sessions
  ADD COLUMN IF NOT EXISTS source    VARCHAR(10) NOT NULL DEFAULT 'WEB' CHECK (source IN ('WEB', 'MANUAL', 'DEVICE')),
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES attendance_devices(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'attendance_devices'::regclass) THEN
    ALTER TABLE attendance_devices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_devices FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON attendance_devices
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'attendance_device_enrollments'::regclass) THEN
    ALTER TABLE attendance_device_enrollments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_device_enrollments FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON attendance_device_enrollments
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'attendance_device_events'::regclass) THEN
    ALTER TABLE attendance_device_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_device_events FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON attendance_device_events
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'attendance_device_sync_logs'::regclass) THEN
    ALTER TABLE attendance_device_sync_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE attendance_device_sync_logs FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON attendance_device_sync_logs
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
