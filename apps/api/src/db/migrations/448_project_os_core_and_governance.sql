-- Migration 448: Hudumika Project OS — Enterprise Core, Governance, Financial Controls, WBS, Procurement, and Industry Packs

-- 1. Portfolios & Programs
CREATE TABLE IF NOT EXISTS project_portfolios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50) NOT NULL,
  description         TEXT,
  manager_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
  target_budget       NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  start_date          DATE,
  end_date            DATE,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON project_portfolios(tenant_id);

CREATE TABLE IF NOT EXISTS project_programs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  portfolio_id        UUID REFERENCES project_portfolios(id) ON DELETE SET NULL,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50) NOT NULL,
  description         TEXT,
  manager_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
  budget              NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  start_date          DATE,
  end_date            DATE,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_programs_tenant ON project_programs(tenant_id, portfolio_id);

-- 2. Extend Projects table with Project OS fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES project_portfolios(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES project_programs(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry VARCHAR(50) NOT NULL DEFAULT 'general';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) NOT NULL DEFAULT 'standard';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) NOT NULL DEFAULT 'GREEN' CHECK (health_status IN ('GREEN', 'AMBER', 'RED'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS health_reason TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_budget NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_budget NUMERIC(16,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_coords JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baseline_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_projects_industry ON projects(tenant_id, industry);
CREATE INDEX IF NOT EXISTS idx_projects_portfolio_program ON projects(portfolio_id, program_id);

-- 3. Project Phases & Work Packages (WBS)
CREATE TABLE IF NOT EXISTS project_phases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50) NOT NULL,
  phase_number        INTEGER NOT NULL DEFAULT 1,
  description         TEXT,
  start_date          DATE,
  end_date            DATE,
  status              VARCHAR(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD')),
  progress_pct        NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_phases_project ON project_phases(project_id, sort_order);

CREATE TABLE IF NOT EXISTS project_work_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id            UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  wbs_code            VARCHAR(50) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  manager_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  budget              NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  progress_pct        NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  start_date          DATE,
  end_date            DATE,
  status              VARCHAR(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, wbs_code)
);
CREATE INDEX IF NOT EXISTS idx_work_packages_project ON project_work_packages(project_id, phase_id);

-- Add WBS linking to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_package_id UUID REFERENCES project_work_packages(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planned_cost NUMERIC(14,4) DEFAULT 0.0000;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14,4) DEFAULT 0.0000;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_tasks_phase_wp ON tasks(phase_id, work_package_id);

-- 4. Deliverables
CREATE TABLE IF NOT EXISTS project_deliverables (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id            UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  work_package_id     UUID REFERENCES project_work_packages(id) ON DELETE SET NULL,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50) NOT NULL,
  deliverable_type    VARCHAR(50) NOT NULL DEFAULT 'DOCUMENT' CHECK (deliverable_type IN ('DRAWING', 'REPORT', 'SOFTWARE_BUILD', 'PRODUCT', 'CERTIFICATE', 'INSPECTION', 'DESIGN', 'DOCUMENT', 'PHYSICAL_ITEM', 'MILESTONE_OUTPUT')),
  status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'DELIVERED', 'REJECTED')),
  owner_id            UUID NOT NULL REFERENCES users(id),
  reviewer_id         UUID REFERENCES users(id),
  due_date            DATE,
  delivered_date      DATE,
  acceptance_criteria TEXT,
  review_notes        TEXT,
  document_id         UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  version             VARCHAR(20) NOT NULL DEFAULT 'v1.0',
  is_client_visible   BOOLEAN NOT NULL DEFAULT true,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON project_deliverables(project_id, status);

-- 5. Cost Codes, Budgets & EVM Controls
CREATE TABLE IF NOT EXISTS project_cost_codes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                VARCHAR(50) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  category            VARCHAR(50) NOT NULL CHECK (category IN ('LABOUR', 'MATERIALS', 'EQUIPMENT', 'SUBCONTRACTOR', 'TRANSPORT', 'PROFESSIONAL_SERVICES', 'OVERHEAD', 'CONTINGENCY', 'OTHER')),
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_cost_codes_tenant ON project_cost_codes(tenant_id);

CREATE TABLE IF NOT EXISTS project_budgets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL DEFAULT 'Original Baseline Budget',
  version             INTEGER NOT NULL DEFAULT 1,
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED')),
  total_amount        NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  baseline_approved_at TIMESTAMPTZ,
  baseline_approved_by UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budgets_project ON project_budgets(project_id, status);

