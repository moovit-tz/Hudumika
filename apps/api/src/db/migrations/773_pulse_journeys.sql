-- Pulse journeys: an automated sequence each person walks through on their own
-- clock — e.g. welcome email, wait 3 days, if they didn't open send an SMS.
--
-- steps is an ordered JSONB array; each step has a stable id. A branch names
-- the step to jump to for yes / no, and may only jump forward, so a person
-- runs each step at most once — the UNIQUE (enrollment_id, step_id) on
-- step runs is what makes a double-claimed run harmless.
--
-- Each message step owns one hidden pulse_campaigns row (journey_id set), so
-- journey email and SMS reuse the campaign machinery whole: per-person
-- tracking tokens, open/click/unsubscribe, consent checks and reports.

CREATE TABLE IF NOT EXISTS pulse_journeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  source        TEXT NOT NULL CHECK (source IN ('contacts', 'leads', 'customers')),
  -- { type: 'segment' | 'event' | 'date' | 'manual', segment_id?, include_existing?,
  --   event_type?, date_field?, offset_days? }
  trigger       JSONB NOT NULL,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { event_type } — leave the journey when this happens to the person.
  goal          JSONB,
  -- 'never': once per person ever; 'after_exit': again once they have left.
  reentry       TEXT NOT NULL DEFAULT 'never' CHECK (reentry IN ('never', 'after_exit')),
  -- { start: 'HH:MM', end: 'HH:MM' } in the workspace's time zone; messages wait it out.
  quiet_hours   JSONB,
  version       INTEGER NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pulse_journeys_tenant ON pulse_journeys(tenant_id, status);

CREATE TABLE IF NOT EXISTS pulse_journey_enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journey_id    UUID NOT NULL REFERENCES pulse_journeys(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  source_id     UUID NOT NULL,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  -- 'excluded': already in the audience when the journey started without
  -- "include people already in it" — recorded so they are never enrolled later.
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exited', 'failed', 'excluded')),
  step_index    INTEGER NOT NULL DEFAULT 0,
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_reason   TEXT,
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pulse_enrollments_due ON pulse_journey_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pulse_enrollments_person ON pulse_journey_enrollments(tenant_id, source, source_id);
CREATE INDEX IF NOT EXISTS idx_pulse_enrollments_journey ON pulse_journey_enrollments(journey_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulse_enrollments_active ON pulse_journey_enrollments(journey_id, source, source_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS pulse_journey_step_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journey_id    UUID NOT NULL REFERENCES pulse_journeys(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES pulse_journey_enrollments(id) ON DELETE CASCADE,
  step_id       TEXT NOT NULL,
  step_type     TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('done', 'skipped', 'failed')),
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_pulse_step_runs_journey ON pulse_journey_step_runs(journey_id, step_id, status);

ALTER TABLE pulse_campaigns ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES pulse_journeys(id) ON DELETE CASCADE;
ALTER TABLE pulse_campaigns ADD COLUMN IF NOT EXISTS journey_step_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulse_campaigns_journey_step ON pulse_campaigns(journey_id, journey_step_id) WHERE journey_id IS NOT NULL;
-- A journey message goes to the same person at most once per enrollment, but
-- the same address can re-enter (reentry = 'after_exit'): sends are unique per
-- enrollment there instead of per campaign + address.
ALTER TABLE pulse_sends ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES pulse_journey_enrollments(id) ON DELETE SET NULL;
ALTER TABLE pulse_sends DROP CONSTRAINT IF EXISTS pulse_sends_campaign_id_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulse_sends_campaign_address ON pulse_sends(campaign_id, address) WHERE enrollment_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pulse_sends_enrollment ON pulse_sends(campaign_id, enrollment_id) WHERE enrollment_id IS NOT NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pulse_journeys', 'pulse_journey_enrollments', 'pulse_journey_step_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
