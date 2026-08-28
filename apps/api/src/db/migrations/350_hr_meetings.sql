-- NexusHR group meetings — a Meet/Zoom-style room on top of the existing
-- 1:1 call infrastructure (calls.routes.ts's WebSocket signaling registry
-- and presence). Media is still peer-to-peer WebRTC (mesh: every
-- participant connects directly to every other participant) — no SFU media
-- server exists in this stack, so this is scoped for typical internal team
-- meetings, not large-audience webinars. join_code is what a shareable link
-- resolves through (/nexushr/calls/meeting/:code), so it must be guessable
-- neither sequentially nor by brute force in a reasonable window — 10
-- base32 chars (Crockford alphabet, no 0/O/1/I confusion) gives 50 bits.

CREATE TABLE IF NOT EXISTS hr_meetings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL DEFAULT 'Meeting',
  join_code        VARCHAR(16) NOT NULL UNIQUE,
  kind             VARCHAR(8)  NOT NULL DEFAULT 'VIDEO',
  status           VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
  scheduled_at     TIMESTAMPTZ,        -- NULL means an instant meeting (start now)
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  locked           BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_meetings_kind_valid   CHECK (kind IN ('VOICE', 'VIDEO')),
  CONSTRAINT hr_meetings_status_valid CHECK (status IN ('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_hr_meetings_tenant_time ON hr_meetings(tenant_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_meetings_host ON hr_meetings(tenant_id, host_id);

ALTER TABLE hr_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_meetings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_meetings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_meetings
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- One row per person per meeting attendance — a real join/leave record
-- (not just a live in-memory roster), so both post-meeting "who attended"
-- and the metrics dashboard (attendance counts, average duration) read
-- real history rather than something reconstructed from logs.
CREATE TABLE IF NOT EXISTS hr_meeting_participants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id       UUID NOT NULL REFERENCES hr_meetings(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             VARCHAR(11) NOT NULL DEFAULT 'PARTICIPANT',
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at          TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_meeting_participants_role_valid CHECK (role IN ('HOST', 'PARTICIPANT'))
);

CREATE INDEX IF NOT EXISTS idx_hr_meeting_participants_meeting ON hr_meeting_participants(tenant_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_hr_meeting_participants_user ON hr_meeting_participants(tenant_id, user_id, joined_at DESC);

ALTER TABLE hr_meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_meeting_participants FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_meeting_participants'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_meeting_participants
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
