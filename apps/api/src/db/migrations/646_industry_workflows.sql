-- Phase H: Industry-specific workflows.
-- Defines workflow templates per industry, app×industry coverage matrix,
-- and tenant workflow instances that drive cross-app transactions.

-- ── 1. Industry workflow definitions (platform-scoped) ──────────────────────
-- Each industry has a set of defined workflows. These are template/reference
-- definitions that get instantiated per tenant.
CREATE TABLE IF NOT EXISTS industry_workflow_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key    TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  workflow_code   TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'operational'
    CHECK (category IN ('operational', 'regulatory', 'financial', 'quality', 'procurement', 'logistics', 'hr', 'sales', 'production')),
  steps           JSONB NOT NULL DEFAULT '[]',
  required_apps   TEXT[] NOT NULL DEFAULT '{}',
  required_permits TEXT[] NOT NULL DEFAULT '{}',
  config_schema   JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'deprecated')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (industry_key, app_id, workflow_code)
);

CREATE INDEX IF NOT EXISTS idx_wf_defs_industry ON industry_workflow_definitions(industry_key);
CREATE INDEX IF NOT EXISTS idx_wf_defs_app ON industry_workflow_definitions(app_id);

-- ── 2. App × industry coverage matrix ───────────────────────────────────────
-- Records which app+industry combinations have demonstrated workflows,
-- which are planned, and which are explicitly excluded.
CREATE TABLE IF NOT EXISTS industry_app_matrix (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_key    TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('demonstrated', 'implemented', 'planned', 'unsupported', 'excluded', 'not_applicable')),
  workflow_count  INT NOT NULL DEFAULT 0,
  evidence_notes  TEXT,
  last_verified   DATE,
  verified_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (industry_key, app_id)
);

-- Seed the matrix for core industries × core apps
INSERT INTO industry_app_matrix (industry_key, app_id, status, evidence_notes) VALUES
  -- Logistics (the core Hudumika industry)
  ('logistics', 'clearos', 'implemented', 'Core customs/freight workflows'),
  ('logistics', 'cargotracker', 'implemented', 'Shipment tracking and booking'),
  ('logistics', 'hudufreight', 'implemented', 'Fleet management and dispatching'),
  ('logistics', 'seal', 'implemented', 'Warehouse and inventory'),
  ('logistics', 'finops', 'implemented', 'Logistics billing and accounting'),
  ('logistics', 'crm', 'implemented', 'Customer management for freight'),
  ('logistics', 'nexushr', 'planned', 'Driver/crew credential management'),
  ('logistics', 'complyos', 'implemented', 'Customs/transport permits'),
  -- Pharmaceutical
  ('pharmaceutical', 'seal', 'planned', 'Batch/expiry traceability, cold chain'),
  ('pharmaceutical', 'complyos', 'planned', 'Product registration, GMP permits'),
  ('pharmaceutical', 'finops', 'planned', 'Regulated procurement and billing'),
  ('pharmaceutical', 'nexushr', 'planned', 'Staff qualifications/credentials'),
  ('pharmaceutical', 'clearos', 'planned', 'Import permits and customs'),
  -- Manufacturing
  ('manufacturing', 'seal', 'planned', 'BOM/routing, production tracking'),
  ('manufacturing', 'finops', 'planned', 'Cost reconciliation, material planning'),
  ('manufacturing', 'complyos', 'planned', 'Environmental/safety permits'),
  ('manufacturing', 'nexushr', 'planned', 'Operator certifications'),
  ('manufacturing', 'projects', 'planned', 'Production project management'),
  -- Trading/Distribution
  ('trading', 'seal', 'planned', 'Multi-location stock, serial/batch tracking'),
  ('trading', 'finops', 'planned', 'Purchasing/sales/landed costs'),
  ('trading', 'clearos', 'planned', 'Import/export documentation'),
  ('trading', 'crm', 'planned', 'Supplier/customer management'),
  ('trading', 'complyos', 'planned', 'Trade compliance permits'),
  -- Mining
  ('mining', 'complyos', 'planned', 'Concession/environmental permits'),
  ('mining', 'projects', 'planned', 'Mining project management'),
  ('mining', 'finops', 'planned', 'Operating cost attribution'),
  ('mining', 'nexushr', 'planned', 'Contractor/safety certifications'),
  ('mining', 'hudufreight', 'planned', 'Heavy equipment/transport'),
  -- Healthcare
  ('healthcare', 'complyos', 'planned', 'Facility/practitioner licensing'),
  ('healthcare', 'nexushr', 'planned', 'Staff credentials/qualifications'),
  ('healthcare', 'seal', 'planned', 'Medical supplies inventory'),
  ('healthcare', 'finops', 'planned', 'Service billing/procurement'),
  -- Financial Services
  ('financial_services', 'complyos', 'planned', 'Financial regulatory permits'),
  ('financial_services', 'finops', 'implemented', 'Core financial operations'),
  ('financial_services', 'crm', 'planned', 'Client due diligence'),
  -- Technology/Telecom
  ('technology', 'complyos', 'planned', 'Technology/telecom licenses'),
  ('technology', 'projects', 'planned', 'Product/service development'),
  ('technology', 'finops', 'planned', 'Subscription/SaaS billing')
