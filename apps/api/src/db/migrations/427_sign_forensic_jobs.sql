-- Migration 427: Digital Execution Seal, Phase 2 — background verification
-- jobs. POST /v1/sign/verify/compare used to run hash + OCR + text-diff
-- synchronously inside the request (real Gemini-vision calls, several
-- seconds each) — fine for a demo, wrong once uploads get frequent or
-- large. This table is the queue: the route now just stores the upload and
-- inserts a 'queued' row, sign-forensic-verify.job.ts (same "insert
-- pending, a frequent sweep claims and processes" shape every other async
-- workflow in this codebase already uses — mail-outbox.job.ts,
-- sms-outbox.job.ts, sign-anchor-stamp.job.ts) does the real work, and the
-- frontend polls GET /v1/sign/verify/jobs/:id.
--
-- Retention: the uploaded file (storage_key, via MinioIntegration.
-- uploadForensicJobFile) is a verifier's own evidence, not the tenant's —
-- kept only long enough to review the result, then swept (see the job's own
-- cleanup pass). This table is NOT sign_verifications (267_sign_app.sql,
-- widened by 424) — that table is the permanent audit log of "an attempt
-- happened, with this verdict"; this one is the transient work queue that
-- produces the verdict sign_verifications then records.
CREATE TABLE IF NOT EXISTS sign_forensic_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Filled in once the code resolves to a real envelope — null is a
  -- legitimate terminal state (code not found), not an in-progress marker.
  tenant_id UUID,
  envelope_id UUID,
  verification_code TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  media_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  -- Same shape POST /verify/compare used to return synchronously — the
  -- route's response contract didn't change, only when the work happens.
  result JSONB,
  error TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sign_forensic_jobs_queued ON sign_forensic_jobs(created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_sign_forensic_jobs_envelope ON sign_forensic_jobs(envelope_id) WHERE envelope_id IS NOT NULL;
