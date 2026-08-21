-- Multi-entity accounting (M8 of the ClearOS roadmap) — a legal-entity/
-- branch concept added to the GL, plus intercompany billing between them.
--
-- Deliberately additive only. Two live, populated financial tables already
-- exist (chart_of_accounts, journal_entries) with real tenant data behind
-- them — this migration adds one nullable column to each and two brand-new
-- tables. It does NOT touch chart_of_accounts' existing UNIQUE(tenant_id,
-- code) or journal_entries' UNIQUE(tenant_id, entry_number) constraints,
-- does NOT backfill or alter any existing row, and does NOT require every
-- tenant to have an accounting_entities row at all. A tenant that never
-- creates one keeps behaving exactly as today: entity_id stays NULL on
-- every journal entry/account, and every existing report (which never
-- filters by entity_id) is already, by construction, the "consolidated
-- across all entities" view — there was nothing to migrate for
-- single-entity tenants because NULL already means "the whole tenant."
--
-- Chart of accounts stays SHARED across a tenant's entities rather than
-- forked per-entity (the safer, and also the more common real-world
-- choice — most multi-branch SMBs run one chart of accounts with branch as
-- a transaction-level dimension, not a separate account codebase per
-- branch). This sidesteps entity-scoped code-uniqueness entirely; entity_id
-- on chart_of_accounts is purely an optional tag (e.g. for an
-- entity-specific intercompany clearing account), not a partition key.
--
-- Considered and rejected: reusing hr_legal_entities (024_nexushr_core.sql).
-- Structurally very close, but per 206_drop_dead_person_model.sql's own
-- note it's already "the right home for a multi-entity tenant" in NexusHR's
-- eyes, currently has zero rows anywhere, and is completely disconnected
-- from GL — repurposing it here would silently couple two modules' data
-- models without NexusHR's owner having agreed to that. accounting_entities
-- is Finance's own table instead.

CREATE TABLE IF NOT EXISTS accounting_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  entity_code VARCHAR(20) NOT NULL,
  country_code VARCHAR(2),
  currency VARCHAR(5) NOT NULL DEFAULT 'TZS',
  tax_id TEXT,
  registered_address TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, entity_code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_entities_tenant ON accounting_entities (tenant_id);

ALTER TABLE accounting_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entities FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'accounting_entities'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON accounting_entities
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Nullable, no default, no backfill — every existing row stays NULL, which
-- is exactly what "not entity-tagged / whole-tenant" already meant before
-- this column existed.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES accounting_entities(id);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES accounting_entities(id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries (tenant_id, entity_id);

-- Intercompany billing: one row per transaction, linking the AR entry
-- posted in the selling entity's books to the AP entry posted in the
-- buying entity's — same "two individually-balanced, linked entries"
-- pattern gl.service.ts's own balance trigger already requires, not one
-- shared cross-entity entry.
CREATE TABLE IF NOT EXISTS intercompany_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_entity_id UUID NOT NULL REFERENCES accounting_entities(id),
  to_entity_id UUID NOT NULL REFERENCES accounting_entities(id),
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'TZS',
  from_account_code VARCHAR(20) NOT NULL,   -- the selling entity's revenue/recovery account
  to_account_code VARCHAR(20) NOT NULL,     -- the buying entity's expense account
  ar_journal_entry_id UUID REFERENCES journal_entries(id),
  ap_journal_entry_id UUID REFERENCES journal_entries(id),
  status VARCHAR(20) NOT NULL DEFAULT 'posted',  -- posted | voided
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (from_entity_id != to_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_intercompany_tenant ON intercompany_transactions (tenant_id);

ALTER TABLE intercompany_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercompany_transactions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'intercompany_transactions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON intercompany_transactions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Note for whoever eventually does the hudumika_app RLS cutover
-- (241_rls_restricted_roles.sql): chart_of_accounts, journal_entries and
-- journal_lines still have NO row-level security at all — isolation today
-- is 100% the application's own .where('tenant_id', ...) filtering. This
-- migration does not fix that (a live financial-table RLS change deserves
-- its own dedicated review, not to be bundled quietly into a schema
-- extension) — flagging it here since this is the migration that happened
-- to touch these tables next.
