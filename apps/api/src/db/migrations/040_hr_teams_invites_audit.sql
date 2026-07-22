-- ── Migration 040: HR Teams, Invitations, Delete Requests, Login History, Devices, Activity Log ──

-- Cross-functional teams
CREATE TABLE IF NOT EXISTS hr_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  lead_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_teams_tenant ON hr_teams(tenant_id);

CREATE TABLE IF NOT EXISTS hr_team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES hr_teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_team_members_team ON hr_team_members(team_id);

-- Staff invitations
CREATE TABLE IF NOT EXISTS hr_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL,
  token       VARCHAR(64) NOT NULL UNIQUE,
  invited_by  UUID REFERENCES users(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING|ACCEPTED|EXPIRED|REVOKED
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_invitations_tenant ON hr_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_invitations_token  ON hr_invitations(token);

-- Account deletion requests
CREATE TABLE IF NOT EXISTS hr_delete_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING|APPROVED|REJECTED
  decided_by   UUID REFERENCES users(id),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_delete_requests_tenant ON hr_delete_requests(tenant_id);

-- Login history (populated from the real login path going forward)
CREATE TABLE IF NOT EXISTS hr_login_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip         VARCHAR(64),
  user_agent TEXT,
  status     VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',  -- SUCCESS|FAILED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_login_history_tenant ON hr_login_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_login_history_user   ON hr_login_history(user_id);

-- Known devices, derived from user_agent on login (upserted by user_id + user_agent)
CREATE TABLE IF NOT EXISTS hr_devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label VARCHAR(200) NOT NULL,
  device_type  VARCHAR(50) NOT NULL DEFAULT 'Desktop',  -- Desktop|Mobile|Tablet
  user_agent   TEXT,
  trusted      BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, user_agent)
);
CREATE INDEX IF NOT EXISTS idx_hr_devices_tenant ON hr_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_devices_user   ON hr_devices(user_id);

-- HR-module activity log (leave approvals, role changes, staff status changes, payroll status changes)
CREATE TABLE IF NOT EXISTS hr_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(300) NOT NULL,
  module     VARCHAR(100) NOT NULL DEFAULT 'HR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_activity_log_tenant ON hr_activity_log(tenant_id);
