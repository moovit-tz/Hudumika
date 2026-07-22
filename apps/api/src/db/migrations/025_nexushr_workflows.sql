-- Migration 025: NexusHR Generic Workflow Engine Schema

-- Workflow Definitions
CREATE TABLE IF NOT EXISTS hr_workflow_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  category     VARCHAR(50) NOT NULL, -- ONBOARDING, OFFBOARDING, LEAVE, APPOINTMENT
  trigger_event VARCHAR(100), -- e.g. EMPLOYMENT_CREATED, LEAVE_SUBMITTED
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_wf_definitions_tenant ON hr_workflow_definitions(tenant_id);

-- Workflow Stages
CREATE TABLE IF NOT EXISTS hr_workflow_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id UUID NOT NULL REFERENCES hr_workflow_definitions(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  sort_order    INTEGER NOT NULL,
  stage_type    VARCHAR(50) NOT NULL DEFAULT 'TASK', -- TASK, APPROVAL, NOTIFICATION, INTEGRATION
  assignee_rule VARCHAR(100) NOT NULL, -- SPECIFIC_USER, MANAGER, ROLE_HR, ROLE_FINANCE, EMPLOYEE
  specific_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sla_hours     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(definition_id, sort_order)
);
CREATE INDEX IF NOT EXISTS idx_hr_wf_stages_tenant ON hr_workflow_stages(tenant_id);

-- Workflow Cases (Running instances)
CREATE TABLE IF NOT EXISTS hr_workflow_cases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id UUID NOT NULL REFERENCES hr_workflow_definitions(id) ON DELETE RESTRICT,
  subject_id    UUID NOT NULL, -- Generic reference (e.g., employment_id, leave_request_id)
  subject_type  VARCHAR(100) NOT NULL, -- e.g. EMPLOYMENT, LEAVE
  current_stage_id UUID REFERENCES hr_workflow_stages(id) ON DELETE SET NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, CANCELLED
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_wf_cases_tenant ON hr_workflow_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_wf_cases_subject ON hr_workflow_cases(subject_id);

-- Workflow Tasks
CREATE TABLE IF NOT EXISTS hr_workflow_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id        UUID NOT NULL REFERENCES hr_workflow_cases(id) ON DELETE CASCADE,
  stage_id       UUID NOT NULL REFERENCES hr_workflow_stages(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  assignee_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status         VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, SKIPPED
  due_date       TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_wf_tasks_tenant ON hr_workflow_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_wf_tasks_case ON hr_workflow_tasks(case_id);

-- Workflow Conditions (Branching logic)
CREATE TABLE IF NOT EXISTS hr_workflow_conditions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage_id       UUID NOT NULL REFERENCES hr_workflow_stages(id) ON DELETE CASCADE,
  field_name     VARCHAR(100) NOT NULL, -- e.g. country_code, base_salary
  operator       VARCHAR(20) NOT NULL, -- EQUALS, GREATER_THAN, LESS_THAN, IN
  value          TEXT NOT NULL,
  next_stage_id  UUID REFERENCES hr_workflow_stages(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_wf_conditions_tenant ON hr_workflow_conditions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_wf_conditions_stage ON hr_workflow_conditions(stage_id);
