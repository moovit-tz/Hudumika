-- Zentra investigation cases: an append-only record of what happened.
--
-- 762 kept a case's notes and timeline as JSON arrays on the case row,
-- rewritten on every change — anyone able to update the row could quietly
-- edit or drop history. For investigations that is the one property that
-- must hold, so each note, status change, assignment, evidence link and
-- resolution is now its own row, and the database refuses to change or
-- delete one (the same custody idea as sign-forensic-case.service.ts).
-- The old JSON columns are still read, for cases created before this.
CREATE TABLE zentra_case_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id     UUID NOT NULL REFERENCES zentra_investigation_cases(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'note', 'status', 'assignment', 'severity', 'evidence_added', 'resolved')),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL,
  body        TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  -- sha256 of the previous event's hash + this event's content: editing or
  -- removing a row underneath breaks the chain, which verifyCaseChain() reports.
  prev_hash   TEXT,
  hash        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_zentra_case_events_case ON zentra_case_events (tenant_id, case_id, created_at);
ALTER TABLE zentra_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zentra_case_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON zentra_case_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE OR REPLACE FUNCTION zentra_case_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- A case deleted with its tenant (ON DELETE CASCADE) is the only removal.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM zentra_investigation_cases WHERE id = OLD.case_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'zentra_case_events is append-only';
END $$;
CREATE TRIGGER trg_zentra_case_events_append_only
  BEFORE UPDATE OR DELETE ON zentra_case_events
  FOR EACH ROW EXECUTE FUNCTION zentra_case_events_append_only();