ON CONFLICT (industry_key, app_id) DO NOTHING;

-- ── 3. Tenant workflow instances (tenant-scoped) ────────────────────────────
-- When a tenant activates an industry, workflow definitions get instantiated
-- as configurable workflow instances.
CREATE TABLE IF NOT EXISTS tenant_workflow_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_def_id     UUID REFERENCES industry_workflow_definitions(id) ON DELETE SET NULL,
  industry_key        TEXT NOT NULL,
  app_id              TEXT NOT NULL,
  workflow_code       TEXT NOT NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'disabled', 'draft')),
  config              JSONB NOT NULL DEFAULT '{}',
  entity_id           UUID REFERENCES tenant_entities(id) ON DELETE SET NULL,
  site_id             UUID REFERENCES tenant_sites(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_workflow_instances FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_workflow_instances'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_workflow_instances
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_twi_tenant ON tenant_workflow_instances(tenant_id, industry_key);

-- ── 4. Workflow transaction log (tenant-scoped) ─────────────────────────────
-- Records cross-app transactions driven by workflow instances.
CREATE TABLE IF NOT EXISTS workflow_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_instance_id UUID NOT NULL REFERENCES tenant_workflow_instances(id) ON DELETE CASCADE,
  step_code           TEXT NOT NULL,
  step_name           TEXT NOT NULL,
  source_app          TEXT NOT NULL,
  target_app          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped', 'cancelled')),
  input_data          JSONB NOT NULL DEFAULT '{}',
  output_data         JSONB NOT NULL DEFAULT '{}',
  source_record_type  TEXT,
  source_record_id    UUID,
  target_record_type  TEXT,
  target_record_id    UUID,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  executed_by         UUID REFERENCES users(id),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_transactions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'workflow_transactions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON workflow_transactions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wf_txn_instance ON workflow_transactions(workflow_instance_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_txn_tenant ON workflow_transactions(tenant_id, source_app);

-- ── 5. Seed core logistics workflow definitions ─────────────────────────────
INSERT INTO industry_workflow_definitions (industry_key, app_id, workflow_code, name, description, category, steps, required_apps, status) VALUES
  ('logistics', 'clearos', 'customs_clearance', 'Customs Clearance',
   'Full customs declaration, assessment, and release workflow',
   'regulatory',
   '[{"code":"declaration","name":"Lodge Declaration"},{"code":"assessment","name":"Duty Assessment"},{"code":"payment","name":"Duty Payment"},{"code":"release","name":"Cargo Release"}]'::jsonb,
   ARRAY['clearos','finops'], 'published'),

  ('logistics', 'cargotracker', 'shipment_booking', 'Shipment Booking',
   'End-to-end shipment booking from quote to delivery',
   'operational',
   '[{"code":"quote","name":"Rate Quote"},{"code":"booking","name":"Confirm Booking"},{"code":"pickup","name":"Cargo Pickup"},{"code":"transit","name":"In Transit"},{"code":"delivery","name":"Delivery"}]'::jsonb,
   ARRAY['cargotracker','hudufreight'], 'published'),

  ('logistics', 'hudufreight', 'fleet_dispatch', 'Fleet Dispatch',
   'Vehicle assignment, dispatch, and trip tracking',
   'logistics',
   '[{"code":"assign","name":"Assign Vehicle"},{"code":"dispatch","name":"Dispatch"},{"code":"enroute","name":"En Route"},{"code":"complete","name":"Trip Complete"}]'::jsonb,
   ARRAY['hudufreight'], 'published'),

  ('logistics', 'seal', 'warehouse_receipt', 'Warehouse Receipt',
   'Receive goods, quality check, put-away and storage',
   'logistics',
   '[{"code":"receive","name":"Receive Goods"},{"code":"inspect","name":"Quality Check"},{"code":"putaway","name":"Put Away"},{"code":"stored","name":"In Storage"}]'::jsonb,
   ARRAY['seal'], 'published'),

  ('logistics', 'complyos', 'permit_renewal', 'Permit Renewal',
   'Track and execute permit renewal before expiry',
   'regulatory',
   '[{"code":"identify","name":"Identify Expiring"},{"code":"prepare","name":"Prepare Documents"},{"code":"submit","name":"Submit Application"},{"code":"followup","name":"Follow Up"},{"code":"receive","name":"Receive Permit"}]'::jsonb,
   ARRAY['complyos','finops'], 'published')
ON CONFLICT (industry_key, app_id, workflow_code) DO NOTHING;
