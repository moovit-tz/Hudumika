-- 487_dev_issued_seals.sql
-- Real, minimal persistence for the Developer Platform's "Digital Execution
-- Seal API" (HUD-0117) — 'seal.issue' used to hand back a random id backed
-- by nothing at all, and 'seal.verify' unconditionally returned
-- valid:true/EXACT_MATCH for any input, including a nonexistent seal id and
-- a garbage signature, because there was no ledger to check against.
--
-- No tenant_id / RLS here on purpose, matching every other dev_* table in
-- migration 443 — developer accounts are deliberately not Hudumika-tenant-
-- scoped (any authenticated user in any tenant can hold one), and this
-- gateway path runs with no tenant context at all.

CREATE TABLE IF NOT EXISTS dev_issued_seals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seal_id               VARCHAR(64) NOT NULL UNIQUE,
  developer_account_id  UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES dev_projects(id) ON DELETE CASCADE,
  digest_sha256         VARCHAR(64) NOT NULL,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dev_issued_seals_seal_id ON dev_issued_seals(seal_id);
CREATE INDEX IF NOT EXISTS idx_dev_issued_seals_project ON dev_issued_seals(project_id, issued_at DESC);
