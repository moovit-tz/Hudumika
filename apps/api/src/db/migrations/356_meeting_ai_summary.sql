-- AI meeting summary — generated from the real, already-persisted transcript
-- (bliss_meeting_transcript_lines) and Q&A via the platform's own /v1/ai
-- provider config, never a hardcoded summary. One row per meeting
-- (UNIQUE(meeting_id)); regenerating overwrites rather than accumulating
-- duplicates, since a summary is a derived view of the transcript, not an
-- independent fact worth keeping multiple versions of.
CREATE TABLE IF NOT EXISTS bliss_meeting_summaries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id     UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  generated_by   UUID NOT NULL REFERENCES users(id),
  summary_json   JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id)
);

ALTER TABLE bliss_meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_summaries FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_summaries'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_summaries
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
