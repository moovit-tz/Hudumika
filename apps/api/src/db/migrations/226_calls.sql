-- NexusHR voice/video calls: a record per call attempt.
-- Signaling (SDP/ICE) is relayed live over a WebSocket and never stored; only
-- the call's metadata and outcome are persisted here for history.

CREATE TABLE IF NOT EXISTS hr_calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  caller_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             VARCHAR(8)  NOT NULL DEFAULT 'VIDEO',
  status           VARCHAR(12) NOT NULL DEFAULT 'RINGING',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_calls_kind_valid   CHECK (kind IN ('VOICE', 'VIDEO')),
  CONSTRAINT hr_calls_status_valid CHECK (status IN ('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'DECLINED')),
  CONSTRAINT hr_calls_distinct     CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_calls_tenant_time ON hr_calls(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_calls_participants ON hr_calls(tenant_id, caller_id, callee_id);