CREATE TABLE IF NOT EXISTS project_budget_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  budget_id           UUID NOT NULL REFERENCES project_budgets(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_package_id     UUID REFERENCES project_work_packages(id) ON DELETE SET NULL,
  cost_code_id        UUID REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  planned_amount      NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  committed_amount    NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  actual_amount       NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_lines_proj ON project_budget_lines(project_id, cost_code_id);

CREATE TABLE IF NOT EXISTS project_evm_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date       DATE NOT NULL,
  planned_value       NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- PV
  earned_value        NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- EV
  actual_cost         NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- AC
  cost_variance       NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- CV = EV - AC
  schedule_variance   NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- SV = EV - PV
  cpi                 NUMERIC(8,4) NOT NULL DEFAULT 1.0000,  -- CPI = EV / AC
  spi                 NUMERIC(8,4) NOT NULL DEFAULT 1.0000,  -- SPI = EV / PV
  bac                 NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- Budget at Completion
  eac                 NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- Estimate at Completion = BAC / CPI
  etc                 NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- Estimate to Complete = EAC - AC
  vac                 NUMERIC(16,4) NOT NULL DEFAULT 0.0000, -- Variance at Completion = BAC - EAC
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_evm_snapshots_proj ON project_evm_snapshots(project_id, snapshot_date DESC);

-- 6. Risk Register
CREATE TABLE IF NOT EXISTS project_risks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  risk_code           VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  category            VARCHAR(50) NOT NULL CHECK (category IN ('TECHNICAL', 'SCHEDULE', 'COST', 'RESOURCE', 'SAFETY_HSE', 'LEGAL_REGULATORY', 'ENVIRONMENTAL', 'COMMERCIAL', 'EXTERNAL')),
  description         TEXT,
  probability         INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5), -- 1 Very Low to 5 Very High
  impact              INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),      -- 1 Negligible to 5 Catastrophic
  score               INTEGER NOT NULL DEFAULT 1,                          -- probability * impact (1-25)
  severity            VARCHAR(20) NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  financial_exposure  NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  schedule_exposure_days INTEGER NOT NULL DEFAULT 0,
  owner_id            UUID REFERENCES users(id),
  mitigation_strategy TEXT,
  contingency_plan    TEXT,
  trigger_condition   TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'IDENTIFIED' CHECK (status IN ('IDENTIFIED', 'ANALYZING', 'MITIGATING', 'MONITORING', 'OCCURRED', 'CLOSED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, risk_code)
);
CREATE INDEX IF NOT EXISTS idx_risks_proj_severity ON project_risks(project_id, severity, status);

-- 7. Issues
CREATE TABLE IF NOT EXISTS project_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id             UUID REFERENCES tasks(id) ON DELETE SET NULL,
  risk_id             UUID REFERENCES project_risks(id) ON DELETE SET NULL,
  issue_code          VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  severity            VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  impact              VARCHAR(255),
  root_cause          TEXT,
  corrective_action   TEXT,
  owner_id            UUID NOT NULL REFERENCES users(id),
  due_date            DATE,
  resolved_at         TIMESTAMPTZ,
  resolution_notes    TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, issue_code)
);
CREATE INDEX IF NOT EXISTS idx_issues_proj ON project_issues(project_id, severity, status);

-- 8. Change Management
CREATE TABLE IF NOT EXISTS project_change_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_code         VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  original_scope      TEXT NOT NULL,
  requested_change    TEXT NOT NULL,
  justification       TEXT NOT NULL,
  requester_id        UUID NOT NULL REFERENCES users(id),
  cost_impact         NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  schedule_impact_days INTEGER NOT NULL DEFAULT 0,
  resource_impact     TEXT,
  risk_impact         TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED')),
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  decision_notes      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, change_code)
);
CREATE INDEX IF NOT EXISTS idx_change_req_proj ON project_change_requests(project_id, status);

-- 9. Reusable Approval Engine
CREATE TABLE IF NOT EXISTS project_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type         VARCHAR(50) NOT NULL CHECK (entity_type IN ('DELIVERABLE', 'CHANGE_REQUEST', 'PURCHASE_REQUEST', 'INVOICE', 'DRAWING', 'VARIATION', 'MILESTONE', 'CONTRACT', 'INSPECTION')),
  entity_id           UUID NOT NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  workflow_type       VARCHAR(30) NOT NULL DEFAULT 'SEQUENTIAL' CHECK (workflow_type IN ('SEQUENTIAL', 'PARALLEL', 'SINGLE_SIGNER')),
  status              VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requester_id        UUID NOT NULL REFERENCES users(id),
  current_step        INTEGER NOT NULL DEFAULT 1,
  total_steps         INTEGER NOT NULL DEFAULT 1,
  due_date            DATE,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approvals_entity ON project_approvals(tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS project_approval_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_id         UUID NOT NULL REFERENCES project_approvals(id) ON DELETE CASCADE,
  step_number         INTEGER NOT NULL DEFAULT 1,
  approver_role       VARCHAR(50),
  approver_user_id    UUID REFERENCES users(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
  decision            VARCHAR(30),
  comments            TEXT,
  signature_envelope_id UUID,
  decided_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_steps ON project_approval_steps(approval_id, step_number);

-- 10. Procurement & Supply Chain
CREATE TABLE IF NOT EXISTS project_purchase_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_package_id     UUID REFERENCES project_work_packages(id) ON DELETE SET NULL,
  cost_code_id        UUID REFERENCES project_cost_codes(id) ON DELETE SET NULL,
  req_number          VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_estimated_cost NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'RFQ_ISSUED', 'PO_CREATED', 'REJECTED', 'CANCELLED')),
  requested_by        UUID NOT NULL REFERENCES users(id),
  approved_by         UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, req_number)
);
CREATE INDEX IF NOT EXISTS idx_purch_req_proj ON project_purchase_requests(project_id, status);

