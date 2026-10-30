-- Phase I: Company/product launch planner.
-- Structured intake for entity/industry/site/product facts,
-- readiness plan generation with requirement resolution, cost/timeline,
-- dependency tracking, owner assignments, and linked ComplyOS/Tasks cases.

-- ── 1. Launch cases (tenant-scoped) ─────────────────────────────────────
-- A launch case is the top-level container for "we want to launch X
-- in Y jurisdiction with Z products/sites."
CREATE TABLE IF NOT EXISTS launch_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake', 'planning', 'in_progress', 'blocked', 'ready', 'launched', 'cancelled')),
  industries        TEXT[] NOT NULL DEFAULT '{}',
  jurisdictions     TEXT[] NOT NULL DEFAULT '{}',
  target_date       DATE,
  actual_launch_date DATE,
  overall_readiness  NUMERIC(5,2) DEFAULT 0,
  created_by        UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launch_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_cases FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'launch_cases'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON launch_cases
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_launch_cases_tenant ON launch_cases(tenant_id, status);

-- ── 2. Launch case sites ────────────────────────────────────────────────
-- Each site the entity wants to operate from.
CREATE TABLE IF NOT EXISTS launch_case_sites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  launch_case_id    UUID NOT NULL REFERENCES launch_cases(id) ON DELETE CASCADE,
  site_id           UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  site_name         TEXT NOT NULL,
  site_type         TEXT NOT NULL DEFAULT 'office'
    CHECK (site_type IN ('office', 'warehouse', 'factory', 'retail', 'branch', 'depot', 'clinic', 'lab', 'other')),
  jurisdiction      TEXT NOT NULL DEFAULT 'TZ',
  address           TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launch_case_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_case_sites FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'launch_case_sites'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON launch_case_sites
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- ── 3. Launch case products/activities ──────────────────────────────────
CREATE TABLE IF NOT EXISTS launch_case_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  launch_case_id    UUID NOT NULL REFERENCES launch_cases(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  product_type      TEXT NOT NULL DEFAULT 'product'
    CHECK (product_type IN ('product', 'service', 'activity', 'import', 'export', 'manufacturing', 'other')),
  hs_code           TEXT,
  industry_key      TEXT,
  jurisdiction      TEXT NOT NULL DEFAULT 'TZ',
  requires_permits  BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launch_case_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_case_products FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'launch_case_products'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON launch_case_products
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- ── 4. Launch plan items (requirements resolved into action items) ──────
CREATE TABLE IF NOT EXISTS launch_plan_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  launch_case_id    UUID NOT NULL REFERENCES launch_cases(id) ON DELETE CASCADE,
  requirement_def_id UUID REFERENCES comply_requirement_definitions(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL DEFAULT 'permit'
    CHECK (category IN ('permit', 'registration', 'inspection', 'document', 'certification', 'fee', 'prerequisite', 'other')),
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'completed', 'blocked', 'exempted', 'not_applicable', 'failed')),
  priority          INT NOT NULL DEFAULT 50,
  jurisdiction      TEXT NOT NULL DEFAULT 'TZ',
  authority         TEXT,
  legal_basis       TEXT,
  estimated_cost    NUMERIC(14,2),
  actual_cost       NUMERIC(14,2),
  currency          TEXT NOT NULL DEFAULT 'TZS',
  estimated_days    INT,
  deadline          DATE,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  owner_user_id     UUID REFERENCES users(id),
  linked_cert_id    UUID REFERENCES comply_certificates(id) ON DELETE SET NULL,
  linked_cycle_id   UUID REFERENCES comply_lifecycle_cycles(id) ON DELETE SET NULL,
  linked_task_id    UUID,
  dependency_ids    UUID[] NOT NULL DEFAULT '{}',
  evidence_notes    TEXT,
  exemption_reason  TEXT,
  exemption_approved_by UUID REFERENCES users(id),
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launch_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_plan_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'launch_plan_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON launch_plan_items
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lpi_case ON launch_plan_items(launch_case_id, status);
CREATE INDEX IF NOT EXISTS idx_lpi_tenant ON launch_plan_items(tenant_id, category);

-- ── 5. Launch plan snapshots (preserving decision history) ──────────────
CREATE TABLE IF NOT EXISTS launch_plan_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  launch_case_id    UUID NOT NULL REFERENCES launch_cases(id) ON DELETE CASCADE,
  snapshot_type     TEXT NOT NULL DEFAULT 'auto'
    CHECK (snapshot_type IN ('auto', 'manual', 'approval', 'change')),
  label             TEXT,
  readiness_score   NUMERIC(5,2),
  item_count        INT NOT NULL DEFAULT 0,
  completed_count   INT NOT NULL DEFAULT 0,
  blocked_count     INT NOT NULL DEFAULT 0,
  snapshot_data     JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE launch_plan_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_plan_snapshots FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'launch_plan_snapshots'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON launch_plan_snapshots
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
