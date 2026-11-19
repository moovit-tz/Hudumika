-- Unified staff console: platform staff identity, roles, scopes, teams,
-- customer ownership, operational cases on platform_support_tickets,
-- incidents, controlled customer access sessions and history.
--
-- All tables here are platform-scoped. They are read and written only by
-- services/staff-access.service.ts and staff-console routes through
-- dbPlatform, after a staff permission check. RLS is ENABLED + FORCED with no
-- policy, so the restricted tenant role (hudumika_app) can never read them,
-- even with app.tenant_id set to a matching customer.
--
-- Workspace roles (users.role) are deliberately not consulted for staff
-- access. Existing SUPER_ADMIN users are bootstrapped below with the
-- SuperAdmin staff role, which is the only path into the console at first.

-- ── Roles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  permissions   TEXT[] NOT NULL DEFAULT '{}',
  default_home  TEXT NOT NULL DEFAULT 'my_work',
  broad_scope   BOOLEAN NOT NULL DEFAULT false,
  is_template   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ── Staff members ─────────────────────────────────────────────────────────
-- A staff membership sits alongside the user's workspace membership. It does
-- not give access to that or any other workspace's records by itself.
CREATE TABLE IF NOT EXISTS staff_members (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  title           TEXT,
  preferred_home  TEXT,
  available       BOOLEAN NOT NULL DEFAULT true,
  max_open_cases  INTEGER NOT NULL DEFAULT 25 CHECK (max_open_cases BETWEEN 1 AND 500),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_role_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES staff_members(user_id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES staff_roles(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  reason      TEXT NOT NULL DEFAULT '',
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_staff_role_grants_user ON staff_role_grants(user_id) WHERE revoked_at IS NULL;

-- Explicit allow / deny of single permissions. A deny always wins.
CREATE TABLE IF NOT EXISTS staff_permission_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES staff_members(user_id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  effect      TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  reason      TEXT NOT NULL DEFAULT '',
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_perm_overrides_user ON staff_permission_overrides(user_id) WHERE revoked_at IS NULL;

-- Direct product / customer scope for one person. effect 'deny' excludes a
-- product or customer even when a team or broad role would include it.
CREATE TABLE IF NOT EXISTS staff_scope_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES staff_members(user_id) ON DELETE CASCADE,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('product', 'customer', 'all_products', 'all_customers')),
  app_id      TEXT,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  effect      TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  reason      TEXT NOT NULL DEFAULT '',
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK ((scope_type = 'product' AND app_id IS NOT NULL AND tenant_id IS NULL)
      OR (scope_type = 'customer' AND tenant_id IS NOT NULL AND app_id IS NULL)
      OR (scope_type IN ('all_products', 'all_customers') AND app_id IS NULL AND tenant_id IS NULL AND effect = 'allow'))
);
CREATE INDEX IF NOT EXISTS idx_staff_scope_grants_user ON staff_scope_grants(user_id) WHERE revoked_at IS NULL;

-- ── Teams ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('product', 'portfolio', 'specialist')),
  description    TEXT NOT NULL DEFAULT '',
  -- Broad coverage must be set explicitly; it is never implied by kind.
  all_products   BOOLEAN NOT NULL DEFAULT false,
  all_customers  BOOLEAN NOT NULL DEFAULT false,
  is_fallback    BOOLEAN NOT NULL DEFAULT false,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_teams_one_fallback ON staff_teams(is_fallback) WHERE is_fallback AND active;

CREATE TABLE IF NOT EXISTS staff_team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES staff_teams(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES staff_members(user_id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('lead', 'member')),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ,
  removed_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_team_member_active ON staff_team_members(team_id, user_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS staff_team_products (
  team_id  UUID NOT NULL REFERENCES staff_teams(id) ON DELETE CASCADE,
  app_id   TEXT NOT NULL,
  PRIMARY KEY (team_id, app_id)
);

CREATE TABLE IF NOT EXISTS staff_team_customers (
  team_id    UUID NOT NULL REFERENCES staff_teams(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, tenant_id)
);

-- ── Customer ownership and service terms ─────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_customer_accounts (
  tenant_id               UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id           UUID REFERENCES staff_members(user_id) ON DELETE SET NULL,
  backup_owner_user_id    UUID REFERENCES staff_members(user_id) ON DELETE SET NULL,
  -- Service relationship: whether staff may open an access session on
  -- standing authorization, or need the customer's approval each time.
  standing_authorization  BOOLEAN NOT NULL DEFAULT false,
  max_session_minutes     INTEGER NOT NULL DEFAULT 60 CHECK (max_session_minutes BETWEEN 5 AND 480),
  notes                   TEXT NOT NULL DEFAULT '',
  updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (backup_owner_user_id IS NULL OR backup_owner_user_id <> owner_user_id)
);

CREATE TABLE IF NOT EXISTS staff_customer_contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  contact_role   TEXT NOT NULL DEFAULT 'primary' CHECK (contact_role IN ('primary', 'billing', 'technical', 'executive', 'escalation')),
  escalation_order INTEGER,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_customer_contacts_tenant ON staff_customer_contacts(tenant_id);

-- ── Assignment history (customers, cases, teams) ─────────────────────────
CREATE TABLE IF NOT EXISTS staff_assignment_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('customer', 'case', 'incident', 'team_member', 'role_grant', 'scope_grant', 'permission_override')),
  subject_id    TEXT NOT NULL,
  action        TEXT NOT NULL,
  from_user_id  UUID,
  to_user_id    UUID,
  from_team_id  UUID,
  to_team_id    UUID,
  detail        JSONB NOT NULL DEFAULT '{}',
  reason        TEXT NOT NULL DEFAULT '',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_assignment_history_subject ON staff_assignment_history(subject_type, subject_id, created_at DESC);

-- ── Operational cases: extend platform_support_tickets ───────────────────
-- The existing platform support queue (a workspace asking Hudumika for help)
-- is the case system. These columns add ownership, routing, SLA milestones
-- and a customer outcome that is separate from engineering resolution.
ALTER TABLE platform_support_tickets
  ADD COLUMN IF NOT EXISTS owner_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id                UUID REFERENCES staff_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity               TEXT NOT NULL DEFAULT 'S3' CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  ADD COLUMN IF NOT EXISTS escalated              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS routing_reason         TEXT,
  ADD COLUMN IF NOT EXISTS first_response_due_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_due_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_paused_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_paused_seconds     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_on             TEXT CHECK (waiting_on IN ('customer', 'engineering', 'third_party')),
  ADD COLUMN IF NOT EXISTS customer_outcome       TEXT NOT NULL DEFAULT 'pending' CHECK (customer_outcome IN ('pending', 'confirmed', 'not_resolved')),
  ADD COLUMN IF NOT EXISTS outcome_verified_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incident_id            UUID,
  ADD COLUMN IF NOT EXISTS version                INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_pst_owner ON platform_support_tickets(owner_user_id) WHERE status IN ('OPEN', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_pst_team ON platform_support_tickets(team_id) WHERE status IN ('OPEN', 'IN_PROGRESS');

-- Internal notes live beside customer-visible replies; only 'customer'
-- messages are returned by the workspace-side support routes.
ALTER TABLE platform_support_messages
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer', 'internal'));

CREATE TABLE IF NOT EXISTS platform_case_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES platform_support_tickets(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_case_events_ticket ON platform_case_events(ticket_id, created_at);

-- ── SLA policy and business hours ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_sla_policies (
  priority                TEXT PRIMARY KEY CHECK (priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW')),
  first_response_minutes  INTEGER NOT NULL CHECK (first_response_minutes > 0),
  resolution_minutes      INTEGER NOT NULL CHECK (resolution_minutes > 0),
  business_hours_only     BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO staff_sla_policies (priority, first_response_minutes, resolution_minutes, business_hours_only) VALUES
  ('URGENT', 60, 480, false), ('HIGH', 240, 1440, true), ('NORMAL', 480, 2880, true), ('LOW', 960, 7200, true)
ON CONFLICT (priority) DO NOTHING;

CREATE TABLE IF NOT EXISTS staff_business_hours (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone    TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  -- ISO weekdays 1 (Mon) … 7 (Sun)
  work_days   INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_minute INTEGER NOT NULL DEFAULT 480 CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute   INTEGER NOT NULL DEFAULT 1020 CHECK (end_minute BETWEEN 1 AND 1440),
  holidays    DATE[] NOT NULL DEFAULT '{}',
  CHECK (end_minute > start_minute)
);
INSERT INTO staff_business_hours (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Routing rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_routing_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 100,
  app_id      TEXT,
  category    TEXT,
  priority    TEXT,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES staff_teams(id) ON DELETE CASCADE,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Incidents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_incidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL UNIQUE,
  app_id        TEXT NOT NULL,
  title         TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'S2' CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  status        TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  -- Engineering record. A resolved Lens item never closes customer cases.
  lens_item_id  UUID REFERENCES lens_items(id) ON DELETE SET NULL,
  -- Customer-visible summary: only text an operator explicitly approved.
  public_summary TEXT,
  public_summary_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  public_summary_approved_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id       UUID REFERENCES staff_teams(id) ON DELETE SET NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_incident_customers (
  incident_id  UUID NOT NULL REFERENCES platform_incidents(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, tenant_id)
);
ALTER TABLE platform_support_tickets
  DROP CONSTRAINT IF EXISTS platform_support_tickets_incident_fk;
ALTER TABLE platform_support_tickets
  ADD CONSTRAINT platform_support_tickets_incident_fk FOREIGN KEY (incident_id) REFERENCES platform_incidents(id) ON DELETE SET NULL;

-- ── Controlled customer access sessions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_access_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id          TEXT,
  actions         TEXT[] NOT NULL CHECK (cardinality(actions) > 0),
  purpose         TEXT NOT NULL CHECK (char_length(purpose) BETWEEN 5 AND 1000),
  case_id         UUID REFERENCES platform_support_tickets(id) ON DELETE SET NULL,
  basis           TEXT NOT NULL CHECK (basis IN ('customer_approval', 'standing_authorization')),
  status          TEXT NOT NULL CHECK (status IN ('pending_approval', 'active', 'ended', 'revoked', 'expired', 'denied')),
  requested_minutes INTEGER NOT NULL CHECK (requested_minutes BETWEEN 5 AND 480),
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  ended_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  end_reason      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_access_sessions_staff ON staff_access_sessions(staff_user_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_access_sessions_tenant ON staff_access_sessions(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_access_one_live ON staff_access_sessions(staff_user_id) WHERE status IN ('pending_approval', 'active');

CREATE TABLE IF NOT EXISTS staff_access_session_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES staff_access_sessions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  resource    TEXT,
  outcome     TEXT NOT NULL CHECK (outcome IN ('ok', 'denied', 'error')),
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_access_events_session ON staff_access_session_events(session_id, created_at);

-- ── Staff audit (consequential staff actions) ────────────────────────────
-- Separate from platform_operator_audit (which needs an affected tenant):
-- permission changes, exports and settings changes may have none.
CREATE TABLE IF NOT EXISTS staff_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  app_id        TEXT,
  purpose       TEXT,
  outcome       TEXT NOT NULL CHECK (outcome IN ('ok', 'denied', 'error')),
  detail        JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_audit_created ON staff_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_audit_actor ON staff_audit_log(actor_user_id, created_at DESC);

-- ── Platform-only: no tenant policy, so hudumika_app sees nothing ───────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_roles', 'staff_members', 'staff_role_grants', 'staff_permission_overrides', 'staff_scope_grants',
    'staff_teams', 'staff_team_members', 'staff_team_products', 'staff_team_customers', 'staff_customer_accounts', 'staff_customer_contacts',
    'staff_assignment_history', 'platform_case_events', 'staff_sla_policies', 'staff_business_hours', 'staff_routing_rules',
    'platform_incidents', 'platform_incident_customers', 'staff_access_sessions', 'staff_access_session_events', 'staff_audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ── Seed role templates ──────────────────────────────────────────────────
-- Kept in step with packages/types/src/staff.ts STAFF_ROLE_TEMPLATES; the
-- API re-syncs templates it finds missing at startup, never overwriting an
-- edited role.
INSERT INTO staff_roles (key, name, description, permissions, default_home, broad_scope, is_template) VALUES
  ('superadmin', 'SuperAdmin', 'Everything, across every product and customer.', '{}', 'platform', true, true)
ON CONFLICT (key) DO NOTHING;

-- ── Bootstrap: existing SUPER_ADMIN users become SuperAdmin staff ───────
INSERT INTO staff_members (user_id, status, title)
SELECT u.id, 'active', 'SuperAdmin (migrated)'
FROM users u WHERE u.role = 'SUPER_ADMIN' AND u.active IS NOT FALSE
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO staff_role_grants (user_id, role_id, reason)
SELECT m.user_id, r.id, 'Migrated from users.role = SUPER_ADMIN (migration 919)'
FROM staff_members m JOIN users u ON u.id = m.user_id AND u.role = 'SUPER_ADMIN'
CROSS JOIN staff_roles r
WHERE r.key = 'superadmin'
  AND NOT EXISTS (SELECT 1 FROM staff_role_grants g WHERE g.user_id = m.user_id AND g.role_id = r.id AND g.revoked_at IS NULL);

-- ── Existing cases get SLA due times from their priority ─────────────────
UPDATE platform_support_tickets t
SET first_response_due_at = t.created_at + make_interval(mins => p.first_response_minutes),
    resolution_due_at = t.created_at + make_interval(mins => p.resolution_minutes)
FROM staff_sla_policies p
WHERE p.priority = t.priority AND t.first_response_due_at IS NULL;
-- A case that already has a staff reply has had its first response.
UPDATE platform_support_tickets t
SET first_response_at = m.first_at
FROM (SELECT ticket_id, min(created_at) AS first_at FROM platform_support_messages WHERE is_platform_staff GROUP BY ticket_id) m
WHERE m.ticket_id = t.id AND t.first_response_at IS NULL;
