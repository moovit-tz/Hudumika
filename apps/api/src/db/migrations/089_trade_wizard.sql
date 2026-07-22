-- Migration 089: Tanzania trade-procedure guided wizard (replaces the old
-- HS+origin quick-check on ClearOS's Compliance page).
--
-- Global reference tables (no tenant_id, no RLS — same convention as
-- icd_directory / clearing_agents_registry / carrier_directory): the
-- procedure catalog is public-record government process information shared
-- by every tenant on the platform, not a tenant's own data.
--
-- Data sourcing note: the procedure NAME+ID directory (trade_procedures) is
-- populated from Tanzania's official trade portal (trade.tanzania.go.tz),
-- which publishes a full, browsable list. Step-level detail
-- (trade_procedure_steps) is populated procedure-by-procedure — some via
-- the portal's own step API where discovered, others hand-curated from
-- other official Tanzanian government sources (Mining Commission, TCCIA,
-- TCB, etc.) — every row carries source_url/scraped_at provenance so it is
-- traceable and correctable.

CREATE TABLE IF NOT EXISTS trade_institutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  acronym     TEXT,
  category    TEXT,             -- e.g. 'Customs', 'Standards', 'Agriculture', 'Mining', 'Trade'
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  source_url  TEXT,
  scraped_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS trade_procedures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        INTEGER,          -- trade.tanzania.go.tz's own numeric procedure ID, where known
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL,    -- 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION'
  product_keywords TEXT,             -- free-text commodity/product names for search
  summary          TEXT,
  has_detail       BOOLEAN NOT NULL DEFAULT false,  -- true once real steps exist, not just name+id
  source_url       TEXT,
  scraped_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id)
);
CREATE INDEX IF NOT EXISTS idx_trade_procedures_kind ON trade_procedures(kind);
CREATE INDEX IF NOT EXISTS idx_trade_procedures_keywords ON trade_procedures USING GIN (to_tsvector('english', coalesce(product_keywords, '') || ' ' || name));

CREATE TABLE IF NOT EXISTS trade_procedure_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id        UUID NOT NULL REFERENCES trade_procedures(id) ON DELETE CASCADE,
  step_no             INTEGER NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  institution_id      UUID REFERENCES trade_institutions(id),
  duration_estimate   TEXT,          -- free text, e.g. "3-5 working days" — source data isn't uniform enough to force into a number
  cost_estimate       TEXT,
  required_documents  JSONB NOT NULL DEFAULT '[]',
  is_online           BOOLEAN NOT NULL DEFAULT false,
  source_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trade_steps_procedure ON trade_procedure_steps(procedure_id, step_no);

CREATE TABLE IF NOT EXISTS trade_procedure_prechecks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id  UUID NOT NULL REFERENCES trade_procedures(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  help_text     TEXT,
  options       JSONB NOT NULL DEFAULT '[]',   -- array of {value, label}
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trade_prechecks_procedure ON trade_procedure_prechecks(procedure_id, sort_order);

-- Tenant-scoped: usage quota + run history.
CREATE TABLE IF NOT EXISTS trade_wizard_usage_counters (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period     VARCHAR(7) NOT NULL,   -- 'YYYY-MM'
  searches   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);

CREATE TABLE IF NOT EXISTS trade_wizard_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  procedure_id  UUID NOT NULL REFERENCES trade_procedures(id),
  answers       JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trade_wizard_runs_tenant ON trade_wizard_runs(tenant_id, created_at DESC);

-- Per-tier monthly search quota, alongside the existing monthly_item_limit column.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS trade_wizard_monthly_searches INTEGER;
