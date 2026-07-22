-- Migration 024: NexusHR Core Schema

-- Legal Entities (Subsidiaries)
CREATE TABLE IF NOT EXISTS hr_legal_entities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name        VARCHAR(255) NOT NULL,
  registration_no   VARCHAR(100),
  tax_id            VARCHAR(100),
  country_code      VARCHAR(2) NOT NULL, -- ISO 2-letter code
  currency          VARCHAR(3) NOT NULL DEFAULT 'TZS',
  registered_address TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_legal_entities_tenant ON hr_legal_entities(tenant_id);

-- Physical Locations / Sites
CREATE TABLE IF NOT EXISTS hr_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  timezone    VARCHAR(100) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_locations_tenant ON hr_locations(tenant_id);

-- Cost Centers (for financial allocation)
CREATE TABLE IF NOT EXISTS hr_cost_centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_hr_cost_centers_tenant ON hr_cost_centers(tenant_id);

-- Job Catalog (Reusable Job Profiles)
CREATE TABLE IF NOT EXISTS hr_job_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  job_grade   VARCHAR(50), -- e.g. Grade 1-10
  job_family  VARCHAR(100), -- e.g. Operations, Finance, IT
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_job_catalog_tenant ON hr_job_catalog(tenant_id);

-- People (Personal Records)
CREATE TABLE IF NOT EXISTS hr_people (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name          VARCHAR(150) NOT NULL,
  last_name           VARCHAR(150) NOT NULL,
  preferred_name      VARCHAR(150),
  date_of_birth       DATE,
  gender              VARCHAR(50),
  personal_email      VARCHAR(255),
  personal_phone      VARCHAR(50),
  national_identifiers JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. NIDA, SSN, Passport
  emergency_contacts  JSONB NOT NULL DEFAULT '[]'::jsonb,
  avatar_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_people_tenant ON hr_people(tenant_id);

-- Employments (Relation between Person & Legal Entity)
CREATE TABLE IF NOT EXISTS hr_employments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id      UUID NOT NULL REFERENCES hr_people(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES hr_legal_entities(id) ON DELETE RESTRICT,
  status         VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, ON_LEAVE, TERMINATED, PENDING_START
  employment_type VARCHAR(50) NOT NULL DEFAULT 'FULL_TIME', -- FULL_TIME, PART_TIME, CONTRACTOR, INTERN
  start_date     DATE NOT NULL,
  end_date       DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_employments_tenant ON hr_employments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_employments_person ON hr_employments(person_id);

-- Employment Effective Records (Effective-dated changes log)
CREATE TABLE IF NOT EXISTS hr_employment_effective_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employment_id  UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  end_date       DATE,
  job_title      VARCHAR(200) NOT NULL,
  department_id  UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  location_id    UUID REFERENCES hr_locations(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES hr_cost_centers(id) ON DELETE SET NULL,
  manager_id     UUID REFERENCES hr_employments(id) ON DELETE SET NULL, -- reports to
  change_reason  VARCHAR(200), -- PROMOTION, TRANSFER, COMP_REVIEW, NEW_HIRE
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_effective_records_tenant ON hr_employment_effective_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_effective_records_employment ON hr_employment_effective_records(employment_id);

-- Compensations (Salary details)
CREATE TABLE IF NOT EXISTS hr_compensations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employment_id  UUID NOT NULL REFERENCES hr_employments(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  end_date       DATE,
  base_salary    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(3) NOT NULL DEFAULT 'TZS',
  pay_frequency  VARCHAR(50) NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, BIWEEKLY, HOURLY
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_compensations_tenant ON hr_compensations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_compensations_employment ON hr_compensations(employment_id);

-- Compensation Components (Allowances, Bonuses, Commissions)
CREATE TABLE IF NOT EXISTS hr_compensation_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compensation_id UUID NOT NULL REFERENCES hr_compensations(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(50) NOT NULL, -- ALLOWANCE, BONUS, COMMISSION
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_taxable      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_comp_components_tenant ON hr_compensation_components(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_comp_components_comp ON hr_compensation_components(compensation_id);
