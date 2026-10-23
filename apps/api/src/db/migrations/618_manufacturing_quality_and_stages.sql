-- Workstream C: extend manufacturing with quality holds, waste/rework,
-- and configurable stage execution tracking.

-- ── 1. Production stage execution ─────────────────────────────────────
-- Tracks each physical stage (mixing, refining, moulding, etc.) with
-- operator start/finish, quantities and timestamps.
CREATE TABLE IF NOT EXISTS finance_production_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  production_id UUID NOT NULL,
  stage_name TEXT NOT NULL,
  stage_order SMALLINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  operator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  input_quantity NUMERIC(18,4),
  output_quantity NUMERIC(18,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, production_id)
    REFERENCES finance_production_orders(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON finance_production_stages (tenant_id, production_id, stage_order);
ALTER TABLE finance_production_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_stages
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 2. Quality inspections ────────────────────────────────────────────
-- Applies to incoming materials AND production output. A HOLD blocks
-- the item from allocation, dispatch or further processing.
CREATE TABLE IF NOT EXISTS finance_quality_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  inspection_type TEXT NOT NULL
    CHECK (inspection_type IN ('incoming', 'in_process', 'final')),
  production_id UUID,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  batch_no TEXT NOT NULL DEFAULT '',
  quantity_inspected NUMERIC(18,4) NOT NULL CHECK (quantity_inspected > 0),
  quantity_passed NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_passed >= 0),
  quantity_failed NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_failed >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'passed', 'failed', 'on_hold', 'released')),
  disposition TEXT
    CHECK (disposition IS NULL OR disposition IN ('use_as_is', 'rework', 'scrap', 'return_to_supplier', 'downgrade')),
  inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
  inspected_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  hold_reason TEXT,
  release_notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, production_id)
    REFERENCES finance_production_orders(tenant_id, id) ON DELETE SET NULL,
  CHECK (quantity_passed + quantity_failed <= quantity_inspected)
);
CREATE INDEX ON finance_quality_inspections (tenant_id, item_id, batch_no);
CREATE INDEX ON finance_quality_inspections (tenant_id, production_id)
  WHERE production_id IS NOT NULL;
ALTER TABLE finance_quality_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_quality_inspections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_quality_inspections
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 3. Waste and rework records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_production_waste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  production_id UUID NOT NULL,
  stage_id UUID REFERENCES finance_production_stages(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  waste_type TEXT NOT NULL
    CHECK (waste_type IN ('normal_loss', 'abnormal_loss', 'rework', 'scrap')),
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  is_recoverable BOOLEAN NOT NULL DEFAULT false,
  disposition TEXT
    CHECK (disposition IS NULL OR disposition IN ('disposed', 'recycled', 'reworked', 'sold_as_scrap')),
  cost_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, production_id)
    REFERENCES finance_production_orders(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON finance_production_waste (tenant_id, production_id);
ALTER TABLE finance_production_waste ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_waste FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_waste
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 4. Recipe stage templates ─────────────────────────────────────────
-- When a recipe is used to create a production order, these become the
-- default stages. Operators can override per order.
ALTER TABLE finance_production_recipes
  ADD COLUMN IF NOT EXISTS stages JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN finance_production_recipes.stages IS
  'Array of {name, order, expected_duration_minutes} stage templates for this recipe.';

-- ── 5. Hold flag on stock allocations ─────────────────────────────────
-- Prevents held/quarantined stock from being dispatched.
ALTER TABLE finance_stock_allocations
  ADD COLUMN IF NOT EXISTS quality_hold BOOLEAN NOT NULL DEFAULT false;

-- ── 6. Traceability: link output lot to input lots ────────────────────
-- Forward/backward recall queries: which ingredient lots went into which
-- output lot, and which output lots went to which customers.
CREATE TABLE IF NOT EXISTS finance_production_traceability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  production_id UUID NOT NULL,
  input_item_id UUID NOT NULL REFERENCES inventory_items(id),
  input_batch_no TEXT NOT NULL DEFAULT '',
  input_quantity NUMERIC(18,4) NOT NULL CHECK (input_quantity > 0),
  output_item_id UUID NOT NULL REFERENCES inventory_items(id),
  output_batch_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, production_id)
    REFERENCES finance_production_orders(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON finance_production_traceability (tenant_id, output_item_id, output_batch_no);
CREATE INDEX ON finance_production_traceability (tenant_id, input_item_id, input_batch_no);
ALTER TABLE finance_production_traceability ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_production_traceability FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_production_traceability
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ── 7. COA accounts for waste and quality ─────────────────────────────
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT id, '5210', 'Normal production losses', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT id, '5211', 'Abnormal production losses', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants ON CONFLICT (tenant_id, code) DO NOTHING;
