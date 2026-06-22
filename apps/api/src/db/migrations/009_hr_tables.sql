-- ── Migration 009: HR Module Tables ──────────────────────────────────────────

-- Departments
CREATE TABLE IF NOT EXISTS hr_departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  head_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_departments_tenant ON hr_departments(tenant_id);

-- Designations (job titles)
CREATE TABLE IF NOT EXISTS hr_designations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_designations_tenant ON hr_designations(tenant_id);

-- Shift definitions
CREATE TABLE IF NOT EXISTS hr_shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  break_minutes  INTEGER NOT NULL DEFAULT 0,
  color          VARCHAR(20) NOT NULL DEFAULT '#0891b2',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_shifts_tenant ON hr_shifts(tenant_id);

-- Shift assignments (employee → day → shift)
CREATE TABLE IF NOT EXISTS hr_shift_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id   UUID NOT NULL REFERENCES hr_shifts(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_hr_shift_assign_tenant ON hr_shift_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_shift_assign_user   ON hr_shift_assignments(user_id);

-- Daily attendance
CREATE TABLE IF NOT EXISTS hr_attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PRESENT',  -- PRESENT|ABSENT|LATE|HALF_DAY|ON_LEAVE
  clock_in     TIME,
  clock_out    TIME,
  notes        TEXT,
  recorded_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_tenant ON hr_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_user   ON hr_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date   ON hr_attendance(date);

-- Leave requests
CREATE TABLE IF NOT EXISTS hr_leaves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(100) NOT NULL,
  from_date   DATE NOT NULL,
  to_date     DATE NOT NULL,
  days        INTEGER NOT NULL,
  reason      TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING|APPROVED|REJECTED|CANCELLED
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_tenant ON hr_leaves(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_user   ON hr_leaves(user_id);

-- Monthly payroll
CREATE TABLE IF NOT EXISTS hr_payroll (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month  INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year   INTEGER NOT NULL,
  basic_pay     NUMERIC(14,2) NOT NULL DEFAULT 0,
  allowances    NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING|PROCESSING|PAID
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, period_month, period_year)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_tenant ON hr_payroll(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_user   ON hr_payroll(user_id);

-- Company announcements
CREATE TABLE IF NOT EXISTS hr_announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title      VARCHAR(300) NOT NULL,
  body       TEXT NOT NULL,
  category   VARCHAR(100) NOT NULL DEFAULT 'General',
  audience   VARCHAR(100) NOT NULL DEFAULT 'All Staff',
  author_id  UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_announcements_tenant ON hr_announcements(tenant_id);

-- Public and company holidays
CREATE TABLE IF NOT EXISTS hr_holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  name       VARCHAR(200) NOT NULL,
  type       VARCHAR(50) NOT NULL DEFAULT 'Public',  -- Public|Company
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);
CREATE INDEX IF NOT EXISTS idx_hr_holidays_tenant ON hr_holidays(tenant_id);
