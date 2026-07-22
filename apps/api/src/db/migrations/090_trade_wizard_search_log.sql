-- Migration 090: log every Trade Compliance Wizard search for admin analytics
-- (demand signal — what tenants actually search for, no-result gaps to fill
-- next, usage trends). Tenant-scoped like trade_wizard_runs, but SuperAdmin
-- aggregates across all tenants for the analytics dashboard.
CREATE TABLE IF NOT EXISTS trade_wizard_searches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  query          TEXT,
  kind           TEXT,           -- 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION' | NULL
  results_count  INTEGER NOT NULL DEFAULT 0,
  matched_procedure_id UUID REFERENCES trade_procedures(id) ON DELETE SET NULL,  -- set when the search led to opening a specific procedure
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trade_wizard_searches_tenant ON trade_wizard_searches(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_wizard_searches_query ON trade_wizard_searches(query);
CREATE INDEX IF NOT EXISTS idx_trade_wizard_searches_created ON trade_wizard_searches(created_at DESC);
