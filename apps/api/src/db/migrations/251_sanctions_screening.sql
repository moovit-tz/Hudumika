-- Denied-party / sanctions screening (M2 of the ClearOS roadmap).
--
-- sanctions_entries / sanctions_aliases / sanctions_sync_runs are platform
-- reference data, not tenant data — same shape as hs_codes (036_hs_customs):
-- one shared copy of the OFAC SDN list and the UN Consolidated List, synced
-- from the real public sources and queried via dbPlatform, no tenant_id, no
-- RLS. sanctions_screenings is the tenant-scoped record of "we checked this
-- name against that shared list and got this result" — it DOES carry
-- tenant_id and gets RLS, same policy shape as every other tenant table
-- (e.g. 245_onsite_rls.sql).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sanctions_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(10) NOT NULL,          -- 'OFAC' | 'UN'
  source_uid VARCHAR(50) NOT NULL,      -- their own record id (OFAC <uid>, UN <DATAID>)
  entry_type VARCHAR(20) NOT NULL,      -- 'INDIVIDUAL' | 'ENTITY'
  primary_name TEXT NOT NULL,
  programs TEXT,                        -- comma-separated program/list-type names
  listed_on DATE,
  remarks TEXT,
  raw JSONB,                            -- full source record, for the review-screen detail view
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, source_uid)
);

CREATE TABLE IF NOT EXISTS sanctions_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES sanctions_entries(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sanctions_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(10) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running | success | failed
  entries_count INT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS sanctions_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type VARCHAR(30) NOT NULL,     -- 'customer' | 'contact' | 'adhoc'
  subject_id UUID,                       -- null for an ad-hoc screen not tied to a record
  screened_name TEXT NOT NULL,
  best_match_entry_id UUID REFERENCES sanctions_entries(id),
  best_match_name TEXT,
  best_match_score NUMERIC(4,3),         -- pg_trgm similarity(), 0..1
  status VARCHAR(24) NOT NULL DEFAULT 'clear',  -- clear | flagged | cleared_false_positive | confirmed_match
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_entries_name_trgm ON sanctions_entries USING gin (primary_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sanctions_aliases_name_trgm ON sanctions_aliases USING gin (alias_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sanctions_aliases_entry ON sanctions_aliases(entry_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_tenant ON sanctions_screenings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_tenant_status ON sanctions_screenings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sanctions_screenings_subject ON sanctions_screenings(tenant_id, subject_type, subject_id);

ALTER TABLE sanctions_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctions_screenings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sanctions_screenings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sanctions_screenings
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
