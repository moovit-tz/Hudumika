-- Migration 027: NexusHR Performance & Wellness Schema

-- Goals (OKRs & KPIs)
CREATE TABLE IF NOT EXISTS hr_goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id       UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  parent_goal_id UUID REFERENCES hr_goals(id) ON DELETE SET NULL, -- Cascading OKR tree
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  goal_type      VARCHAR(50) NOT NULL DEFAULT 'OKR_OBJECTIVE', -- OKR_OBJECTIVE, OKR_KEY_RESULT, KPI_METRIC, INDIVIDUAL
  target_value   NUMERIC(14,2) NOT NULL DEFAULT 100,
  current_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit           VARCHAR(50) NOT NULL DEFAULT '%', -- %, TZS, USD, COUNT, BOOLEAN
  weight         INTEGER NOT NULL DEFAULT 1,
  due_date       DATE,
  status         VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, ACTIVE, AT_RISK, ACHIEVED, MISSED, CANCELLED
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_goals_tenant ON hr_goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_goals_owner ON hr_goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_hr_goals_parent ON hr_goals(parent_goal_id);

-- Goal Check-ins
CREATE TABLE IF NOT EXISTS hr_goal_checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id       UUID NOT NULL REFERENCES hr_goals(id) ON DELETE CASCADE,
  current_value NUMERIC(14,2) NOT NULL,
  status        VARCHAR(50) NOT NULL,
  comment       TEXT,
  recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_goal_checkins_tenant ON hr_goal_checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_goal_checkins_goal ON hr_goal_checkins(goal_id);

-- Review Cycles
CREATE TABLE IF NOT EXISTS hr_review_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  type          VARCHAR(50) NOT NULL DEFAULT 'ANNUAL', -- ANNUAL, SEMI_ANNUAL, QUARTERLY, PROBATION
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SELF_REVIEW, MANAGER_REVIEW, CALIBRATION, RELEASED, CLOSED
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_review_cycles_tenant ON hr_review_cycles(tenant_id);

-- Review Templates
CREATE TABLE IF NOT EXISTS hr_review_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(150) NOT NULL,
  sections     JSONB NOT NULL DEFAULT '[]'::jsonb, -- competency questions, goals rollup
  rating_scale JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g., 1-5 labels
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_rev_templates_tenant ON hr_review_templates(tenant_id);

-- Review Instances (Individual reviews)
CREATE TABLE IF NOT EXISTS hr_review_instances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id       UUID NOT NULL REFERENCES hr_review_cycles(id) ON DELETE CASCADE,
  template_id    UUID NOT NULL REFERENCES hr_review_templates(id) ON DELETE RESTRICT,
  employment_id  UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  self_rating    NUMERIC(3,2),
  manager_rating NUMERIC(3,2),
  final_rating   NUMERIC(3,2), -- Calibrated rating
  self_response  JSONB NOT NULL DEFAULT '{}'::jsonb,
  manager_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  calibration_notes TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cycle_id, employment_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_rev_instances_tenant ON hr_review_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_rev_instances_emp ON hr_review_instances(employment_id);

-- Continuous Feedback Notes
CREATE TABLE IF NOT EXISTS hr_feedback_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  recipient_id   UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  is_visible_to_manager BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_feedback_tenant ON hr_feedback_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_feedback_recipient ON hr_feedback_notes(recipient_id);

-- Survey Templates (Employee Wellness/Engagement)
CREATE TABLE IF NOT EXISTS hr_survey_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  questions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_survey_templates_tenant ON hr_survey_templates(tenant_id);

-- Survey Instances (Scheduled campaigns)
CREATE TABLE IF NOT EXISTS hr_survey_instances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES hr_survey_templates(id) ON DELETE CASCADE,
  status      VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, CLOSED
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_survey_instances_tenant ON hr_survey_instances(tenant_id);

-- Survey Responses
CREATE TABLE IF NOT EXISTS hr_survey_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES hr_survey_instances(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_survey_responses_tenant ON hr_survey_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_survey_responses_inst ON hr_survey_responses(instance_id);

-- Wellness Programs
CREATE TABLE IF NOT EXISTS hr_wellness_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_wellness_tenant ON hr_wellness_programs(tenant_id);
