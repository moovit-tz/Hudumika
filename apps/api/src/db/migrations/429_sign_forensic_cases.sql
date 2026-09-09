-- Migration 429: Digital Execution Seal, Phase 3 — forensic case model,
-- evidence manifest, and chain of custody.
--
-- Layering (deliberately three separate tables, not one wide one):
--   sign_verifications   (267, widened 424) — permanent, lightweight log of
--                          every single verification attempt (valid/not
--                          found, hash match, verdict). Exists for every
--                          lookup, forever.
--   sign_forensic_jobs   (427) — transient work queue for one upload's
--                          hash+OCR+diff comparison. Swept ~24h after
--                          completion; its own storage_key is the upload's
--                          ephemeral copy.
--   sign_forensic_cases  (this migration) — NOT created for every attempt.
--                          Opened only when there's actually something to
--                          investigate: automatically by the verify job
--                          when a comparison comes back non-clean
--                          (SEAL_INVALID / DOCUMENT_MISMATCH /
--                          CONTENT_DIFFERENCE / INCONCLUSIVE), or manually
--                          by an authorized staff member who wants a
--                          permanent record even for a clean result. A case
--                          gets its OWN durable copy of the evidence
--                          (sign_forensic_evidence) — the job's own upload
--                          is still swept on schedule regardless of whether
--                          a case was opened from it.
--
-- RLS: sign_forensic_jobs (427) shipped without it — a real gap, backfilled
-- here rather than left for a future session to rediscover. It's accessed
-- exclusively via dbPlatform in the public (unauthenticated) verify routes
-- today, so the policy is currently a defensive backstop rather than an
-- active constraint — but the moment any authenticated, tenant-scoped route
-- reads it through withTenant() (this migration's own case-management
-- routes might, if they ever join against it), FORCE ROW LEVEL SECURITY is
-- what actually stops a cross-tenant leak, not "we remembered to add a
-- .where('tenant_id', ...)" everywhere.
ALTER TABLE sign_forensic_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_forensic_jobs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_forensic_jobs'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_forensic_jobs
      USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sign_forensic_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  envelope_id UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  forensic_job_id UUID REFERENCES sign_forensic_jobs(id) ON DELETE SET NULL,
  verification_code TEXT NOT NULL,
  -- Denormalized copy of the triggering job's verdict at open time — the
  -- job row itself gets swept ~24h later (427's own cleanup pass); the
  -- case must keep saying what it was opened *for* long after that.
  content_verdict TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  -- NULL opened_by = system-opened (the verify job auto-opening on a
  -- non-clean verdict), matching sign_events' own actor_name-nullable
  -- convention for a non-human actor.
  opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
  opened_by_name TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  -- The manifest's own hash (§44 — "the evidence manifest itself must be
  -- hashed"), set once sign-forensic-case.service.ts builds the manifest
  -- row in sign_forensic_evidence below; kept here too so a case's
  -- integrity is checkable from the case row alone, without a join.
  manifest_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sign_forensic_cases_tenant ON sign_forensic_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sign_forensic_cases_envelope ON sign_forensic_cases(envelope_id);

ALTER TABLE sign_forensic_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_forensic_cases FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_forensic_cases'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_forensic_cases
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Evidence manifest (§43/§44) — one row per file in the package: the
-- canonical stamped PDF, the verifier's uploaded copy, and the manifest
-- JSON itself (self-referential — its own row's sha256 is what
-- sign_forensic_cases.manifest_hash records). Append-only: nothing in this
-- codebase ever UPDATEs a row here, only INSERTs — the "never allow
-- ordinary users to overwrite evidence" requirement (§45) is enforced by
-- there being no update path in sign-forensic-case.service.ts at all, not
-- by a role check that could be bypassed.
CREATE TABLE IF NOT EXISTS sign_forensic_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES sign_forensic_cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('canonical', 'uploaded', 'manifest', 'report')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sign_forensic_evidence_case ON sign_forensic_evidence(case_id);

ALTER TABLE sign_forensic_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_forensic_evidence FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_forensic_evidence'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_forensic_evidence
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Chain of custody (§45) — append-only audit trail: who uploaded the
-- original evidence, who opened/viewed/exported the case, every status
-- change. Distinct from sign_events (that's the envelope's own signing
-- audit trail — created/sent/signed/completed); this is specifically
-- forensic-case activity, which can happen long after (or without) any
-- envelope-level event at all (e.g. a senior investigator just opening the
-- case to read it).
CREATE TABLE IF NOT EXISTS sign_forensic_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES sign_forensic_cases(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('opened', 'uploaded', 'analysis_initiated', 'viewed', 'exported', 'status_changed')),
  detail JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sign_forensic_audit_case ON sign_forensic_audit(case_id, created_at);

ALTER TABLE sign_forensic_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_forensic_audit FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_forensic_audit'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_forensic_audit
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