CREATE TABLE IF NOT EXISTS project_rfqs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_request_id UUID REFERENCES project_purchase_requests(id) ON DELETE SET NULL,
  rfq_number          VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  submission_deadline DATE NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'EVALUATION', 'AWARDED', 'CLOSED', 'CANCELLED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, rfq_number)
);

CREATE TABLE IF NOT EXISTS project_rfq_suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_id              UUID NOT NULL REFERENCES project_rfqs(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  quoted_amount       NUMERIC(16,4),
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  quote_document_id   UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  is_awarded          BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_purchase_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfq_id              UUID REFERENCES project_rfqs(id) ON DELETE SET NULL,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_number           VARCHAR(50) NOT NULL,
  items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount        NUMERIC(16,4) NOT NULL DEFAULT 0.0000,
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  status              VARCHAR(30) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'INVOICED', 'CLOSED', 'CANCELLED')),
  delivery_due_date   DATE,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, po_number)
);

CREATE TABLE IF NOT EXISTS project_goods_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  purchase_order_id   UUID NOT NULL REFERENCES project_purchase_orders(id) ON DELETE RESTRICT,
  grn_number          VARCHAR(50) NOT NULL,
  received_items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  inspection_status   VARCHAR(30) NOT NULL DEFAULT 'PASSED' CHECK (inspection_status IN ('PENDING', 'PASSED', 'REJECTED_DEFECTIVE', 'ACCEPTED_WITH_CONCESSION')),
  inspector_id        UUID NOT NULL REFERENCES users(id),
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, grn_number)
);

-- 11. Resource & Equipment Management
CREATE TABLE IF NOT EXISTS project_resources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_type       VARCHAR(50) NOT NULL CHECK (resource_type IN ('PERSONNEL', 'EQUIPMENT', 'HEAVY_MACHINERY', 'VEHICLE', 'FACILITY', 'TOOL', 'MATERIAL')),
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50) NOT NULL,
  category            VARCHAR(100),
  model_or_specs      TEXT,
  serial_number       VARCHAR(100),
  cost_rate           NUMERIC(14,4) NOT NULL DEFAULT 0.0000, -- Internal hourly or daily cost
  billing_rate        NUMERIC(14,4) NOT NULL DEFAULT 0.0000, -- Client charge rate
  rate_unit           VARCHAR(20) NOT NULL DEFAULT 'HOUR' CHECK (rate_unit IN ('HOUR', 'DAY', 'WEEK', 'MONTH', 'UNIT')),
  currency            VARCHAR(10) NOT NULL DEFAULT 'TZS',
  owner_vendor_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL, -- Null if internally owned
  status              VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ALLOCATED', 'MAINTENANCE', 'DECOMMISSIONED')),
  availability_calendar JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_resources_tenant ON project_resources(tenant_id, resource_type, status);

CREATE TABLE IF NOT EXISTS project_resource_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id             UUID REFERENCES tasks(id) ON DELETE SET NULL,
  resource_id         UUID NOT NULL REFERENCES project_resources(id) ON DELETE RESTRICT,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  allocation_pct      INTEGER NOT NULL DEFAULT 100,
  allocated_cost      NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  status              VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'RELEASED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_res_alloc_proj ON project_resource_allocations(project_id, resource_id, start_date, end_date);

-- 12. Modular Industry Pack Data
CREATE TABLE IF NOT EXISTS project_industry_data (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  industry            VARCHAR(50) NOT NULL, -- e.g. 'construction', 'engineering', 'manufacturing', 'real_estate', 'mining', 'ngo', 'pharma', 'it', 'devops', 'agency'
  entity_type         VARCHAR(50) NOT NULL, -- e.g. 'BOQ_ITEM', 'RFI', 'DAILY_SITE_LOG', 'INSPECTION', 'NCR', 'PUNCH_LIST', 'BOM', 'WORK_ORDER', 'SPRINT', 'LOGFRAME_INDICATOR', 'SOP_VALIDATION'
  entity_code         VARCHAR(50) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  data                JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, entity_type, entity_code)
);
CREATE INDEX IF NOT EXISTS idx_industry_data_lookup ON project_industry_data(project_id, industry, entity_type);

-- 13. Enable & Force Row Level Security (RLS) across all new tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'project_portfolios', 'project_programs', 'project_phases', 'project_work_packages',
    'project_deliverables', 'project_cost_codes', 'project_budgets', 'project_budget_lines',
    'project_evm_snapshots', 'project_risks', 'project_issues', 'project_change_requests',
    'project_approvals', 'project_approval_steps', 'project_purchase_requests', 'project_rfqs',
    'project_rfq_suppliers', 'project_purchase_orders', 'project_goods_receipts',
    'project_resources', 'project_resource_allocations', 'project_industry_data'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid);', tbl);
  END LOOP;
END $$;
