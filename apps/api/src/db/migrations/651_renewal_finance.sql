-- Migration 651: Renewal Finance — cost lines, budgets, allocations and forecasts.
-- Bridges ComplyOS lifecycle cycles to authoritative Finance records (supplier_bills,
-- finance_expenses, bill_payments). Manual estimates and actual_cost fields remain on
-- comply_lifecycle_cycles but are explicitly NOT a payment ledger.

-- ── 1. Cost lines per renewal cycle ─────────────────────────────────────────
-- Each row is one charge (authority fee, agent fee, penalty, inspection, etc.)
-- linked to the canonical lifecycle cycle. Amounts are in their original currency.
CREATE TABLE IF NOT EXISTS comply_renewal_cost_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id          UUID NOT NULL REFERENCES comply_lifecycle_cycles(id) ON DELETE CASCADE,
  cert_id           UUID REFERENCES comply_certificates(id) ON DELETE SET NULL,
  entity_id         UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  site_id           UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  category          TEXT NOT NULL CHECK (category IN (
    'authority_application', 'authority_renewal', 'inspection',
    'late_penalty', 'agent_fee', 'translation', 'document',
    'travel', 'platform_charge', 'other'
  )),
  description       TEXT NOT NULL,
  payee_type        TEXT CHECK (payee_type IS NULL OR payee_type IN ('authority', 'agent', 'provider', 'other')),
  payee_name        TEXT,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  quantity          NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  due_date          DATE,
  source_type       TEXT CHECK (source_type IS NULL OR source_type IN (
    'fee_definition', 'authority_assessment', 'agent_quotation',
    'manual_estimate', 'invoice', 'other'
  )),
  source_ref        TEXT,
  assessment_date   DATE,
  assessment_version INT NOT NULL DEFAULT 1,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comply_renewal_cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewal_cost_lines FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_renewal_cost_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_renewal_cost_lines
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comply_cost_lines_tenant ON comply_renewal_cost_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comply_cost_lines_cycle ON comply_renewal_cost_lines(cycle_id);
CREATE INDEX IF NOT EXISTS idx_comply_cost_lines_cert ON comply_renewal_cost_lines(cert_id) WHERE cert_id IS NOT NULL;

-- ── 2. Budget versions with approval ────────────────────────────────────────
-- Each cycle can have multiple budget versions (initial, revised, emergency).
-- Prior versions are immutable once superseded.
CREATE TABLE IF NOT EXISTS comply_renewal_budgets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id          UUID NOT NULL REFERENCES comply_lifecycle_cycles(id) ON DELETE CASCADE,
  version           INT NOT NULL DEFAULT 1,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  approved_amount   NUMERIC(15,2) NOT NULL,
  allocated_lines   JSONB NOT NULL DEFAULT '[]',
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'superseded')),
  requested_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cycle_id, version)
);

ALTER TABLE comply_renewal_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewal_budgets FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_renewal_budgets'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_renewal_budgets
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comply_budgets_tenant ON comply_renewal_budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comply_budgets_cycle ON comply_renewal_budgets(cycle_id);

-- ── 3. Finance allocations ──────────────────────────────────────────────────
-- Links a cost line to an authoritative Finance record (a supplier_bill, a
-- finance_expense, or a bill_payment). This is how we trace "what was actually
-- paid" without duplicating the Finance ledger.
CREATE TABLE IF NOT EXISTS comply_renewal_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cost_line_id      UUID NOT NULL REFERENCES comply_renewal_cost_lines(id) ON DELETE CASCADE,
  cycle_id          UUID NOT NULL REFERENCES comply_lifecycle_cycles(id) ON DELETE CASCADE,
  allocation_type   TEXT NOT NULL CHECK (allocation_type IN (
    'bill', 'expense', 'payment', 'refund', 'credit', 'reversal'
  )),
  finance_record_type TEXT NOT NULL CHECK (finance_record_type IN (
    'supplier_bill', 'finance_expense', 'bill_payment', 'invoice_payment'
  )),
  finance_record_id UUID NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  amount            NUMERIC(15,2) NOT NULL,
  allocation_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  reconciled        BOOLEAN NOT NULL DEFAULT false,
  reconciled_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at     TIMESTAMPTZ,
  notes             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cost_line_id, finance_record_type, finance_record_id)
);

ALTER TABLE comply_renewal_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewal_allocations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_renewal_allocations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_renewal_allocations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comply_allocs_tenant ON comply_renewal_allocations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comply_allocs_cost_line ON comply_renewal_allocations(cost_line_id);
CREATE INDEX IF NOT EXISTS idx_comply_allocs_cycle ON comply_renewal_allocations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_comply_allocs_finance ON comply_renewal_allocations(finance_record_type, finance_record_id);

-- ── 4. Forecast snapshots ───────────────────────────────────────────────────
-- Periodic point-in-time snapshots of expected spend, used to track how
-- forecasts evolve over time.
CREATE TABLE IF NOT EXISTS comply_renewal_forecasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  forecast_30d      NUMERIC(15,2) NOT NULL DEFAULT 0,
  forecast_90d      NUMERIC(15,2) NOT NULL DEFAULT 0,
  forecast_365d     NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_paid_ytd      NUMERIC(15,2) NOT NULL DEFAULT 0,
  open_commitments  NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_budget   NUMERIC(15,2) NOT NULL DEFAULT 0,
  unpriced_count    INT NOT NULL DEFAULT 0,
  coverage_pct      NUMERIC(5,2),
  rule_version      TEXT,
  computed_by       TEXT DEFAULT 'system',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, snapshot_date, currency)
);

ALTER TABLE comply_renewal_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewal_forecasts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_renewal_forecasts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_renewal_forecasts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comply_forecasts_tenant ON comply_renewal_forecasts(tenant_id, snapshot_date DESC);

-- ── 5. Budget change audit log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comply_renewal_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id          UUID REFERENCES comply_lifecycle_cycles(id) ON DELETE SET NULL,
  actor_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         UUID,
  previous_value    JSONB,
  new_value         JSONB,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE comply_renewal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewal_audit FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'comply_renewal_audit'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON comply_renewal_audit
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comply_audit_tenant ON comply_renewal_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comply_audit_cycle ON comply_renewal_audit(cycle_id) WHERE cycle_id IS NOT NULL;
