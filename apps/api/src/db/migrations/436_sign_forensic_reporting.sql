-- Digital Execution Seal, Phase 6 — formal reporting + re-analysis versioning.
--
-- A case's own `content_verdict` (429) stays exactly what it always was:
-- the verdict that caused the case to open, an immutable historical fact.
-- Re-analysis (e.g. re-running a comparison once a Gemini outage clears —
-- the exact real scenario Phase 3's own live test first hit) never
-- overwrites it; it appends a new row here instead, so a case accumulates
-- a real history of analysis passes rather than only ever showing its
-- latest one.
CREATE TABLE IF NOT EXISTS sign_forensic_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES sign_forensic_cases(id) ON DELETE CASCADE,
  run_number INT NOT NULL,
  content_verdict TEXT,
  result JSONB NOT NULL, -- the full CompareOutcome for this pass
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  triggered_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, run_number)
);

CREATE INDEX IF NOT EXISTS idx_sign_forensic_analysis_runs_case ON sign_forensic_analysis_runs(case_id, run_number);

ALTER TABLE sign_forensic_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_forensic_analysis_runs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sign_forensic_analysis_runs' AND policyname = 'tenant_isolation_policy') THEN
    CREATE POLICY tenant_isolation_policy ON sign_forensic_analysis_runs
      USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::uuid);
  END IF;
END $$;

-- Two new, distinct chain-of-custody events for this phase — kept as
-- granular as the existing ones rather than folding into 'analysis_initiated'.
ALTER TABLE sign_forensic_audit DROP CONSTRAINT IF EXISTS sign_forensic_audit_action_check;
ALTER TABLE sign_forensic_audit ADD CONSTRAINT sign_forensic_audit_action_check
  CHECK (action IN ('opened', 'uploaded', 'analysis_initiated', 'viewed', 'exported', 'status_changed', 're_analyzed', 'report_generated'));
