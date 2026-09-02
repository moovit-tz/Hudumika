-- Ondi feature-gap pass (mined from the ondi-benchmark/ondi-features
-- positioning docs against the disconnected services/ondi-api fork): the
-- real trust-score.ts only ever computes a live value on demand — no row is
-- ever written, so there's no way to show a trend over time. One snapshot
-- row per (tenant, user) written by GET /v1/security/trust-score itself
-- (throttled there to at most once/hour), not by computeTrustScore() —
-- that function stays a pure read so other callers (e.g. the step-up policy
-- check) don't each silently write a row too.
CREATE TABLE IF NOT EXISTS ondi_trust_score_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score       INT NOT NULL,
  tier        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ondi_trust_snapshots_user ON ondi_trust_score_snapshots(tenant_id, user_id, created_at DESC);

ALTER TABLE ondi_trust_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_trust_score_snapshots FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_trust_score_snapshots'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_trust_score_snapshots
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
