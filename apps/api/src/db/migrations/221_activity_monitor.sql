-- Migration 221: opt-in, intensity-only activity monitoring.
--
-- Answers "can we do keystroke + heatmap records without being offensive": yes,
-- by never recording WHAT is done, only HOW MUCH. We store keystroke *counts*
-- (never which keys), mouse-travel distance, click counts, and a coarse
-- on-screen zone histogram for a heatmap — no text, no key identities, no
-- screenshots. It is doubly gated: a tenant must switch it on AND the individual
-- must consent; both default off. The running collector shows a visible
-- indicator, so it is never covert.

CREATE TABLE IF NOT EXISTS activity_monitor_settings (
  tenant_id          UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled            BOOLEAN     NOT NULL DEFAULT false,
  capture_keystrokes BOOLEAN     NOT NULL DEFAULT true,
  capture_heatmap    BOOLEAN     NOT NULL DEFAULT true,
  interval_seconds   INTEGER     NOT NULL DEFAULT 60,
  updated_by         UUID        REFERENCES users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-person consent. A row in users, not a separate table, so it travels with
-- the account and a query for "who has consented" is trivial.
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_consent    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS activity_samples (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_start     TIMESTAMPTZ NOT NULL,
  window_end       TIMESTAMPTZ NOT NULL,
  keystrokes       INTEGER     NOT NULL DEFAULT 0,   -- COUNT of keydowns, never which keys
  mouse_distance_px INTEGER    NOT NULL DEFAULT 0,
  clicks           INTEGER     NOT NULL DEFAULT 0,
  active_seconds   INTEGER     NOT NULL DEFAULT 0,
  zones            JSONB       NOT NULL DEFAULT '{}', -- {"r{row}c{col}": weight} coarse pointer heatmap
  app              TEXT,
  path             TEXT,                              -- route path only, never field content
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_samples_user_day ON activity_samples (tenant_id, user_id, window_start);

ALTER TABLE activity_monitor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_samples ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'activity_monitor_settings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON activity_monitor_settings
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'activity_samples'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON activity_samples
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
